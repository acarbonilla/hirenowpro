from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from interviews.models import InterviewQuestion
from interviews.type_models import PositionType
from interviews.question_alignment import suggest_position_code


class Command(BaseCommand):
    help = "Audit and optionally realign interview questions to the correct position_type."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply fixes to question position_type (default: dry-run).",
        )
        parser.add_argument(
            "--sync-category",
            action="store_true",
            help="Also update category to match position_type when applying fixes.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Limit number of questions to scan (0 = no limit).",
        )
        parser.add_argument(
            "--position",
            type=str,
            default="",
            help="Only audit questions assigned to this position code.",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options.get("apply"))
        sync_category = bool(options.get("sync_category"))
        limit = int(options.get("limit") or 0)
        position_filter = (options.get("position") or "").strip().lower()

        qs = InterviewQuestion.objects.select_related("position_type", "category").order_by("id")
        if position_filter:
            qs = qs.filter(position_type__code=position_filter)
        if limit > 0:
            qs = qs[:limit]

        position_map = {pt.code: pt for pt in PositionType.objects.all()}

        total = 0
        mismatches = 0
        updated = 0

        self.stdout.write("Question position audit (dry-run)" if not apply_changes else "Question position audit (apply)")

        def process_question(question):
            nonlocal mismatches, updated
            assigned_code = getattr(question.position_type, "code", None)
            suggested_code, scores = suggest_position_code(question.question_text)
            if not suggested_code or not assigned_code or suggested_code == assigned_code:
                return
            mismatches += 1
            self.stdout.write(
                f"- Q{question.id}: '{question.question_text[:80]}' | "
                f"assigned={assigned_code} suggested={suggested_code} scores={scores}"
            )
            if not apply_changes:
                return
            target = position_map.get(suggested_code)
            if not target:
                self.stdout.write(f"  ! Missing PositionType for suggested code '{suggested_code}', skipped.")
                return
            question.position_type = target
            update_fields = ["position_type"]
            if sync_category:
                question.category = target
                update_fields.append("category")
            question.save(update_fields=update_fields)
            updated += 1

        if apply_changes:
            with transaction.atomic():
                for question in qs:
                    total += 1
                    process_question(question)
        else:
            for question in qs:
                total += 1
                process_question(question)

        self.stdout.write("")
        self.stdout.write(f"Scanned: {total}")
        self.stdout.write(f"Mismatches: {mismatches}")
        if apply_changes:
            self.stdout.write(f"Updated: {updated}")
