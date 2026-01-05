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
    - Group by job position (PositionType) and competency.
    - Use fixed blueprint order; randomize content within each competency.
    - Seeded by interview.id for reproducibility.
    """
    if not interview or not getattr(interview, "position_type_id", None):
        return InterviewQuestion.objects.none()

    total_target = max(minimum_required, len(INTERVIEW_BLUEPRINT))
    if total_target != len(INTERVIEW_BLUEPRINT):
        raise ValueError("Interview blueprint length must equal required question count.")

    base_qs = (
        InterviewQuestion.objects.filter(
            is_active=True,
            position_type_id=interview.position_type_id,
            question_type__code="general",
        )
        .order_by("id")
        .select_related("question_type", "category", "position_type")
    )

    pools: Dict[str, List[InterviewQuestion]] = {}
    for question in base_qs:
        pools.setdefault(question.competency, []).append(question)

    available_count = sum(len(pool) for pool in pools.values())
    if available_count < total_target:
        raise ValueError(
            "Not enough questions to build an interview "
            f"(required={total_target}, available={available_count})."
        )

    seed_value = getattr(interview, "id", None) or getattr(interview, "applicant_id", None)
    rng = random.Random(seed_value)

    selected: List[InterviewQuestion] = []
    metadata: List[dict] = []
    seen_ids = set()

    for competency in INTERVIEW_BLUEPRINT:
        pool = [q for q in pools.get(competency, []) if q.id not in seen_ids]
        fallback_used = False

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
                    break

        if not pool:
            remaining_pool = [
                q
                for pool in pools.values()
                for q in pool
                if q.id not in seen_ids
            ]
            if remaining_pool:
                pool = remaining_pool
                selected_competency = getattr(pool[0], "competency", competency)

        if not pool:
            raise ValueError(
                f"Not enough questions to fill competency slot '{competency}' "
                f"(required={total_target}, selected={len(selected)})."
            )

        pick = rng.choice(pool)
        selected_competency = pick.competency
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

    logger.info(
        "Interview questions selected",
        extra={
            "interview_id": getattr(interview, "id", None),
            "position_type_id": getattr(interview, "position_type_id", None),
            "total_available": available_count,
            "counts_by_competency": {key: len(value) for key, value in pools.items()},
            "selected_question_ids": [q.id for q in selected],
        },
    )

    return selected, metadata


def select_questions_for_interview(interview, minimum_required: int = 5) -> Sequence[InterviewQuestion]:
    selected, _metadata = select_questions_for_interview_with_metadata(
        interview, minimum_required=minimum_required
    )
    return selected
