from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from accounts.permissions import IsApplicant
from common.permissions import IsHRUser
from rest_framework.settings import api_settings
from accounts.authentication import ApplicantTokenAuthentication, HRTokenAuthentication
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import ValidationError
from datetime import timedelta

from .models import Interview, InterviewQuestion, VideoResponse, JobPosition
from .type_models import PositionType, QuestionType
from .serializers import (
    InterviewListSerializer,
    InterviewSerializer,
    InterviewCreateSerializer,
    VideoResponseSerializer,
    VideoResponseCreateSerializer,
    InterviewAnalysisSerializer,
    InterviewQuestionSerializer,
    InterviewQuestionWriteSerializer,
    JobPositionSerializer,
    PublicJobPositionSerializer,
    HRDecisionSerializer,
)
from .type_serializers import JobCategorySerializer, QuestionTypeSerializer
from .type_serializers import JobCategorySerializer as PositionTypeSerializer
from .question_selection import select_questions_for_interview, select_questions_for_interview_with_metadata


class JobCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Job Categories
    """

    queryset = PositionType.objects.all().order_by('order', 'name')
    serializer_class = JobCategorySerializer
    permission_classes = [IsAuthenticated, IsHRUser]


    def get_permissions(self):
        """
        Allow authenticated users; write actions require staff/permission.
        """
        class ManageJobCategoriesPermission(IsAuthenticated):
            def has_permission(self_inner, request, view):
                if not super().has_permission(request, view):
                    return False
                # allow read for any authenticated HR/staff; allow write if staff or perm
                if request.method in ["GET", "HEAD", "OPTIONS"]:
                    return True
                user = request.user
                return bool(
                    getattr(user, "is_superuser", False)
                    or getattr(user, "is_staff", False)
                    or user.has_perm("interviews.manage_job_categories")
                )

        return [IsAuthenticated(), IsHRUser(), ManageJobCategoriesPermission()]

    def get_queryset(self):
        """Filter to active types only if requested"""
        queryset = super().get_queryset()
        code = self.request.query_params.get('code')
        if code:
            queryset = queryset.filter(code=code)
        if self.action in ['list', 'retrieve']:
            return queryset.filter(is_active=True)
        active_only = self.request.query_params.get('active_only', 'false').lower() == 'true'
        if active_only:
            queryset = queryset.filter(is_active=True)
        return queryset


class JobPositionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Job Positions (HR-only for write operations)
    """

    queryset = JobPosition.objects.all().select_related("category").prefetch_related("offices")
    serializer_class = JobPositionSerializer
    permission_classes = [IsAuthenticated, IsHRUser]
    authentication_classes = [HRTokenAuthentication, *api_settings.DEFAULT_AUTHENTICATION_CLASSES]

    def get_permissions(self):
        """
        Public read, HR-only write.
        """

        class ManageJobPositionsPermission(IsAuthenticated):
            def has_permission(self_inner, request, view):
                if not super().has_permission(request, view):
                    return False
                if request.method in ["GET", "HEAD", "OPTIONS"]:
                    return True
                user = request.user
                return bool(
                    getattr(user, "is_superuser", False)
                    or getattr(user, "is_staff", False)
                    or user.has_perm("interviews.add_jobposition")
                    or user.has_perm("interviews.change_jobposition")
                    or user.has_perm("interviews.delete_jobposition")
                )

        if self.action in ["list", "retrieve"]:
            return [AllowAny()]
        return [IsAuthenticated(), IsHRUser(), ManageJobPositionsPermission()]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return PublicJobPositionSerializer
        return JobPositionSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action in ["list", "retrieve"]:
            user = getattr(self.request, "user", None)
            if not user or not user.is_authenticated:
                qs = qs.filter(is_active=True)
        if self.request:
            code = self.request.query_params.get("code")
            active_only = self.request.query_params.get("active_only", "false").lower() == "true"
            if code:
                qs = qs.filter(code=code)
            if active_only:
                qs = qs.filter(is_active=True)
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class QuestionTypeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Question Types
    
    Endpoints:
    - GET /api/question-types/ - List all question types
    - POST /api/question-types/ - Create new question type
    - GET /api/question-types/{id}/ - Get question type details
    - PUT/PATCH /api/question-types/{id}/ - Update question type
    - DELETE /api/question-types/{id}/ - Delete question type
    """
    
    queryset = QuestionType.objects.all().order_by('order', 'name')
    serializer_class = QuestionTypeSerializer
    permission_classes = [IsAuthenticated, IsHRUser]
    
    def get_queryset(self):
        """Filter to active types only if requested"""
        queryset = super().get_queryset()
        active_only = self.request.query_params.get('active_only', 'false').lower() == 'true'
        if active_only:
            queryset = queryset.filter(is_active=True)
        return queryset


class PositionTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Position Types (lookup by code or by job position code)
    """

    queryset = PositionType.objects.all()
    serializer_class = PositionTypeSerializer
    permission_classes = [IsAuthenticated, IsHRUser]
    authentication_classes = [HRTokenAuthentication, *api_settings.DEFAULT_AUTHENTICATION_CLASSES]

    def get_queryset(self):
        qs = super().get_queryset()
        code = self.request.query_params.get("code")
        position_code = self.request.query_params.get("position_code")
        if code:
            qs = qs.filter(code=code)
        if position_code:
            qs = qs.filter(positions__code=position_code)
        return qs


