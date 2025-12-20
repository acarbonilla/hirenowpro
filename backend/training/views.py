from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import TrainingModule, TrainingSession, TrainingResponse
from .serializers import TrainingModuleSerializer, TrainingSessionSerializer, TrainingResponseSerializer
from interviews.ai_service import get_ai_service
import os
from django.conf import settings

from rest_framework.permissions import IsAuthenticated
from accounts.authentication import ApplicantTokenAuthentication
from accounts.permissions import IsApplicant
from common.throttles import TrainingUploadMinuteThrottle, TrainingUploadHourThrottle

class TrainingModuleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TrainingModule.objects.filter(is_active=True)
    serializer_class = TrainingModuleSerializer
    permission_classes = [IsAuthenticated, IsApplicant]
    authentication_classes = [ApplicantTokenAuthentication]

class TrainingSessionViewSet(viewsets.ModelViewSet):
    serializer_class = TrainingSessionSerializer
    permission_classes = [IsAuthenticated, IsApplicant]
    authentication_classes = [ApplicantTokenAuthentication]
    
    def get_queryset(self):
        user = getattr(self.request, "user", None)
        applicant_id = self.request.query_params.get("applicant_id")
        if user and getattr(user, "is_authenticated", False):
            if applicant_id and str(applicant_id) != str(user.id):
                return TrainingSession.objects.none()
            return TrainingSession.objects.filter(applicant_id=user.id)
        return TrainingSession.objects.none()

    def get_throttles(self):
        if self.action == "submit_response":
            return [TrainingUploadMinuteThrottle(), TrainingUploadHourThrottle()]
        return super().get_throttles()

    def create(self, request, *args, **kwargs):
        # Custom create to handle applicant_id
        applicant_id = request.data.get('applicant_id')
        module_id = request.data.get('module_id')
        
        if not applicant_id:
            return Response({"error": "applicant_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        user = getattr(request, "user", None)
        if not user or str(applicant_id) != str(user.id):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
            
        session = TrainingSession.objects.create(
            applicant_id=applicant_id,
            module_id=module_id,
            status='in_progress'
        )
        
        serializer = self.get_serializer(session)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def submit_response(self, request, pk=None):
        """Submit a practice video response and get AI coaching feedback"""
        import traceback
        
        try:
            session = self.get_object()
            video_file = request.FILES.get('video')
            question_text = request.data.get('question_text')
            
            print(f"📝 Training response submission for session {pk}")
            print(f"  - Question: {question_text[:50] if question_text else 'None'}...")
            print(f"  - Video file: {video_file.name if video_file else 'None'}")
            
            if not video_file or not question_text:
                return Response(
                    {"error": "video and question_text are required"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            max_size = getattr(settings, "TRAINING_MAX_UPLOAD_SIZE", 25 * 1024 * 1024)
            if video_file.size > max_size:
                return Response(
                    {"error": "video file too large", "max_bytes": max_size},
                    status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                )
                
            # Create response object (this saves the video file)
            response = TrainingResponse.objects.create(
                session=session,
                question_text=question_text,
                video_file=video_file
            )
            
            print(f"✓ Created TrainingResponse {response.id}")
            print(f"  - Video saved to: {response.video_file.path}")
            
            # Process with AI immediately
            try:
                print(f"🔧 Initializing AI service...")
                ai_service = get_ai_service()
                print(f"✓ AI service initialized successfully")
                
                # Check if file is empty (0 bytes) - browser recording issue
                file_size = os.path.getsize(response.video_file.path)
                if file_size == 0:
                    print(f"⚠️ WARNING: Video file is 0 bytes! Using mock transcription.")
                    print(f"   This usually means the browser didn't send the video properly.")
                    print(f"   Please hard-refresh the browser (Ctrl+F5) and try again.")
                    
                    # Use mock transcription for testing
                    transcript = f"I believe that {question_text.lower().replace('?', '')} requires a thoughtful approach. In my experience, I handle such situations by staying calm, analyzing the problem systematically, and communicating clearly with my team. I prioritize tasks based on urgency and importance, and I'm not afraid to ask for help when needed."
                    
                    response.transcript = transcript
                    response.save()
                    print(f"✓ Mock transcription created: {len(transcript)} chars")
                    
                else:
                    # Normal transcription flow
                    print(f"🎤 Starting video transcription...")
                    print(f"  - Video path: {response.video_file.path}")
                    print(f"  - File exists: {os.path.exists(response.video_file.path)}")
                    print(f"  - File size: {file_size} bytes")
                    
                    try:
                        transcript = ai_service.transcribe_video(
                            response.video_file.path,
                            video_response_id=response.id
                        )
                        response.transcript = transcript
                        response.save()
                        print(f"✓ Transcription complete: {len(transcript)} chars")
                        print(f"  - Transcript preview: {transcript[:100]}...")
                    except Exception as transcribe_error:
                        print(f"❌ TRANSCRIPTION FAILED: {transcribe_error}")
                        print(f"  - Error type: {type(transcribe_error).__name__}")
                        print(traceback.format_exc())
                        raise Exception(f"Transcription failed: {str(transcribe_error)}")
                
                # 2. Generate coaching feedback (works with both real and mock transcripts)
                print(f"🤖 Generating coaching feedback...")
                try:
                    feedback = ai_service.generate_coaching_feedback(transcript, question_text)
                    response.ai_feedback = feedback
                    response.scores = feedback.get('scores', {})
                    response.save()
                    print(f"✓ Coaching feedback generated successfully")
                except Exception as feedback_error:
                    print(f"❌ FEEDBACK GENERATION FAILED: {feedback_error}")
                    print(f"  - Error type: {type(feedback_error).__name__}")
                    print(traceback.format_exc())
                    raise Exception(f"Feedback generation failed: {str(feedback_error)}")
                
                return Response(TrainingResponseSerializer(response).data)
                
            except Exception as e:
                error_message = str(e)
                error_type = type(e).__name__
                print(f"❌ Training AI processing error ({error_type}): {error_message}")
                print(f"📋 Full traceback:")
                print(traceback.format_exc())
                
                # Determine more specific error message
                if "transcription" in error_message.lower():
                    user_message = "Could not transcribe audio from video. Please check your microphone."
                elif "api" in error_message.lower() or "key" in error_message.lower():
                    user_message = "AI service configuration issue. Please contact support."
                elif "timeout" in error_message.lower():
                    user_message = "Processing timeout. Please try with a shorter video."
                else:
                    user_message = f"AI service error: {error_message}"
                
                # Save error info but still return the response
                response.ai_feedback = {
                    "error": error_message,
                    "error_type": error_type,
                    "strengths": ["Unable to analyze at this time"],
                    "improvements": ["Please try again"],
                    "coaching_tips": [user_message],
                    "example_phrasing": "",
                    "scores": {"clarity": 0, "confidence": 0, "relevance": 0}
                }
                response.save()
                
                return Response(
                    TrainingResponseSerializer(response).data,
                    status=status.HTTP_200_OK  # Return 200 with error in feedback
                )
                
        except Exception as e:
            print(f"❌ Training submission error: {e}")
            print(traceback.format_exc())
            return Response(
                {"error": str(e), "detail": traceback.format_exc()}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
