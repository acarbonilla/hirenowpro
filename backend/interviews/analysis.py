import logging

from django.db import transaction

logger = logging.getLogger(__name__)


def trigger_interview_analysis(interview_id: int) -> bool:
    """
    Schedule AI analysis for the given interview asynchronously.

    Only enqueues a background task; never runs analysis inline.
    """
    logger.info("Scheduling AI analysis for interview %s", interview_id)

    try:
        from interviews.models import Interview
        from interviews.tasks import analyze_interview
    except Exception:
        logger.exception("Unable to import analysis task for interview %s", interview_id)
        return False

    try:
        interview = Interview.objects.only("status").get(id=interview_id)
    except Interview.DoesNotExist:
        logger.error("Interview %s not found for analysis trigger", interview_id)
        return False

    if interview.status in ["processing", "completed", "failed"]:
        logger.info("Skipping analysis enqueue for interview %s; status=%s", interview_id, interview.status)
        return False

    def enqueue_task():
        try:
            analyze_interview.delay(interview_id)
            logger.info("Celery task queued for interview %s", interview_id)
        except Exception:
            logger.exception("Celery queueing failed for interview %s", interview_id)

    try:
        transaction.on_commit(enqueue_task)
    except Exception:
        logger.exception("Error scheduling analysis for interview %s", interview_id)

    return True
