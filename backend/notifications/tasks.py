import logging

from celery import shared_task
from django.utils import timezone

from interviews.models import Interview
from services.email_service import send_decision_email, send_retake_email

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def send_applicant_email_task(self, email_type, interview_id, extra_context=None):
    try:
        interview = Interview.objects.select_related("applicant").get(id=interview_id)
    except Interview.DoesNotExist:
        logger.error("Email task missing interview %s", interview_id)
        return

    interview.email_queued_at = interview.email_queued_at or timezone.now()
    interview.email_last_error = None
    interview.save(update_fields=["email_queued_at", "email_last_error"])

    try:
        if email_type == "decision":
            send_decision_email(interview_id, sent_by=None, **(extra_context or {}))
        elif email_type == "retake":
            interview_link = (extra_context or {}).get("interview_link")
            send_retake_email(interview_id, interview_link, sent_by=None)
        else:
            logger.error("Unknown email_type %s for interview %s", email_type, interview_id)
    except Exception as exc:
        logger.exception("Email task failed for %s interview %s", email_type, interview_id)
        interview.email_last_error = str(exc)
        interview.save(update_fields=["email_last_error"])

@shared_task(bind=True)
def send_result_notification(self, interview_id):
    try:
        Interview.objects.only("id").get(id=interview_id)
    except Interview.DoesNotExist:
        logger.error("Result notification missing interview %s", interview_id)
        return {"status": "missing", "interview_id": interview_id}

    logger.info("Result notification queued", extra={"interview_id": interview_id})
    return {"status": "queued", "interview_id": interview_id}

