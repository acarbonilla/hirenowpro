import json
import logging
import time
import requests
import re
import uuid
from datetime import timedelta
from django.conf import settings
from django.http import HttpResponse
from django.utils.dateparse import parse_datetime
from rest_framework import generics, status, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from interviews.models import Interview, InterviewAuditLog, InterviewQuestion, JobPosition, VideoResponse
from interviews.type_models import PositionType
from interviews.type_serializers import JobCategorySerializer
from interviews.serializers import VideoResponseCreateSerializer
from .serializers import (
    PublicInterviewSerializer,
    PublicJobPositionSerializer,
)
from .permissions import InterviewTokenPermission
from common.throttles import (
    PublicInterviewRetrieveThrottle,
    PublicInterviewUploadThrottle,
    PublicInterviewSubmitThrottle,
    PublicInterviewTtsThrottle,
)
from interviews.tasks import process_complete_interview, transcribe_video_response
from interviews.question_selection import select_questions_for_interview
from interviews.services import enqueue_interview_processing, build_processing_status_payload

logger = logging.getLogger(__name__)


def _next_question_index(interview, answered_ids):
    selected_ids = list(getattr(interview, "selected_question_ids", None) or [])
    if not selected_ids and interview.position_type_id:
        selected_ids = [q.id for q in select_questions_for_interview(interview)]
    if not selected_ids:
        return 0
    for index, question_id in enumerate(selected_ids):
        if question_id not in answered_ids:
            return index
    return max(0, len(selected_ids) - 1)


def _merge_timestamp_list(existing, incoming):
    existing_list = [ts for ts in (existing or []) if ts]
    incoming_list = [ts for ts in (incoming or []) if ts]
    if not incoming_list:
        return existing_list
    existing_set = set(existing_list)
    merged = existing_list[:]
    for ts in incoming_list:
        if ts not in existing_set:
            merged.append(ts)
            existing_set.add(ts)
    return merged


def _merge_integrity_metadata(existing, incoming):
    if not isinstance(existing, dict):
        existing = {}
    if not isinstance(incoming, dict):
        return existing

    merged = dict(existing)
    fullscreen_existing = merged.get("fullscreen", {}) or {}
    fullscreen_incoming = incoming.get("fullscreen", {}) or {}
    merged["fullscreen"] = {
        "supported": bool(fullscreen_existing.get("supported")) or bool(fullscreen_incoming.get("supported")),
        "exit_count": max(fullscreen_existing.get("exit_count", 0), fullscreen_incoming.get("exit_count", 0)),
        "exit_timestamps": _merge_timestamp_list(
            fullscreen_existing.get("exit_timestamps"),
            fullscreen_incoming.get("exit_timestamps"),
        ),
        "not_supported_count": max(
            fullscreen_existing.get("not_supported_count", 0),
            fullscreen_incoming.get("not_supported_count", 0),
        ),
        "not_supported_timestamps": _merge_timestamp_list(
            fullscreen_existing.get("not_supported_timestamps"),
            fullscreen_incoming.get("not_supported_timestamps"),
        ),
    }

    focus_existing = merged.get("focus", {}) or {}
    focus_incoming = incoming.get("focus", {}) or {}
    merged["focus"] = {
        "blur_count": max(focus_existing.get("blur_count", 0), focus_incoming.get("blur_count", 0)),
        "total_blur_seconds": max(
            focus_existing.get("total_blur_seconds", 0),
            focus_incoming.get("total_blur_seconds", 0),
        ),
    }

    tab_existing = merged.get("tab_switches", {}) or {}
    tab_incoming = incoming.get("tab_switches", {}) or {}
    merged["tab_switches"] = {
        "count": max(tab_existing.get("count", 0), tab_incoming.get("count", 0)),
    }

    refresh_existing = merged.get("refresh", {}) or {}
    refresh_incoming = incoming.get("refresh", {}) or {}
    merged["refresh"] = {
        "count": max(refresh_existing.get("count", 0), refresh_incoming.get("count", 0)),
    }

    captured_at = incoming.get("captured_at")
    if captured_at:
        merged["last_updated_at"] = captured_at

    return merged