class ApplicantInterviewViewSet(viewsets.ModelViewSet):
    """
    Applicant-facing interview viewset. Requires applicant token and restricts to own interviews.
    """

    serializer_class = InterviewSerializer
    authentication_classes = [ApplicantTokenAuthentication]
    permission_classes = [IsApplicant]
    queryset = Interview.objects.select_related("applicant", "position_type").prefetch_related("video_responses")

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, "user", None)
        if user and hasattr(user, "id"):
            qs = qs.filter(applicant_id=user.id)
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return InterviewCreateSerializer
        return super().get_serializer_class()

    def perform_create(self, serializer):
        applicant = getattr(self.request, "user", None)
        serializer.save(applicant=applicant)


class InterviewQuestionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Interview Questions
    
    Endpoints:
    - GET /api/questions/ - List all active questions
    - POST /api/questions/ - Create new question
    - GET /api/questions/{id}/ - Get question details
    - PUT/PATCH /api/questions/{id}/ - Update question
    - DELETE /api/questions/{id}/ - Delete question
    - GET /api/questions/?position=<id> - Filter by position type ID
    - GET /api/questions/?type=<id> - Filter by question type ID
    """
    
    queryset = InterviewQuestion.objects.select_related('question_type', 'position_type', 'category').filter(is_active=True).order_by('order')
    serializer_class = InterviewQuestionSerializer
    
    def get_permissions(self):
        """Allow anyone to list/retrieve questions, but require auth for create/update/delete"""
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]
    
    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return InterviewQuestionWriteSerializer
        return InterviewQuestionSerializer

    def get_queryset(self):
        """Filter questions based on query parameters"""
        queryset = super().get_queryset()
        
        # Filter by position type (accepts ID or code)
        position = self.request.query_params.get('position', None)
        if position:
            # Try to filter by ID first, if that fails, filter by code
            if position.isdigit():
                queryset = queryset.filter(position_type_id=int(position))
            else:
                queryset = queryset.filter(position_type__code=position)
        
        category = self.request.query_params.get('category', None)
        if category:
            if category.isdigit():
                queryset = queryset.filter(category_id=int(category))
            else:
                queryset = queryset.filter(category__code=category)
        
        # Filter by question type (accepts ID or code)
        question_type = self.request.query_params.get('type', None)
        if question_type:
            # Try to filter by ID first, if that fails, filter by code
            if question_type.isdigit():
                queryset = queryset.filter(question_type_id=int(question_type))
            else:
                queryset = queryset.filter(question_type__code=question_type)

        competency = self.request.query_params.get("competency")
        if competency:
            queryset = queryset.filter(competency=competency)
        
        return queryset.distinct()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print("QUESTION CREATE ERRORS:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        question = serializer.save()
        read_serializer = InterviewQuestionSerializer(question)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if not serializer.is_valid():
            print("QUESTION UPDATE ERRORS:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        question = serializer.save()
        read_serializer = InterviewQuestionSerializer(question)
        return Response(read_serializer.data)


class HRInterviewPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 50
    allowed_sizes = {10, 20, 50}

    def get_page_size(self, request):
        size = super().get_page_size(request)
        if size is None:
            return self.page_size
        if size > self.max_page_size:
            raise ValidationError("page_size cannot exceed 50.")
        if size not in self.allowed_sizes:
            return self.page_size
        return size


class InterviewViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Interview model
    
    Endpoints:
    - POST /api/interviews/ - Create new interview
    - GET /api/interviews/ - List all interviews
    - GET /api/interviews/{id}/ - Get interview details
    - POST /api/interviews/{id}/video-response/ - Upload video response
    - GET /api/interviews/{id}/analysis/ - Get interview analysis
    """
    
    queryset = Interview.objects.all()
    pagination_class = HRInterviewPagination
    
    def get_serializer_class(self):
        if self.action == "create":
            return InterviewCreateSerializer
        elif self.action == "analysis":
            return InterviewAnalysisSerializer
        elif self.action == "list":
            return InterviewListSerializer   # <── THIS FIXES YOUR TIMEOUT
        return InterviewSerializer

    
    authentication_classes = [HRTokenAuthentication, *api_settings.DEFAULT_AUTHENTICATION_CLASSES]
    permission_classes = [IsAuthenticated, IsHRUser]
    
    def get_queryset(self):
        qs = Interview.objects.all()

        if self.action == "list":
            qs = qs.select_related("applicant", "position_type").order_by("-created_at")

            status_param = (self.request.query_params.get("status") or "").lower()
            status_map = {
                "passed": "completed",  # treat completed interviews as passed for list filtering
                "failed": "failed",
                "processing": "processing",
                "submitted": "submitted",
            }
            if status_param in status_map:
                qs = qs.filter(status=status_map[status_param])

            range_param = (self.request.query_params.get("range") or "").lower()
            now = timezone.now()
            if range_param == "today":
                start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                qs = qs.filter(created_at__gte=start)
            elif range_param == "week":
                start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
                qs = qs.filter(created_at__gte=start)
            elif range_param == "month":
                start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                qs = qs.filter(created_at__gte=start)
            # NOTE: Do not allow arbitrary date ranges to avoid unbounded scans.
            # This list view must stay lightweight; do not add prefetch_related or heavy joins here.

            return qs

        return qs.select_related("applicant", "position_type") \
                .prefetch_related("video_responses") \
                .order_by("-created_at")

    
    def create(self, request, *args, **kwargs):
        """Create new interview"""
        print("DEBUG_INTERVIEW_CREATE_PAYLOAD:", request.data)
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print("DEBUG_INTERVIEW_ERRORS:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        interview = serializer.save()
        print("DEBUG_INTERVIEW_CREATED:", interview.id, interview.position_type_id)

        if interview.position_type_id:
            try:
                selected_questions, selection_metadata = select_questions_for_interview_with_metadata(interview)
            except ValueError as exc:
                interview.delete()
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            interview.selected_question_ids = [q.id for q in selected_questions]
            interview.selected_question_metadata = selection_metadata
            interview.save(update_fields=["selected_question_ids", "selected_question_metadata"])
            if hasattr(interview, "questions"):
                interview.questions.set(selected_questions)

        # Return full interview data with questions
        response_serializer = InterviewSerializer(interview)
        return Response(
            {
                'message': 'Interview created successfully',
                'interview': response_serializer.data
            },
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['post'], url_path='video-response', permission_classes=[IsAuthenticated, IsHRUser], authentication_classes=[HRTokenAuthentication, *api_settings.DEFAULT_AUTHENTICATION_CLASSES])
    def video_response(self, request, pk=None):
        """
        Upload video response WITHOUT immediate analysis
        Analysis happens in bulk after interview submission
        
        POST /api/interviews/{id}/video-response/
        Body: {
            "question_id": 1,
            "video_file_path": <file>,
            "duration": "00:02:30"
        }
        """
        interview = self.get_object()
        
        print(f"\n=== VIDEO UPLOAD REQUEST ===")
        print(f"Interview ID: {interview.id}")
        print(f"Interview Status: {interview.status}")
        print(f"Request Data: {request.data}")
        print(f"Request Files: {request.FILES}")
        
        # Check if interview is in valid state
        if interview.status in ['submitted', 'processing', 'completed']:
            return Response(
                {'error': 'Interview already submitted or completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update interview status to in_progress
        if interview.status == 'pending':
            interview.status = 'in_progress'
            interview.save()
        
        # Create video response
        serializer = VideoResponseCreateSerializer(data=request.data)
        if not serializer.is_valid():
            print(f"Serializer validation failed: {serializer.errors}")
            return Response(
                {'error': 'Invalid data', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer.is_valid(raise_exception=True)
        
        question_id = serializer.validated_data.get('question_id')
        if not question_id:
            return Response(
                {'error': 'question_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        question = get_object_or_404(InterviewQuestion, id=question_id, is_active=True)

        if question.position_type_id != interview.position_type_id:
            return Response(
                {'error': 'Invalid question for this position.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if response already exists for this question
        existing_response = VideoResponse.objects.filter(
            interview=interview,
            question=question
        ).first()
        
        if existing_response:
            return Response(
                {'error': 'A response for this question already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create video response with 'uploaded' status
        video_response = VideoResponse.objects.create(
            interview=interview,
            question=question,
            video_file_path=serializer.validated_data['video_file_path'],
            duration=serializer.validated_data['duration'],
            status='uploaded'
        )
        
        # IMMEDIATE TRANSCRIPTION: Use Deepgram STT to transcribe and store transcript
        # This is fast (~2-5 seconds) and doesn't wait for LLM analysis
        try:
            from .deepgram_service import get_deepgram_service
            
            print(f"🎤 Starting Deepgram transcription for video {video_response.id}...")
            deepgram_service = get_deepgram_service()
            
            # Transcribe video to text
            transcript_data = deepgram_service.transcribe_video(
                video_response.video_file_path.path,
                video_response_id=video_response.id
            )
            
            # Store transcript in database
            video_response.transcript = transcript_data['transcript']
            video_response.status = 'uploaded'  # Still uploaded, not analyzed yet
            video_response.save()
            
            print(f"✅ Transcript stored: {len(transcript_data['transcript'])} chars")
            
        except Exception as transcription_error:
            # Log error but don't fail the upload
            print(f"⚠️ Transcription failed (will retry on submit): {transcription_error}")
            video_response.transcript = ""  # Empty transcript, will be handled on submit
            video_response.save()
        
        response_data = VideoResponseSerializer(video_response).data
        
        return Response(
            {
                'message': 'Video uploaded and transcribed successfully. AI analysis will begin after interview submission.',
                'video_response': response_data,
                'transcript_ready': bool(video_response.transcript)
            },
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['get'], url_path='analysis', permission_classes=[IsAuthenticated, IsHRUser], authentication_classes=[HRTokenAuthentication, *api_settings.DEFAULT_AUTHENTICATION_CLASSES])
    def analysis(self, request, pk=None):
        """
        Get AI analysis results for interview
        
        GET /api/interviews/{id}/analysis/
        """
        interview = self.get_object()
        
        # Check if interview has video responses
        if not interview.video_responses.exists():
            return Response(
                {'error': 'No video responses found for this interview'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check AI processing status
        total_videos = interview.video_responses.count()
        processed_videos = interview.video_responses.filter(processed=True).count()
        videos_with_ai = sum(1 for v in interview.video_responses.all() if hasattr(v, 'ai_analysis'))
        
        ai_processing_complete = (total_videos > 0 and videos_with_ai == total_videos)
        
        serializer = InterviewAnalysisSerializer(interview)
        
        return Response({
            'analysis': serializer.data,
            'ai_processing_complete': ai_processing_complete,
            'processing_stats': {
                'total_videos': total_videos,
                'processed_videos': processed_videos,
                'videos_with_ai_analysis': videos_with_ai
            }
        })

    @action(detail=True, methods=['post'], url_path='decision')
    def decision(self, request, pk=None):
        """
        HR records final interview decision.

        POST /api/hr/interviews/{id}/decision/
        Body: {
            "decision": "hire" | "reject" | "hold",
            "hr_comment": "required for hold",
            "hold_until": "required for hold",
            "reopen_review": optional boolean
        }
        """
        interview = self.get_object()
        result = getattr(interview, "result", None)
        if result is None:
            return Response(
                {"detail": "Interview result not found for decision update."},
                status=status.HTTP_404_NOT_FOUND,
            )

        reopen_review = bool(request.data.get("reopen_review"))
        if result.hr_decision and not reopen_review:
            return Response(
                {"detail": "HR decision already recorded. Provide reopen_review to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = HRDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data["decision"]
        hr_comment = (serializer.validated_data.get("hr_comment") or "").strip()
        hold_until = serializer.validated_data.get("hold_until")

        interview.hr_decision = decision
        interview.hr_decision_reason = hr_comment
        interview.hr_decision_by = request.user
        interview.hr_decision_at = timezone.now()
        if decision == "hire":
            interview.status = "completed"
            interview.completed_at = interview.completed_at or timezone.now()
        elif decision == "reject":
            interview.status = "failed"
            interview.completed_at = interview.completed_at or timezone.now()
        interview.save()

        result.hr_decision = decision
        result.hr_comment = hr_comment
        result.hold_until = hold_until if decision == "hold" else None
        result.hr_decision_at = timezone.now()
        if decision in {"hire", "reject"}:
            result.final_decision = "hired" if decision == "hire" else "rejected"
            result.final_decision_date = timezone.now()
            result.final_decision_by = request.user
            result.final_decision_notes = hr_comment
            result.passed = decision == "hire"
        result.save()

        applicant = interview.applicant
        if decision == "hire":
            applicant.status = "hired"
            applicant.reapplication_date = None
        elif decision == "reject":
            applicant.status = "failed"
        elif decision == "hold":
            applicant.status = "in_review"
        applicant.save()

        return Response(
            {
                "message": f"HR decision recorded: {decision}",
                "interview_id": interview.id,
                "hr_decision": result.hr_decision,
                "hr_comment": result.hr_comment,
                "hold_until": result.hold_until,
                "hr_decision_at": result.hr_decision_at,
                "interview_status": interview.status,
                "applicant_id": applicant.id,
                "applicant_status": applicant.status,
                "result_id": result.id,
                "result_final_decision": result.final_decision,
            }
        )
    
    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """
        Submit entire interview for BULK processing
        All videos should already be uploaded
        Analysis happens in background after submission
        
        POST /api/interviews/{id}/submit/
        """
        interview = self.get_object()
        
        print(f"\n=== INTERVIEW SUBMISSION REQUEST ===")
        print(f"Interview ID: {interview.id}")
        print(f"Interview Status: {interview.status}")
        print(f"Position Type: {interview.position_type}")
        
        # Get total responses
        total_responses = interview.video_responses.count()
        print(f"Total video responses: {total_responses}")
        
        # Validate we have at least some responses
        if total_responses == 0:
            print(f"❌ Validation failed: No questions answered")
            return Response({
                'error': 'No questions have been answered',
                'answered': 0
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get the question IDs that were answered
        answered_question_ids = list(interview.video_responses.values_list('question_id', flat=True))
        print(f"Answered question IDs: {answered_question_ids}")
        
        # Check if all answered questions are valid and active
        valid_questions = InterviewQuestion.objects.filter(
            id__in=answered_question_ids,
            is_active=True
        ).count()
        print(f"Valid questions: {valid_questions} of {total_responses}")
        
        if valid_questions != total_responses:
            print(f"❌ Validation failed: Some invalid questions")
            return Response({
                'error': 'Some responses are for invalid questions',
                'answered': total_responses,
                'valid': valid_questions
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate minimum questions answered (at least 5 for position-based interviews)
        MINIMUM_QUESTIONS_REQUIRED = 5
        
        if interview.position_type:
            print(f"Checking minimum questions: {total_responses} >= {MINIMUM_QUESTIONS_REQUIRED}?")
            if total_responses < MINIMUM_QUESTIONS_REQUIRED:
                print(f"❌ Validation failed: Not enough questions answered")
                # Use the related PositionType name instead of a non-existent
                # get_position_type_display helper on Interview.
                position_name = getattr(interview.position_type, "name", None) or "Unknown position"
                return Response({
                    'error': f'Please answer at least {MINIMUM_QUESTIONS_REQUIRED} questions',
                    'answered': total_responses,
                    'required': MINIMUM_QUESTIONS_REQUIRED,
                    'position': position_name
                }, status=status.HTTP_400_BAD_REQUEST)
        
        print(f"✅ All validations passed!")
        
        # Mark interview as submitted and start processing
        from django.utils import timezone
        interview.status = 'submitted'
        interview.submission_date = timezone.now()
        interview.save()
        try:
            applicant = interview.applicant
            if applicant:
                applicant.interview_completed = True
                applicant.save(update_fields=["interview_completed"])
        except Exception:
            pass
        
        # Create processing queue entry
        from processing.models import ProcessingQueue
        queue_entry = ProcessingQueue.objects.create(
            interview=interview,
            processing_type='bulk_analysis',
            status='pending'
        )
        
        
        try:
            from .tasks import analyze_interview
            from django.db import transaction

            def queue_celery_task():
                analyze_interview.delay(interview.id)
                print(f"Celery task queued for interview {interview.id}")

            transaction.on_commit(queue_celery_task)
        except Exception as e:
            print(f"Non-fatal: failed to queue analysis task for interview {interview.id}: {e}")

        return Response({
            'message': 'Interview submitted successfully. AI analysis in progress.',
            'queue_id': queue_entry.id,
            'status': 'processing',
            'estimated_completion_minutes': 2
        })
    
    @action(detail=True, methods=['get'], url_path='processing-status')
    def processing_status(self, request, pk=None):
        """
        Check bulk processing status
        
        GET /api/interviews/{id}/processing-status/
        """
        interview = self.get_object()
        
        # Get processing queue entry
        from processing.models import ProcessingQueue
        try:
            queue_entry = ProcessingQueue.objects.filter(
                interview=interview,
                processing_type='bulk_analysis'
            ).latest('created_at')
        except ProcessingQueue.DoesNotExist:
            return Response({
                'error': 'No processing queue found for this interview'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Calculate progress
        total_videos = interview.video_responses.count()
        processed_videos = interview.video_responses.filter(status='analyzed').count()
        remaining = total_videos - processed_videos
        
        # Estimate time remaining (assume 10 seconds per video)
        estimated_seconds = remaining * 10
        
        if estimated_seconds < 60:
            estimated_time = f"{estimated_seconds} seconds"
        else:
            estimated_minutes = estimated_seconds // 60
            estimated_time = f"{estimated_minutes} minute{'s' if estimated_minutes > 1 else ''}"
        
        response_data = {
            'status': queue_entry.status,
            'progress': {
                'total_videos': total_videos,
                'processed': processed_videos,
                'remaining': remaining
            },
            'estimated_time_remaining': estimated_time
        }
        
        if queue_entry.status == 'completed':
            response_data['message'] = 'Processing complete! Redirecting to results...'
        elif queue_entry.status == 'failed':
            response_data['message'] = 'Processing failed. Please contact support.'
            response_data['error'] = queue_entry.error_message
        
        return Response(response_data)
    
    @action(detail=True, methods=['get'], url_path='video-responses')
    def list_video_responses(self, request, pk=None):
        """List all video responses for an interview"""
        interview = self.get_object()
        video_responses = interview.video_responses.all()
        serializer = VideoResponseSerializer(video_responses, many=True)
        
        return Response(serializer.data)
