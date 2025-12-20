import logging
import time
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from interviews.models import Interview, InterviewQuestion, JobPosition, VideoResponse
from interviews.type_models import PositionType
from interviews.type_serializers import JobCategorySerializer
from interviews.serializers import InterviewSerializer, VideoResponseCreateSerializer
from applicants.models import Applicant
from .serializers import (
    PublicInterviewSerializer,
    PublicJobPositionSerializer,
)
from interviews.tasks import process_complete_interview
from interviews.question_selection import select_questions_for_interview, select_questions_for_interview_with_metadata

logger = logging.getLogger(__name__)


class PublicInterviewCreateView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = InterviewSerializer

    def create(self, request, *args, **kwargs):
        applicant_id = request.data.get("applicant_id")
        position_code = request.data.get("position_code")
        interview_type = request.data.get("interview_type", "initial_ai")

        try:
            applicant = Applicant.objects.get(id=applicant_id)
        except Applicant.DoesNotExist:
            return Response({"error": "Applicant not found"}, status=status.HTTP_404_NOT_FOUND)

        position_type = PositionType.objects.filter(code=position_code).first()
        if not position_type:
            job_position = JobPosition.objects.filter(code=position_code).select_related("category").first()
            position_type = job_position.category if job_position and job_position.category else None
        if not position_type:
            raise ValidationError({"position_code": "Position type not found"})

        try:
            interview = Interview.objects.create(
                applicant=applicant,
                position_type=position_type,
                interview_type=interview_type,
                status="pending",
            )
        except Exception:
            logger.exception(
                "Interview create failed",
                extra={"applicant_id": applicant_id, "position_code": position_code},
            )
            return Response({"detail": "Interview creation failed."}, status=status.HTTP_400_BAD_REQUEST)

        if not interview:
            return Response({"detail": "Interview creation failed."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            selected_questions, selection_metadata = select_questions_for_interview_with_metadata(interview)
        except ValueError as exc:
            logger.warning(
                "Interview question selection failed",
                extra={"interview_id": interview.id, "applicant_id": applicant_id, "error": str(exc)},
            )
            interview.delete()
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        interview.selected_question_ids = [q.id for q in selected_questions]
        interview.selected_question_metadata = selection_metadata
        interview.save(update_fields=["selected_question_ids", "selected_question_metadata"])

        serializer = self.get_serializer(interview)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PublicInterviewViewSet(viewsets.ModelViewSet):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = PublicInterviewSerializer
    queryset = Interview.objects.select_related("position_type", "applicant")

    def retrieve(self, request, *args, **kwargs):
        interview = self.get_object()
        serializer = self.get_serializer(interview)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="video-response",
        permission_classes=[AllowAny],
        authentication_classes=[],
    )
    def video_response(self, request, pk=None):
        interview = self.get_object()

        if interview.status in ["submitted", "processing", "completed"]:
            return Response({"error": "Interview already submitted or completed"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = VideoResponseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question_id = serializer.validated_data.get("question_id")
        question = get_object_or_404(InterviewQuestion, id=question_id, is_active=True)

        existing_response = VideoResponse.objects.filter(interview=interview, question=question).first()
        if existing_response:
            return Response({"error": "A response for this question already exists"}, status=status.HTTP_400_BAD_REQUEST)

        video_response = VideoResponse.objects.create(
            interview=interview,
            question=question,
            video_file_path=serializer.validated_data["video_file_path"],
            duration=serializer.validated_data["duration"],
            status="uploaded",
        )

        transcript_error = None
        transcript_text = ""

        try:
            from interviews.deepgram_service import get_deepgram_service

            deepgram_service = get_deepgram_service()
            transcript_data = deepgram_service.transcribe_video(
                video_response.video_file_path.path, video_response_id=video_response.id
            )
            transcript_text = transcript_data.get("transcript", "") or ""
            video_response.transcript = transcript_text
            video_response.save()
        except Exception as exc:  # noqa: BLE001 - log and return consistent contract
            transcript_error = str(exc)
            transcript_text = ""
            video_response.transcript = ""
            video_response.save()

        response_payload = {
            "video_response": {
                "id": video_response.id,
                "question_id": video_response.question_id,
                "transcript": transcript_text,
                "status": video_response.status,
            },
            "transcript_ready": bool(transcript_text),
            "transcription_error": transcript_error,
        }

        return Response(response_payload, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["post"],
        url_path="submit",
        permission_classes=[AllowAny],
        authentication_classes=[],
    )
    def submit(self, request, pk=None):
        start_time = time.monotonic()
        interview = self.get_object()

        if interview.status != "pending":
            return Response({"detail": "Interview already submitted."}, status=status.HTTP_400_BAD_REQUEST)

        logger.info("Interview %s submission received", interview.id)
        interview.status = "processing"
        interview.submission_date = timezone.now()
        interview.save(update_fields=["status", "submission_date"])

        # Create processing queue entry for visibility (best-effort)
        try:
            from processing.models import ProcessingQueue

            ProcessingQueue.objects.create(
                interview=interview,
                processing_type="bulk_analysis",
                status="pending",
            )
        except Exception:
            logger.exception("Failed to create processing queue entry for interview %s", interview.id)

        # Enqueue AI analysis after transaction commits to avoid orphan tasks
        transaction.on_commit(lambda: process_complete_interview.delay(interview.id))

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        logger.info("Interview %s submit completed in %sms", interview.id, elapsed_ms)

        return Response({"detail": "Interview submitted successfully."}, status=status.HTTP_200_OK)


class PublicPositionTypeLookupView(generics.ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = JobCategorySerializer

    def get_queryset(self):
        qs = PositionType.objects.all()
        position_code = self.request.query_params.get("position_code")
        if position_code:
            qs = qs.filter(positions__code=position_code)
        return qs


class PublicPositionTypeView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = JobCategorySerializer

    def get(self, request):
        position_code = request.query_params.get("position_code")
        qs = PositionType.objects.all()
        if position_code:
            qs = qs.filter(code=position_code)
            if not qs.exists():
                job_position = JobPosition.objects.filter(code=position_code).select_related("category").first()
                if job_position and job_position.category:
                    qs = PositionType.objects.filter(id=job_position.category_id)
        serializer = self.get_serializer(qs, many=True)
        return Response({"results": serializer.data})


class PublicPositionTypeViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = JobCategorySerializer
    queryset = PositionType.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        position_code = self.request.query_params.get("position_code")
        if position_code:
            qs = qs.filter(code=position_code)
            if not qs.exists():
                job_position = JobPosition.objects.filter(code=position_code).select_related("category").first()
                if job_position and job_position.category:
                    qs = PositionType.objects.filter(id=job_position.category_id)
        return qs


class PublicJobPositionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public-facing viewset for job positions. No authentication required.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = PublicJobPositionSerializer
    queryset = JobPosition.objects.select_related("category").filter(is_active=True)

    def get_queryset(self):
        qs = super().get_queryset()
        code = self.request.query_params.get("code")
        if code:
            qs = qs.filter(code=code)
        return qs
