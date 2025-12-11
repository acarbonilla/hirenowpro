"""
Views for interview results and HR review functionality
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import models

from .models import InterviewResult
from .serializers import (
    InterviewResultSerializer,
    InterviewResultListSerializer,
    FullReviewSerializer,
    ScoreOverrideSerializer,
    ComparisonReportSerializer,
    AuthenticityCheckSerializer,
    FinalDecisionSerializer
)
from interviews.models import Interview, VideoResponse

from .models import SystemSettings



class InterviewResultViewSet(viewsets.ModelViewSet):
    """
    ViewSet for InterviewResult model with HR review capabilities
    
    Endpoints:
    - GET /api/results/ - List all results
    - GET /api/results/{id}/ - Get result details
    - GET /api/results/{id}/full-review/ - Get complete Q&A for HR review
    - POST /api/results/{id}/override-score/ - HR override AI score
    - GET /api/results/{id}/comparison/ - Compare AI vs HR scores
    """
    
    queryset = InterviewResult.objects.all()
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return InterviewResultListSerializer
        elif self.action == 'full_review':
            return FullReviewSerializer
        elif self.action == 'override_score':
            return ScoreOverrideSerializer
        elif self.action == 'comparison':
            return ComparisonReportSerializer
        elif self.action == 'authenticity_check':
            return AuthenticityCheckSerializer
        elif self.action == 'final_decision':
            return FinalDecisionSerializer
        return InterviewResultSerializer
    
    def get_permissions(self):
        """Set permissions"""
        if self.action in ['list', 'retrieve', 'full_review']:
            return [AllowAny()]
        return [IsAuthenticated()]
    
    def get_queryset(self):
        """Filter results based on query parameters"""
        queryset = super().get_queryset()
        
        # Filter for review queue (exclude results with final decisions)
        review_queue = self.request.query_params.get('review_queue', None)
        if review_queue == 'true':
            # Only show results that need review:
            # 1. No final decision made yet
            # 2. Score in review range OR has AI-detected issues that need review
            from .models import SystemSettings
            passing_threshold = SystemSettings.get_passing_threshold()
            review_threshold = SystemSettings.get_review_threshold()
            
            queryset = queryset.filter(final_decision__isnull=True)
            # Further filter to scores that need review or applicants that failed AI but might be reconsidered
            queryset = queryset.filter(
                models.Q(final_score__gte=review_threshold, final_score__lt=passing_threshold) |  # Review range
                models.Q(passed=False, final_score__gte=review_threshold - 10)  # Failed but close enough to review
            )
        
        # Filter by final decision status
        final_decision = self.request.query_params.get('final_decision', None)
        if final_decision:
            if final_decision == 'pending':
                queryset = queryset.filter(final_decision__isnull=True)
            elif final_decision == 'decided':
                queryset = queryset.filter(final_decision__isnull=False)
            elif final_decision in ['hired', 'rejected']:
                queryset = queryset.filter(final_decision=final_decision)
        
        # Filter by recommendation
        recommendation = self.request.query_params.get('recommendation', None)
        if recommendation:
            if recommendation == 'hire':
                queryset = queryset.filter(passed=True)
            elif recommendation == 'reject':
                queryset = queryset.filter(passed=False)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from', None)
        if date_from:
            queryset = queryset.filter(result_date__gte=date_from)
        
        date_to = self.request.query_params.get('date_to', None)
        if date_to:
            queryset = queryset.filter(result_date__lte=date_to)
        
        # Filter by score range
        min_score = self.request.query_params.get('min_score', None)
        if min_score:
            queryset = queryset.filter(final_score__gte=float(min_score))
        
        max_score = self.request.query_params.get('max_score', None)
        if max_score:
            queryset = queryset.filter(final_score__lte=float(max_score))
        
        return queryset.select_related('interview__applicant', 'applicant', 'final_decision_by').order_by('-result_date')
    
    @action(detail=True, methods=['get'], url_path='full-review')
    def full_review(self, request, pk=None):
        """
        Get complete interview data for HR review
        Includes: Questions, Answers, Transcripts, AI Scores
        
        GET /api/results/{id}/full-review/
        """
        result = self.get_object()
        interview = result.interview
        
        # Build review data
        review_data = {
            'result_id': result.id,
            'interview_id': interview.id,
            'applicant': {
                'id': interview.applicant.id,
                'full_name': interview.applicant.full_name,
                'email': interview.applicant.email,
                'phone': interview.applicant.phone
            },
            'position_type': interview.position_type.code if interview.position_type else None,
            'overall_score': result.final_score,
            'passed': result.passed,
            'recommendation': (
                "hire"
                if result.final_score >= SystemSettings.get_passing_threshold()
                else (
                    "review"
                    if result.final_score >= SystemSettings.get_review_threshold()
                    else "reject"
                )
            ),

            'created_at': result.result_date,
            'video_responses': []
        }
        
        # Get all video responses with questions
        video_responses = interview.video_responses.all().select_related('question', 'hr_reviewer', 'ai_analysis')
        
        for vr in video_responses:
            # Get AI assessment from AIAnalysis if available
            ai_assessment = ''
            if hasattr(vr, 'ai_analysis') and vr.ai_analysis:
                analysis_data = vr.ai_analysis.langchain_analysis_data
                ai_assessment = analysis_data.get('analysis_summary', '') or analysis_data.get('raw_scores', {}).get('analysis_summary', '')
            
            video_data = {
                'id': vr.id,
                'question': {
                    'id': vr.question.id,
                    'question_text': vr.question.question_text,
                    'question_type': vr.question.question_type.name if vr.question.question_type else None,
                    'order': vr.question.order
                },
                'video_file': vr.video_file_path.url if vr.video_file_path else None,
                'transcript': vr.transcript or '',
                'ai_score': vr.ai_score or 0,
                'ai_assessment': ai_assessment,
                'sentiment': vr.sentiment or '',
                'hr_override_score': vr.hr_override_score,
                'hr_comments': vr.hr_comments,
                'status': vr.status if hasattr(vr, 'status') else 'completed'
            }
            review_data['video_responses'].append(video_data)
        
        return Response(review_data)
    
    @action(detail=True, methods=['post'], url_path='override-score')
    def override_score(self, request, pk=None):
        """
        HR can override AI score for specific question
        
        POST /api/results/{id}/override-score/
        Body: {
            "video_response_id": 123,
            "override_score": 85,
            "comments": "AI underestimated technical depth"
        }
        """
        result = self.get_object()
        
        # Validate request data
        serializer = ScoreOverrideSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        video_response_id = serializer.validated_data['video_response_id']
        override_score = serializer.validated_data['override_score']
        comments = serializer.validated_data['comments']
        
        # Get video response
        video_response = get_object_or_404(
            VideoResponse,
            id=video_response_id,
            interview=result.interview
        )
        
        # Update with HR override
        video_response.hr_override_score = override_score
        video_response.hr_comments = comments
        video_response.hr_reviewed_at = timezone.now()
        video_response.hr_reviewer = request.user
        video_response.save()
        
        # Recalculate overall score with overrides
        self._recalculate_result_score(result)
        
        # Refresh to get updated values
        result.refresh_from_db()
        
        return Response({
            'message': 'Score overridden successfully',
            'video_response_id': video_response_id,
            'new_override_score': override_score,
            'new_overall_score': result.final_score,
            'new_recommendation': 'hire' if result.passed else 'reject'
        })
    
    @action(detail=True, methods=['get'], url_path='comparison')
    def comparison(self, request, pk=None):
        """
        Compare AI scores vs HR overrides
        
        GET /api/results/{id}/comparison/
        """
        result = self.get_object()
        interview = result.interview
        
        video_responses = interview.video_responses.all()
        
        ai_scores = []
        hr_overrides = []
        score_differences = []
        detailed_comparisons = []
        
        for vr in video_responses:
            ai_score = vr.ai_score or 0
            hr_override = vr.hr_override_score
            
            ai_scores.append(ai_score)
            hr_overrides.append(hr_override)
            
            if hr_override is not None:
                difference = hr_override - ai_score
            else:
                difference = 0
            
            score_differences.append(difference)
            
            detailed_comparisons.append({
                'question_id': vr.question.id,
                'question_text': vr.question.question_text,
                'ai_score': ai_score,
                'hr_override': hr_override,
                'score_difference': difference
            })
        
        # Calculate agreement rate (questions without overrides)
        total_questions = len(video_responses)
        overridden_questions = sum(1 for hr in hr_overrides if hr is not None)
        agreement_rate = ((total_questions - overridden_questions) / total_questions * 100) if total_questions > 0 else 100
        
        comparison_data = {
            'total_questions': total_questions,
            'ai_scores': ai_scores,
            'hr_overrides': hr_overrides,
            'score_differences': score_differences,
            'agreement_rate': round(agreement_rate, 2),
            'detailed_comparisons': detailed_comparisons
        }
        
        return Response(comparison_data)
    
    def _recalculate_result_score(self, result):
        """
        Recalculate overall score considering HR overrides
        """
        from interviews.tasks import calculate_interview_score
        
        # Calculate new score (will use final_score property which includes overrides)
        score_data = calculate_interview_score(result.interview.id)
        
        if score_data:
            # Update the InterviewResult with new score and pass/fail status
            result.final_score = score_data['overall_score']
            result.passed = score_data['recommendation'] == 'pass'
            result.save()
            
            # Update applicant status
            applicant = result.interview.applicant
            if score_data['recommendation'] == 'pass':
                applicant.status = 'passed'
            elif score_data['recommendation'] == 'fail':
                applicant.status = 'failed'
            else:
                applicant.status = 'under_review'
            applicant.save()
    
    @action(detail=True, methods=['post'], url_path='authenticity-check')
    def authenticity_check(self, request, pk=None):
        """
        HR action for authenticity investigation
        
        POST /api/results/{id}/authenticity-check/
        Body: {
            "action": "clear_flag" | "confirm_issue" | "request_reinterview",
            "notes": "HR notes explaining the decision"
        }
        """
        result = self.get_object()
        interview = result.interview
        
        # Validate request data
        serializer = AuthenticityCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        action = serializer.validated_data['action']
        notes = serializer.validated_data['notes']
        
        # Store HR decision
        interview.authenticity_notes = f"[{timezone.now().strftime('%Y-%m-%d %H:%M')}] {request.user.get_full_name() or request.user.username}: {notes}"
        
        if action == 'clear_flag':
            # HR confirms it's a false positive
            interview.authenticity_flag = False
            interview.authenticity_status = 'verified'
            
            # Clear all script reading flags on video responses
            interview.video_responses.update(
                script_reading_status='clear',
                script_reading_data={}
            )
            
            message = 'Authenticity flag cleared - interview verified as legitimate'
            
        elif action == 'confirm_issue':
            # HR confirms script reading was detected
            interview.authenticity_status = 'failed_authenticity'
            
            # Update applicant status
            applicant = interview.applicant
            applicant.status = 'failed'
            applicant.save()
            
            # Optionally update result recommendation
            result.recommendation = 'fail'
            result.status = 'reviewed'
            result.save()
            
            message = 'Authenticity issue confirmed - applicant marked as failed'
            
        elif action == 'request_reinterview':
            # HR wants applicant to re-interview (walk-in)
            interview.authenticity_status = 'under_investigation'
            
            # Keep applicant in review status
            applicant = interview.applicant
            applicant.status = 'under_review'
            applicant.save()
            
            message = 'Re-interview requested - applicant will be contacted for walk-in interview'
            
            # TODO: Trigger notification to applicant
            
        interview.save()
        
        return Response({
            'message': message,
            'interview_id': interview.id,
            'authenticity_status': interview.authenticity_status,
            'authenticity_flag': interview.authenticity_flag,
            'notes': interview.authenticity_notes
        })
    
    @action(detail=True, methods=['post'], url_path='final-decision')
    def final_decision(self, request, pk=None):
        """
        HR makes final hiring decision - removes from review queue
        
        POST /api/results/{id}/final-decision/
        Body: {
            "decision": "hired" | "rejected",
            "notes": "Optional HR notes"
        }
        """
        result = self.get_object()
        
        # Validate request data
        serializer = FinalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        decision = serializer.validated_data['decision']
        notes = serializer.validated_data.get('notes', '')
        
        # Record final decision
        result.final_decision = decision
        result.final_decision_date = timezone.now()
        result.final_decision_by = request.user
        result.final_decision_notes = notes
        result.save()
        
        # Update applicant status based on decision
        applicant = result.applicant
        if decision == 'hired':
            applicant.status = 'hired'
            applicant.reapplication_date = None  # Clear reapplication date
        elif decision == 'rejected':
            applicant.status = 'failed'
            # Set reapplication date (30 days for failed interview)
            from datetime import date, timedelta
            applicant.reapplication_date = date.today() + timedelta(days=30)
        
        applicant.save()
        
        return Response({
            'message': f'Applicant marked as {decision}',
            'result_id': result.id,
            'applicant_id': applicant.id,
            'applicant_name': applicant.full_name,
            'final_decision': decision,
            'final_decision_date': result.final_decision_date,
            'applicant_status': applicant.status,
            'reapplication_date': applicant.reapplication_date
        })


class SystemSettingsViewSet(viewsets.ViewSet):
    """
    ViewSet for managing system settings
    
    Endpoints:
    - GET /api/settings/ - Get current settings
    - PUT /api/settings/ - Update settings (HR/Admin only)
    """
    permission_classes = [IsAuthenticated]
    
    def list(self, request):
        """Get current system settings"""
        from .models import SystemSettings
        from .settings_serializers import SystemSettingsSerializer
        
        settings = SystemSettings.get_settings()
        serializer = SystemSettingsSerializer(settings)
        return Response(serializer.data)
    
    def update(self, request, pk=None):
        """Update system settings (HR/Admin only)"""
        from .models import SystemSettings
        from .settings_serializers import SystemSettingsSerializer
        
        # Check if user has permission (is_staff or is_superuser)
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': 'You do not have permission to modify system settings'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        settings = SystemSettings.get_settings()
        serializer = SystemSettingsSerializer(settings, data=request.data, partial=True)
        
        if serializer.is_valid():
            # Set who modified it
            serializer.validated_data['modified_by'] = request.user.get_full_name() or request.user.username
            serializer.save()
            
            return Response({
                'message': 'Settings updated successfully',
                'settings': serializer.data
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
