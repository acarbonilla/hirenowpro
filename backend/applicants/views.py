from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from accounts.permissions import IsApplicant
from common.throttles import RegistrationHourlyThrottle, RegistrationDailyThrottle
from common.permissions import IsHRUser
from accounts.authentication import generate_applicant_token, ApplicantTokenAuthentication
from django.db.models import Q, OuterRef, Subquery, Exists, Value, Case, When, BooleanField, CharField
from django.utils import timezone
from datetime import datetime
from dateutil.relativedelta import relativedelta

from .models import Applicant, ApplicantDocument, OfficeLocation
from .serializers import (
    ApplicantSerializer,
    ApplicantCreateSerializer,
    ApplicantListSerializer,
    ApplicantDocumentSerializer,
    OfficeLocationSerializer,
)
from .serializers_history import (
    ApplicantHistorySerializer,
    ApplicantDetailHistorySerializer
)


class OfficeLocationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = OfficeLocation.objects.filter(is_active=True)
    serializer_class = OfficeLocationSerializer
    permission_classes = [AllowAny]


class ApplicantViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Applicant model
    
    Endpoints:
    - POST /api/applicants/ - Create new applicant
    - GET /api/applicants/ - List all applicants
    - GET /api/applicants/{id}/ - Get applicant details
    """
    
    queryset = Applicant.objects.all()
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return ApplicantListSerializer
        if self.action == 'create':
            return ApplicantCreateSerializer
        return ApplicantSerializer
    
    def get_permissions(self):
        """Allow anyone to create; restrict management to HR"""
        if self.action in ['create']:
            return [AllowAny()]
        return [IsAuthenticated(), IsHRUser()]

    def get_throttles(self):
        if self.action == "create":
            return [RegistrationHourlyThrottle(), RegistrationDailyThrottle()]
        return super().get_throttles()
    
    def get_queryset(self):
        """Filter applicants with relationship optimization based on query parameters"""
        from interviews.models import Interview
        from results.models import InterviewResult

        ACTIVE_INTERVIEW_STATUSES = ["pending", "in_progress", "submitted", "processing"]
        COMPLETED_INTERVIEW_STATUSES = ["completed", "failed"]
        FAILED_STATUSES = ["failed", "failed_training", "failed_onboarding"]

        today = timezone.localdate()

        latest_interview = Interview.objects.filter(applicant=OuterRef("pk")).order_by("-created_at")
        latest_result = InterviewResult.objects.filter(applicant=OuterRef("pk")).order_by("-interview__created_at")

        queryset = (
            super()
            .get_queryset()
            .annotate(
                latest_interview_status=Subquery(latest_interview.values("status")[:1]),
                latest_interview_decision=Subquery(latest_interview.values("hr_decision")[:1]),
                latest_position_name=Subquery(latest_interview.values("position_type__name")[:1]),
                has_interview=Exists(Interview.objects.filter(applicant=OuterRef("pk"))),
                has_active_interview=Exists(
                    Interview.objects.filter(applicant=OuterRef("pk"), status__in=ACTIVE_INTERVIEW_STATUSES)
                ),
                has_pending_review=Case(
                    When(
                        latest_interview_status__in=COMPLETED_INTERVIEW_STATUSES,
                        latest_interview_decision__isnull=True,
                        then=Value(True),
                    ),
                    default=Value(False),
                    output_field=BooleanField(),
                ),
                needs_hr_action=Case(
                    When(
                        latest_interview_status__in=COMPLETED_INTERVIEW_STATUSES,
                        latest_interview_decision__isnull=True,
                        then=Value(True),
                    ),
                    default=Value(False),
                    output_field=BooleanField(),
                ),
                latest_result_id=Subquery(latest_result.values("id")[:1]),
                applicant_status_key=Case(
                    When(has_interview=False, then=Value("no_interview")),
                    When(has_active_interview=True, then=Value("interview_in_progress")),
                    When(
                        latest_interview_status__in=COMPLETED_INTERVIEW_STATUSES,
                        latest_interview_decision__isnull=True,
                        then=Value("pending_hr_decision"),
                    ),
                    When(status="hired", then=Value("hired")),
                    When(
                        status__in=FAILED_STATUSES,
                        reapplication_date__gt=today,
                        then=Value("failed_cooldown"),
                    ),
                    When(
                        status__in=FAILED_STATUSES,
                        reapplication_date__lte=today,
                        then=Value("eligible_reapply"),
                    ),
                    When(
                        status__in=FAILED_STATUSES,
                        reapplication_date__isnull=True,
                        then=Value("eligible_reapply"),
                    ),
                    default=Value("interview_in_progress"),
                    output_field=CharField(),
                ),
            )
        )

        # Search by name, email, or applicant ID
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            search_filter = (
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
            )
            if search.isdigit():
                search_filter |= Q(id=int(search))
            queryset = queryset.filter(search_filter)

        # Filter by applicant status (derived)
        applicant_status = self.request.query_params.get("applicant_status")
        if applicant_status:
            queryset = queryset.filter(applicant_status_key=applicant_status)

        # Filter by action required (derived)
        action_required = (self.request.query_params.get("action_required") or "").lower()
        if action_required in {"true", "false"}:
            queryset = queryset.filter(needs_hr_action=(action_required == "true"))

        # Backward-compatible filters
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        source = self.request.query_params.get("source")
        if source:
            queryset = queryset.filter(application_source=source)

        # Filter by application date range
        date_from = self.request.query_params.get("date_from")
        if date_from:
            queryset = queryset.filter(application_date__gte=date_from)

        date_to = self.request.query_params.get("date_to")
        if date_to:
            queryset = queryset.filter(application_date__lte=date_to)

        # Always return most recent first
        return queryset.order_by("-application_date")
    
    def create(self, request, *args, **kwargs):
        """Create new applicant"""
        import logging
        logger = logging.getLogger(__name__)

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            logger.error(f"Validation errors: {serializer.errors}")
            # Return detailed error response
            return Response(
                {
                    'error': 'Validation failed',
                    'details': serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            applicant = serializer.save()
            
            # Generate applicant token for passwordless interview access
            token = generate_applicant_token(applicant.id)
            redirect_url = f"/position-select?applicant_id={applicant.id}"

            response_serializer = ApplicantSerializer(applicant)
            return Response(
                {
                    'message': 'Applicant registered successfully',
                    'applicant': response_serializer.data,
                    'token': token,
                    'redirect_url': redirect_url,
                },
                status=status.HTTP_201_CREATED
            )
        except Exception as e:
            logger.error("Error saving applicant", exc_info=True)
            return Response(
                {
                    'error': 'Failed to save applicant',
                    'details': str(e)
                },
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def update(self, request, *args, **kwargs):
        """Update applicant with automatic reapplication date logic"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        old_status = instance.status
        
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        # Get the new status from request
        new_status = request.data.get('status', old_status)
        
        # Automatic reapplication date setup
        if new_status == 'failed' and old_status != 'failed':
            # Set reapplication date to next month if applicant failed
            today = datetime.now().date()
            next_month = today + relativedelta(months=1)
            instance.reapplication_date = next_month
        elif new_status == 'passed' and instance.reapplication_date:
            # Clear reapplication date if applicant passed
            instance.reapplication_date = None
        
        self.perform_update(serializer)
        
        return Response(serializer.data)
    
    def partial_update(self, request, *args, **kwargs):
        """Handle PATCH requests"""
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'], url_path='upload-document')
    def upload_document(self, request, pk=None):
        """Upload document for applicant"""
        applicant = self.get_object()
        
        serializer = ApplicantDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(applicant=applicant)
        
        return Response(
            {
                'message': 'Document uploaded successfully',
                'document': serializer.data
            },
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['get'], url_path='documents')
    def list_documents(self, request, pk=None):
        """List all documents for an applicant"""
        applicant = self.get_object()
        documents = applicant.documents.all()
        serializer = ApplicantDocumentSerializer(documents, many=True)
        
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='history')
    def history(self, request):
        """
        Comprehensive history endpoint for all applicants with filtering, search, and pagination
        
        Query Parameters:
        - search: Search by name or email
        - status: Filter by applicant status
        - application_source: Filter by source (walk_in, online)
        - position: Filter by position code
        - final_decision: Filter by final decision (hired, rejected, pending)
        - date_from: Filter by application date start
        - date_to: Filter by application date end
        - score_min: Filter by minimum score
        - score_max: Filter by maximum score
        - has_interview: Filter by whether applicant has interview (true/false)
        - page: Page number (default 1)
        - page_size: Items per page (default 25, max 100)
        - ordering: Sort field (e.g., -application_date, final_score)
        """
        from django.core.paginator import Paginator
        from django.db.models import Prefetch
        from results.models import InterviewResult
        from interviews.models import Interview as InterviewModel
        
        queryset = Applicant.objects.all().prefetch_related(
            Prefetch('interviews', queryset=InterviewModel.objects.select_related('position_type')),
            Prefetch('results', queryset=InterviewResult.objects.select_related('final_decision_by'))
        )
        
        # Search by name or email
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search)
            )
        
        # Filter by status
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by application source
        source_filter = request.query_params.get('application_source')
        if source_filter:
            queryset = queryset.filter(application_source=source_filter)
        
        # Filter by position
        position_filter = request.query_params.get('position')
        if position_filter:
            queryset = queryset.filter(interviews__position_type__code=position_filter)
        
        # Filter by final decision
        final_decision = request.query_params.get('final_decision')
        if final_decision:
            if final_decision == 'pending':
                queryset = queryset.filter(results__final_decision__isnull=True)
            elif final_decision in ['hired', 'rejected']:
                queryset = queryset.filter(results__final_decision=final_decision)
        
        # Filter by date range
        date_from = request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(application_date__gte=date_from)
        
        date_to = request.query_params.get('date_to')
        if date_to:
            from datetime import datetime
            date_to_obj = datetime.strptime(date_to, '%Y-%m-%d')
            date_to_obj = date_to_obj.replace(hour=23, minute=59, second=59)
            queryset = queryset.filter(application_date__lte=date_to_obj)
        
        # Filter by score range
        score_min = request.query_params.get('score_min')
        if score_min:
            queryset = queryset.filter(results__final_score__gte=float(score_min))
        
        score_max = request.query_params.get('score_max')
        if score_max:
            queryset = queryset.filter(results__final_score__lte=float(score_max))
        
        # Filter by has interview
        has_interview = request.query_params.get('has_interview')
        if has_interview == 'true':
            queryset = queryset.filter(interviews__isnull=False)
        elif has_interview == 'false':
            queryset = queryset.filter(interviews__isnull=True)
        
        # Ordering
        ordering = request.query_params.get('ordering', '-application_date')
        valid_orderings = [
            'application_date', '-application_date',
            'first_name', '-first_name',
            'status', '-status',
            'email', '-email'
        ]
        if ordering in valid_orderings:
            queryset = queryset.order_by(ordering)
        else:
            queryset = queryset.order_by('-application_date')
        
        # Remove duplicates (in case of multiple interviews)
        queryset = queryset.distinct()
        
        # Pagination
        page_size = int(request.query_params.get('page_size', 25))
        page_size = min(page_size, 100)  # Max 100 items per page
        page = int(request.query_params.get('page', 1))
        
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page)
        
        serializer = ApplicantHistorySerializer(page_obj.object_list, many=True)
        
        return Response({
            'count': paginator.count,
            'total_pages': paginator.num_pages,
            'current_page': page,
            'page_size': page_size,
            'results': serializer.data
        })
    
    @action(detail=True, methods=['get'], url_path='full-history')
    def full_history(self, request, pk=None):
        """
        Get complete detailed history for a single applicant
        Includes all videos, transcripts, AI analysis, and processing history
        """
        applicant = self.get_object()
        serializer = ApplicantDetailHistorySerializer(applicant)
        return Response(serializer.data)


class ApplicantSelfViewSet(mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """
    Applicant-facing profile endpoints (uses applicant token authentication).
    """

    serializer_class = ApplicantSerializer
    authentication_classes = [ApplicantTokenAuthentication]
    permission_classes = [IsApplicant]
    queryset = Applicant.objects.all()

    def get_object(self):
        # For applicant tokens, request.user is the Applicant instance.
        return getattr(self.request, "user", None)
