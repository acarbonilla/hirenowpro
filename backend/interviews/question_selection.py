from typing import Dict, List, Sequence, Tuple
import logging
import random

from .models import InterviewQuestion


INTERVIEW_BLUEPRINT = [
    "technical_reasoning",
    "troubleshooting",
    "communication",
    "problem_explanation",
    "customer_handling",
]

FALLBACK_COMPETENCY_MAP = {
    "communication": ["problem_explanation", "technical_reasoning"],
    "problem_explanation": ["technical_reasoning"],
    "customer_handling": ["communication", "problem_explanation"],
    "troubleshooting": ["technical_reasoning"],
    "technical_reasoning": ["troubleshooting"],
}

logger = logging.getLogger(__name__)


def select_questions_for_interview_with_metadata(
    interview, minimum_required: int = 5
) -> Tuple[Sequence[InterviewQuestion], List[dict]]:
    """
    Deterministic, seeded competency-based selection for Initial Interview.
    - Group by job category (PositionType) and competency.
    - Use fixed blueprint order; randomize content within each competency.
    - Seeded by interview.id for reproducibility.
    """
    if not interview or not getattr(interview, "position_type_id", None):
        return InterviewQuestion.objects.none()

    total_target = max(minimum_required, len(INTERVIEW_BLUEPRINT))
    if total_target != len(INTERVIEW_BLUEPRINT):
        raise ValueError("Interview blueprint length must equal required question count.")

    all_competencies = set(INTERVIEW_BLUEPRINT)
    for fallback_list in FALLBACK_COMPETENCY_MAP.values():
        all_competencies.update(fallback_list)

    base_qs = (
        InterviewQuestion.objects.filter(
            is_active=True,
            category_id=interview.position_type_id,
            competency__in=all_competencies,
            question_type__code="general",
        )
        .order_by("id")
        .select_related("question_type", "category")
    )

    pools: Dict[str, List[InterviewQuestion]] = {comp: [] for comp in all_competencies}
    for question in base_qs:
        pools.setdefault(question.competency, []).append(question)

    missing = [comp for comp in INTERVIEW_BLUEPRINT if not pools.get(comp)]
    if missing:
        raise ValueError(f"Missing question pool for competencies: {', '.join(missing)}")

    seed_value = getattr(interview, "id", None) or getattr(interview, "applicant_id", None)
    rng = random.Random(seed_value)

    selected: List[InterviewQuestion] = []
    metadata: List[dict] = []
    seen_ids = set()

    for competency in INTERVIEW_BLUEPRINT:
        pool = [q for q in pools.get(competency, []) if q.id not in seen_ids]
        fallback_used = False
        selected_competency = competency

        if not pool:
            fallback_used = True
            fallback_competencies = FALLBACK_COMPETENCY_MAP.get(competency, [])
            pool = []
            for fallback_competency in fallback_competencies:
                fallback_pool = [
                    q for q in pools.get(fallback_competency, []) if q.id not in seen_ids
                ]
                if fallback_pool:
                    pool = fallback_pool
                    selected_competency = fallback_competency
                    break

        if not pool:
            raise ValueError(f"Not enough questions for competency: {competency}")

        pick = rng.choice(pool)
        selected.append(pick)
        seen_ids.add(pick.id)
        if fallback_used and selected_competency != competency:
            logger.info(
                "Interview question fallback used",
                extra={
                    "interview_id": getattr(interview, "id", None),
                    "slot_competency": competency,
                    "selected_competency": selected_competency,
                    "question_id": pick.id,
                },
            )
        metadata.append(
            {
                "slot_competency": competency,
                "selected_competency": selected_competency,
                "question_id": pick.id,
                "fallback_used": fallback_used and selected_competency != competency,
            }
        )

    return selected, metadata


def select_questions_for_interview(interview, minimum_required: int = 5) -> Sequence[InterviewQuestion]:
    selected, _metadata = select_questions_for_interview_with_metadata(
        interview, minimum_required=minimum_required
    )
    return selected