class PublicInterviewCreateView(generics.GenericAPIView):
    """
    Resume an existing interview using a valid interview token.
    Interview creation must happen in trusted/internal flows.
    """

    permission_classes = [InterviewTokenPermission]
    authentication_classes = []
    throttle_classes = [PublicInterviewRetrieveThrottle]
    serializer_class = PublicInterviewSerializer

    def post(self, request, *args, **kwargs):
        public_id = request.data.get("public_id") or request.query_params.get("public_id")
        if not public_id:
            return Response({"detail": "public_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        interview = Interview.objects.filter(public_id=public_id, archived=False).first()
        if not interview:
            return Response({"detail": "Interview not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(interview)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PublicInterviewViewSet(viewsets.ModelViewSet):
    permission_classes = [InterviewTokenPermission]
    authentication_classes = []
    serializer_class = PublicInterviewSerializer
    queryset = Interview.objects.select_related("position_type", "applicant")
    lookup_field = "public_id"
    lookup_url_kwarg = "public_id"
    lookup_value_regex = "[0-9a-fA-F-]{36}"
    http_method_names = ["get", "post", "patch", "head", "options"]

    def list(self, request, *args, **kwargs):
        return Response({"detail": "Method not allowed."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def get_throttles(self):
        if self.action == "retrieve":
            return [PublicInterviewRetrieveThrottle()]
        if self.action == "video_response":
            return [PublicInterviewUploadThrottle()]
        if self.action == "submit":
            return [PublicInterviewSubmitThrottle()]
        if self.action == "tts":
            return [PublicInterviewTtsThrottle()]
        return super().get_throttles()

    def retrieve(self, request, *args, **kwargs):
        interview = self.get_object()
        if interview.archived:
            return Response({"detail": "Interview has been archived."}, status=status.HTTP_400_BAD_REQUEST)
        if interview.expires_at and interview.expires_at < timezone.now():
            return Response({"detail": "Interview link has expired."}, status=status.HTTP_400_BAD_REQUEST)

        answered_ids = set(interview.video_responses.values_list("question_id", flat=True))
        updated_fields = []
        if interview.status == "pending" and answered_ids:
            interview.status = "in_progress"
            updated_fields.append("status")
        if interview.status == "in_progress":
            next_index = _next_question_index(interview, answered_ids)
            if interview.current_question_index != next_index:
                interview.current_question_index = next_index
                updated_fields.append("current_question_index")
            interview.last_activity_at = timezone.now()
            updated_fields.append("last_activity_at")
            InterviewAuditLog.objects.create(
                interview=interview,
                event_type="resume_access",
                metadata={
                    "next_question_index": next_index,
                    "answered_count": len(answered_ids),
                },
            )
        if updated_fields:
            interview.save(update_fields=updated_fields)
        serializer = self.get_serializer(interview)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="video-response",
        permission_classes=[InterviewTokenPermission],
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

        # Normalize duration for safety (hard cap at 120s)
        MAX_ANSWER_SECONDS = 120
        duration = serializer.validated_data["duration"]
        try:
            duration_seconds = int(duration.total_seconds())
        except Exception:
            duration_seconds = 0

        raw_answer_seconds = request.data.get("answer_duration_seconds")
        if raw_answer_seconds is not None:
            try:
                duration_seconds = int(float(raw_answer_seconds))
            except (TypeError, ValueError):
                pass

        time_limit_reached = str(request.data.get("time_limit_reached", "")).lower() in {"true", "1", "yes"}
        if duration_seconds > MAX_ANSWER_SECONDS:
            logger.warning(
                "Answer duration exceeded limit; clamping",
                extra={
                    "interview_id": interview.id,
                    "question_id": question.id,
                    "duration_seconds": duration_seconds,
                },
            )
            duration_seconds = MAX_ANSWER_SECONDS
            time_limit_reached = True

        duration_seconds = max(1, duration_seconds)
        duration = timedelta(seconds=duration_seconds)

        video_response = VideoResponse.objects.create(
            interview=interview,
            question=question,
            video_file_path=serializer.validated_data["video_file_path"],
            duration=duration,
            status="uploaded",
        )
        try:
            InterviewAuditLog.objects.create(
                interview=interview,
                actor=None,
                event_type="answer_time_limit" if time_limit_reached else "answer_recorded",
                metadata={
                    "question_id": question.id,
                    "duration_seconds": duration_seconds,
                    "time_limit_reached": time_limit_reached,
                },
            )
        except Exception:
            logger.exception("Failed to write answer duration audit log for interview %s", interview.id)
        now = timezone.now()
        if interview.status == "pending":
            interview.status = "in_progress"
        interview.last_activity_at = now
        answered_ids = set(interview.video_responses.values_list("question_id", flat=True))
        interview.current_question_index = _next_question_index(interview, answered_ids)
        interview.save(update_fields=["status", "last_activity_at", "current_question_index"])

        transcript_error = None
        transcript_text = ""
        transcription_task_id = None

        if getattr(settings, "STT_ENABLED", False):
            if getattr(settings, "INTERVIEW_PROCESSING_SYNC", False):
                try:
                    from interviews.deepgram_service import get_deepgram_service

                    deepgram_service = get_deepgram_service()
                    transcript_data = deepgram_service.transcribe_video(
                        video_response.video_file_path.path,
                        video_response_id=video_response.id,
                    )
                    transcript_text = transcript_data.get("transcript", "") or ""
                    video_response.transcript = transcript_text
                    video_response.save(update_fields=["transcript"])
                except Exception as exc:  # noqa: BLE001 - log and return consistent contract
                    transcript_error = str(exc)
                    transcript_text = ""
                    video_response.transcript = ""
                    video_response.save(update_fields=["transcript"])
            else:
                transcription_task_id = str(uuid.uuid4())

                def queue_transcription():
                    transcribe_video_response.apply_async(
                        args=[video_response.id],
                        task_id=transcription_task_id,
                    )

                transaction.on_commit(queue_transcription)

        response_payload = {
            "video_response": {
                "id": video_response.id,
                "question_id": video_response.question_id,
                "transcript": transcript_text,
                "status": video_response.status,
            },
            "transcript_ready": bool(transcript_text),
            "transcription_error": transcript_error,
            "transcription_task_id": transcription_task_id,
        }

        return Response(response_payload, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["post"],
        url_path="submit",
        permission_classes=[InterviewTokenPermission],
        authentication_classes=[],
    )
    def submit(self, request, pk=None):
        start_time = time.monotonic()
        interview = self.get_object()
        force = str(request.data.get("force", "")).lower() in {"true", "1", "yes"}
        if interview.processing_status in {"QUEUED", "RUNNING", "SUCCEEDED"}:
            payload = build_processing_status_payload(interview)
            return Response(payload, status=status.HTTP_202_ACCEPTED)
        if interview.processing_status == "FAILED" and not force:
            payload = build_processing_status_payload(interview)
            payload["detail"] = "Interview processing failed. Use force=true to requeue."
            return Response(payload, status=status.HTTP_409_CONFLICT)

        if interview.status not in ["pending", "in_progress"]:
            return Response({"detail": "Interview already submitted."}, status=status.HTTP_400_BAD_REQUEST)

        logger.info("Interview %s submission received", interview.id)
        integrity_payload = request.data.get("integrity")
        if isinstance(integrity_payload, str):
            try:
                integrity_payload = json.loads(integrity_payload)
            except ValueError:
                integrity_payload = None
        update_fields = ["status", "submission_date", "last_activity_at"]
        if isinstance(integrity_payload, dict):
            interview.integrity_metadata = _merge_integrity_metadata(
                getattr(interview, "integrity_metadata", None),
                integrity_payload,
            )
            update_fields.append("integrity_metadata")
            consent_at = integrity_payload.get("consent_acknowledged_at")
            if consent_at and not interview.consent_acknowledged_at:
                parsed = parse_datetime(consent_at)
                if parsed is not None:
                    interview.consent_acknowledged_at = parsed
                    update_fields.append("consent_acknowledged_at")
        interview.status = "processing"
        interview.submission_date = timezone.now()
        interview.last_activity_at = timezone.now()
        interview.save(update_fields=update_fields)

        enqueue_result = None
        try:
            enqueue_result = enqueue_interview_processing(interview.id, force=force)
        except Exception:
            logger.exception("Failed to enqueue interview processing for interview %s", interview.id)

        if enqueue_result:
            if getattr(settings, "INTERVIEW_PROCESSING_SYNC", False):
                process_complete_interview.apply(
                    args=[interview.id],
                    task_id=enqueue_result["task_id"],
                )
            else:
                def queue_celery_task():
                    process_complete_interview.apply_async(
                        args=[interview.id],
                        task_id=enqueue_result["task_id"],
                    )

                transaction.on_commit(queue_celery_task)

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        logger.info("Interview %s submit completed in %sms", interview.id, elapsed_ms)

        return Response(
            {
                "status": "QUEUED",
                "public_id": str(interview.public_id),
                "task_id": enqueue_result.get("task_id") if enqueue_result else None,
                "queue_id": enqueue_result.get("queue_id") if enqueue_result else None,
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="processing-status",
        permission_classes=[InterviewTokenPermission],
        authentication_classes=[],
    )
    def processing_status(self, request, pk=None):
        interview = self.get_object()
        payload = build_processing_status_payload(interview)
        return Response(payload, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post", "patch"],
        url_path="integrity",
        permission_classes=[InterviewTokenPermission],
        authentication_classes=[],
    )
    def integrity(self, request, pk=None):
        interview = self.get_object()
        payload = request.data.get("integrity", request.data)
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except ValueError:
                payload = None

        if not isinstance(payload, dict):
            return Response({"detail": "Integrity payload ignored."}, status=status.HTTP_200_OK)

        update_fields = ["integrity_metadata"]
        interview.integrity_metadata = _merge_integrity_metadata(
            getattr(interview, "integrity_metadata", None),
            payload,
        )

        consent_at = payload.get("consent_acknowledged_at")
        if consent_at and not interview.consent_acknowledged_at:
            parsed = parse_datetime(consent_at)
            if parsed is not None:
                interview.consent_acknowledged_at = parsed
                update_fields.append("consent_acknowledged_at")

        try:
            interview.save(update_fields=update_fields)
        except Exception:
            logger.warning(
                "Integrity metadata save failed",
                extra={"interview_id": interview.id},
            )
        return Response({"detail": "Integrity metadata recorded."}, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="tts",
        permission_classes=[InterviewTokenPermission],
        authentication_classes=[],
    )
    def tts(self, request, pk=None):
        text = (request.data.get("text") or "").strip()
        if not text:
            return Response({"detail": "Text is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(text) > 500:
            return Response({"detail": "Text must be 500 characters or fewer."}, status=status.HTTP_400_BAD_REQUEST)

        provider = getattr(settings, "TTS_PROVIDER", "deepgram")
        if provider != "deepgram":
            logger.error("TTS_PROVIDER is not deepgram; refusing TTS request.", extra={"provider": provider})
            return Response({"detail": "TTS provider misconfigured."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        api_key = getattr(settings, "DEEPGRAM_API_KEY", None) or ""
        if not api_key:
            return Response({"detail": "Deepgram API key not configured."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        model = getattr(settings, "DEEPGRAM_TTS_MODEL", None) or "aura-2-thalia-en"
        if not model.startswith("aura-"):
            logger.error("Deepgram TTS model must start with aura-; refusing TTS request.")
            return Response(
                {"detail": "Deepgram TTS model misconfigured."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        if re.fullmatch(r"[A-Fa-f0-9]{40,}", model or "") or len(model) > 40:
            logger.error("Deepgram TTS model appears to be an API key; refusing TTS request.")
            return Response(
                {"detail": "Deepgram TTS model misconfigured."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        url = f"https://api.deepgram.com/v1/speak?model={model}"
        headers = {
            "Authorization": f"Token {api_key}",
            "Content-Type": "application/json",
            "Accept": "audio/wav",
        }
        payload = {"text": text}

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=15)
            if response.status_code != 200:
                logger.error(
                    "Deepgram TTS non-200 response",
                    extra={
                        "status_code": response.status_code,
                        "response_text": response.text,
                        "response_headers": dict(response.headers),
                        "url": url,
                    },
                )
                raise RuntimeError("Deepgram TTS failed with non-200 response")
        except Exception:
            logger.exception("Deepgram TTS failed")
            return Response({"detail": "TTS request failed."}, status=status.HTTP_502_BAD_GATEWAY)

        logger.info(
            "Deepgram TTS response metadata",
            extra={
                "dg_request_id": response.headers.get("dg-request-id"),
                "dg_model_name": response.headers.get("dg-model-name"),
                "content_type": response.headers.get("content-type"),
                "dg_char_count": response.headers.get("dg-char-count"),
            },
        )

        audio_bytes = response.content
        tts_response = HttpResponse(audio_bytes, content_type="audio/wav")
        tts_response["Cache-Control"] = "no-store"
        return tts_response


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
