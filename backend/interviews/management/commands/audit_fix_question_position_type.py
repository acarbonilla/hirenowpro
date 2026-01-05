from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from interviews.models import InterviewQuestion
from interviews.type_models import PositionType


def truncate_text(text: str, limit: int = 80) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return f"{text[:limit - 3]}..."


def load_mapping_file(mapping_path: str) -> dict[int, int]:
    if not mapping_path:
        raise CommandError("Missing required --mapping-file path.")
    path = Path(mapping_path)
    if not path.exists():
        raise CommandError(f"Mapping file not found: {path}")
    if not path.is_file():
        raise CommandError(f"Mapping path is not a file: {path}")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CommandError(f"Invalid JSON in mapping file: {exc}") from exc

    if not isinstance(raw, dict) or "questions" not in raw:
        raise CommandError("Mapping JSON must be an object containing a 'questions' list.")
    questions = raw.get("questions")
    if not isinstance(questions, list):
        raise CommandError("Mapping JSON 'questions' must be a list.")

    mapping: dict[int, int] = {}
    for entry in questions:
        if not isinstance(entry, dict):
            raise CommandError("Each mapping entry must be an object.")
        if "question_id" not in entry:
            raise CommandError("Each mapping entry must include question_id.")
        if "position_type_id" not in entry:
            raise CommandError("Each mapping entry must include position_type_id.")
        try:
            question_id = int(entry["question_id"])
        except (TypeError, ValueError) as exc:
            raise CommandError(f"Invalid question_id in mapping: {entry.get('question_id')!r}") from exc
        if question_id in mapping:
            raise CommandError(f"Duplicate question_id in mapping: {question_id}")
        if entry["position_type_id"] is None:
            raise CommandError(f"Null position_type_id for question {question_id}.")
        try:
            position_type_id = int(entry["position_type_id"])
        except (TypeError, ValueError) as exc:
            raise CommandError(
                f"Invalid position_type_id for question {question_id}: {entry.get('position_type_id')!r}"
            ) from exc
        mapping[question_id] = position_type_id

    return mapping


class Command(BaseCommand):
    help = "Audit and fix InterviewQuestion.position_type_id using a verified mapping."

    def add_arguments(self, parser):
        parser.add_argument(
            "--export-scaffold",
            type=str,
            default="",
            help="Export blank JSON scaffold for human review to the given path.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply fixes (default: dry-run).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run audit without changes (default).",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Confirm apply mode without an interactive prompt.",
        )
        parser.add_argument(
            "--mapping-file",
            type=str,
            default="",
            help="Required. Path to JSON mapping file containing a 'questions' list.",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options.get("apply"))
        dry_run = bool(options.get("dry_run")) or not apply_changes
        export_path = (options.get("export_scaffold") or "").strip()
        mapping_file = (options.get("mapping_file") or "").strip()
        yes = bool(options.get("yes"))

        if export_path and apply_changes:
            raise CommandError("Cannot use --export-scaffold with --apply.")

        if export_path:
            self.export_scaffold(export_path)
            return

        if apply_changes and bool(options.get("dry_run")):
            raise CommandError("Cannot combine --apply with --dry-run.")

        if not mapping_file:
            raise CommandError("Missing required --mapping-file path for audit/apply.")

        if apply_changes and not yes:
            response = input("Apply changes to question position_type_id? Type APPLY to continue: ").strip()
            if response != "APPLY":
                raise CommandError("Apply canceled.")

        question_position_map = load_mapping_file(mapping_file)
        if apply_changes and not question_position_map:
            raise CommandError("Mapping file is empty. Populate it before applying changes.")

        all_questions = InterviewQuestion.objects.all().only("id", "question_text", "position_type_id").order_by("id")
        total_questions = all_questions.count()

        self.stdout.write("Audit question position types (dry-run)" if dry_run else "Audit question position types (apply)")
        self.stdout.write(f"Total questions: {total_questions}")

        mapped_ids = set(question_position_map.keys())
        invalid_question_ids = set()
        if mapped_ids:
            existing_ids = set(
                InterviewQuestion.objects.filter(id__in=mapped_ids).values_list("id", flat=True)
            )
            invalid_question_ids = mapped_ids - existing_ids
            if invalid_question_ids:
                raise CommandError(f"Mapping includes unknown question IDs: {sorted(invalid_question_ids)}")

        proposed_position_ids = {value for value in question_position_map.values()}
        if None in proposed_position_ids:
            raise CommandError("Mapping contains null position_type_id values.")
        if proposed_position_ids:
            existing_position_ids = set(
                PositionType.objects.filter(id__in=proposed_position_ids).values_list("id", flat=True)
            )
            missing_positions = proposed_position_ids - existing_position_ids
            if missing_positions:
                raise CommandError(f"Mapping includes unknown position_type_id values: {sorted(missing_positions)}")

        mapped_count = 0
        unmapped_count = 0
        null_position_unmapped = 0
        mismatches = []

        for question in all_questions:
            proposed = question_position_map.get(question.id)
            if proposed is None:
                unmapped_count += 1
                if question.position_type_id is None:
                    null_position_unmapped += 1
                continue
            mapped_count += 1
            if question.position_type_id != proposed:
                mismatches.append((question, proposed))

        if mismatches:
            header = f"{'ID':>6}  {'CURRENT':>8}  {'PROPOSED':>8}  TEXT"
            self.stdout.write("")
            self.stdout.write(header)
            self.stdout.write("-" * len(header))
            for question, proposed in mismatches:
                self.stdout.write(
                    f"{question.id:>6}  {str(question.position_type_id):>8}  "
                    f"{str(proposed):>8}  {truncate_text(question.question_text)}"
                )

        self.stdout.write("")
        self.stdout.write(f"Mapped questions: {mapped_count}")
        self.stdout.write(f"Unmapped questions: {unmapped_count}")
        if null_position_unmapped:
            self.stdout.write(f"Unmapped questions with NULL position_type_id: {null_position_unmapped}")
        self.stdout.write(f"Mismatches: {len(mismatches)}")

        if dry_run:
            self.stdout.write("Dry-run complete. No changes applied.")
            return

        if not mismatches:
            self.stdout.write("No changes needed.")
            return

        with transaction.atomic():
            questions_to_update = []
            for question, proposed in mismatches:
                question.position_type_id = proposed
                questions_to_update.append(question)
            InterviewQuestion.objects.bulk_update(questions_to_update, ["position_type"])

        self.stdout.write(f"Rows updated: {len(questions_to_update)}")
        self.stdout.write(f"Rows skipped (already correct): {mapped_count - len(questions_to_update)}")

    def export_scaffold(self, export_path: str) -> None:
        path = Path(export_path)
        if path.exists() and path.is_dir():
            raise CommandError(f"Export path is a directory: {path}")
        if not path.parent.exists():
            raise CommandError(f"Export directory does not exist: {path.parent}")

        questions = (
            InterviewQuestion.objects.all()
            .only("id", "question_text")
            .order_by("id")
        )
        scaffold = {
            "questions": [
                {
                    "question_id": question.id,
                    "question_text": truncate_text(question.question_text, limit=120),
                    "position_type_id": None,
                }
                for question in questions
            ]
        }
        path.write_text(json.dumps(scaffold, indent=2, ensure_ascii=True), encoding="utf-8")
        self.stdout.write(f"Exported scaffold: {path}")
