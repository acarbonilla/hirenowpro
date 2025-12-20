from typing import Iterable, List, Sequence

from .models import InterviewQuestion


GENERAL_COMPETENCIES = ["communication", "customer_handling", "problem_explanation"]
CATEGORY_COMPETENCY_MAP = {
    "it_support": ["troubleshooting", "technical_reasoning"],
    "technical": ["troubleshooting", "technical_reasoning"],
    "network": ["networking_concepts", "technical_reasoning"],
    "customer_service": ["customer_handling", "communication"],
    "sales": ["sales_upselling", "communication", "customer_handling"],
    "sales_marketing": ["sales_upselling", "communication", "customer_handling"],
}
SALES_ALLOWED_CATEGORIES = {"customer_service", "sales", "sales_marketing"}


def _pick_ordered(qs: Iterable[InterviewQuestion], limit: int, selected: List[InterviewQuestion], seen_ids: set):
    for q in qs:
        if q.id in seen_ids:
            continue
        selected.append(q)
        seen_ids.add(q.id)
        if len(selected) >= limit:
            break


def select_questions_for_interview(interview, minimum_required: int = 5) -> Sequence[InterviewQuestion]:
    """
    Deterministic competency-based selection for Initial Interview.
    - 70-80% from general competency pool (communication/customer_handling/problem_explanation)
    - 20-30% from category-aligned competencies (e.g., troubleshooting for IT)
    - Sales/upselling questions are only allowed for sales/customer-service categories.
    """
    if not interview or not getattr(interview, "position_type_id", None):
        return InterviewQuestion.objects.none()

    category_code = getattr(interview.position_type, "code", None)

    base_qs = (
        InterviewQuestion.objects.filter(
            is_active=True,
            position_type_id=interview.position_type_id,
        )
        .order_by("order", "id")
        .select_related("question_type", "position_type")
    )

    allowed_category_competencies = CATEGORY_COMPETENCY_MAP.get(category_code, [])
    general_qs = base_qs.filter(competency__in=GENERAL_COMPETENCIES)
    category_qs = base_qs.filter(competency__in=allowed_category_competencies)

    # Safety guard: no sales/upselling unless the category explicitly allows it
    if category_code not in SALES_ALLOWED_CATEGORIES:
        general_qs = general_qs.exclude(competency="sales_upselling")
        category_qs = category_qs.exclude(competency="sales_upselling")
        base_qs = base_qs.exclude(competency="sales_upselling")

    total_available = base_qs.count()
    if total_available == 0:
        return InterviewQuestion.objects.none()

    total_target = min(total_available, max(minimum_required, 5))
    general_target = max(1, int(round(total_target * 0.7)))
    category_target = max(0, total_target - general_target)

    selected: List[InterviewQuestion] = []
    seen_ids: set = set()

    _pick_ordered(general_qs, general_target, selected, seen_ids)
    _pick_ordered(category_qs, general_target + category_target, selected, seen_ids)

    # Fallbacks: fill any remaining slots with general pool, then any remaining base questions
    if len(selected) < total_target:
        _pick_ordered(general_qs, total_target, selected, seen_ids)
    if len(selected) < total_target:
        _pick_ordered(base_qs, total_target, selected, seen_ids)

    return selected
