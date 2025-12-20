import logging
import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from interviews.models import Interview
from interviews.tasks import analyze_interview

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Process pending interview analyses (status=processing) in the background runner."

    def handle(self, *args, **options):
        pending = Interview.objects.filter(status="processing")
        total = pending.count()
        self.stdout.write(f"Found {total} interview(s) pending analysis.")

        for interview in pending:
            start = time.monotonic()
            self.stdout.write(f"Starting analysis for interview {interview.id}...")
            logger.info("CLI analysis start for interview %s", interview.id)
            try:
                analyze_interview.apply(args=[interview.id])
                interview.refresh_from_db()
                if interview.status != "completed":
                    interview.status = "completed"
                    interview.completed_at = timezone.now()
                    interview.save(update_fields=["status", "completed_at"])
                elapsed_ms = int((time.monotonic() - start) * 1000)
                self.stdout.write(f"✓ Completed interview {interview.id} in {elapsed_ms}ms")
                logger.info("CLI analysis complete for interview %s in %sms", interview.id, elapsed_ms)
            except Exception as exc:  # noqa: BLE001
                elapsed_ms = int((time.monotonic() - start) * 1000)
                msg = f"✗ Failed interview {interview.id} after {elapsed_ms}ms: {exc}"
                self.stderr.write(msg)
                logger.exception("CLI analysis failed for interview %s", interview.id)
                try:
                    interview.status = "failed"
                    interview.error_message = str(exc)
                    interview.save(update_fields=["status", "error_message"])
                except Exception:
                    logger.exception("Failed to persist failure state for interview %s", interview.id)
