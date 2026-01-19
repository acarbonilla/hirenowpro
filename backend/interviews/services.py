import logging
import uuid

from django.db import transaction

from interviews.models import Interview
from processing.models import ProcessingQueue

logger = logging.getLogger(__name__)


def enqueue_interview_processing(interview_id: int, *, force: bool = False) -> dict:
    with transaction.atomic():
        interview = Interview.objects.select_for_update().get(id=interview_id)
        processing_status = interview.processing_status or "IDLE"

        existing_queue = None
        try:
            existing_queue = ProcessingQueue.objects.filter(
                interview=interview,
                processing_type="bulk_analysis",
            ).latest("created_at")
        except ProcessingQueue.DoesNotExist:
            existing_queue = None

        if processing_status in {"QUEUED", "RUNNING", "SUCCEEDED"}:
            return {
                "interview": interview,
                "already_enqueued": True,
                "processing_status": processing_status,
                "task_id": interview.processing_task_id,
                "queue_id": getattr(existing_queue, "id", None),
            }

        if processing_status == "FAILED" and not force:
            return {
                "interview": interview,
                "already_enqueued": True,
                "processing_status": processing_status,
                "task_id": interview.processing_task_id,
                "queue_id": getattr(existing_queue, "id", None),
            }

        if processing_status == "SUCCEEDED" and force:
            return {
                "interview": interview,
                "already_enqueued": True,
                "processing_status": processing_status,
                "task_id": interview.processing_task_id,
                "queue_id": getattr(existing_queue, "id", None),
            }

        task_id = str(uuid.uuid4())
        interview.processing_status = "QUEUED"
        interview.processing_task_id = task_id
        interview.processing_error = None
        interview.processing_started_at = None
        interview.processing_finished_at = None
        interview.save(
            update_fields=[
                "processing_status",
                "processing_task_id",
                "processing_error",
                "processing_started_at",
                "processing_finished_at",
            ]
        )

        queue_entry = ProcessingQueue.objects.create(
            interview=interview,
            processing_type="bulk_analysis",
            status="queued",
            celery_task_id=task_id,
        )

    logger.info(
        "Interview processing enqueued",
        extra={
            "interview_id": interview_id,
            "task_id": task_id,
            "queue_id": queue_entry.id,
        },
    )

    return {
        "interview": interview,
        "already_enqueued": False,
        "processing_status": interview.processing_status,
        "task_id": task_id,
        "queue_id": queue_entry.id,
    }


def build_processing_status_payload(interview: Interview) -> dict:
    queue_entry = None
    try:
        queue_entry = ProcessingQueue.objects.filter(
            interview=interview,
            processing_type="bulk_analysis",
        ).latest("created_at")
    except ProcessingQueue.DoesNotExist:
        queue_entry = None

    total_videos = interview.video_responses.count()
    processed_videos = interview.video_responses.filter(status='analyzed').count()
    remaining = max(total_videos - processed_videos, 0)

    estimated_seconds = remaining * 10
    if estimated_seconds < 60:
        estimated_time = f"{estimated_seconds} seconds"
    else:
        estimated_minutes = estimated_seconds // 60
        estimated_time = f"{estimated_minutes} minute{'s' if estimated_minutes > 1 else ''}"

    payload = {
        "processing_status": interview.processing_status,
        "task_id": interview.processing_task_id,
        "processing_started_at": interview.processing_started_at,
        "processing_finished_at": interview.processing_finished_at,
        "processing_error": interview.processing_error,
        "queue_status": getattr(queue_entry, "status", None),
        "progress": {
            "total_videos": total_videos,
            "processed": processed_videos,
            "remaining": remaining,
        },
        "estimated_time_remaining": estimated_time,
    }

    if queue_entry and queue_entry.status == 'completed':
        payload["message"] = "Processing complete! Redirecting to results..."
    elif queue_entry and queue_entry.status == 'failed':
        payload["message"] = "Processing failed. Please contact support."
        payload["error"] = queue_entry.error_message
    elif interview.processing_status == "FAILED":
        payload["message"] = "Processing failed. Please contact support."
        payload["error"] = interview.processing_error

    return payload
