from __future__ import annotations

from typing import Dict, Iterable, Tuple


KEYWORD_MAP: Dict[str, Tuple[str, ...]] = {
    "customer_service": (
        "customer",
        "client",
        "call center",
        "complaint",
        "service",
        "escalat",
        "refund",
        "billing",
        "support",
    ),
    "network_engineer": (
        "network",
        "router",
        "switch",
        "firewall",
        "subnet",
        "tcp",
        "ip ",
        "ip-",
        "dns",
        "dhcp",
        "vpn",
        "routing",
    ),
    "it_support": (
        "helpdesk",
        "ticket",
        "troubleshoot",
        "desktop",
        "laptop",
        "windows",
        "mac",
        "hardware",
        "software",
        "printer",
        "install",
        "operating system",
        "os ",
        "os-",
    ),
    "sales_marketing": (
        "sales",
        "sell",
        "upsell",
        "lead",
        "pipeline",
        "prospect",
        "quota",
        "crm",
        "campaign",
        "marketing",
        "conversion",
        "funnel",
    ),
    "virtual_assistant": (
        "calendar",
        "schedule",
        "scheduling",
        "inbox",
        "email",
        "admin",
        "travel",
        "minutes",
        "data entry",
        "spreadsheet",
        "meeting",
    ),
}


def _normalize_text(text: str | None) -> str:
    return (text or "").strip().lower()


def _keyword_score(text: str, keywords: Iterable[str]) -> int:
    score = 0
    for keyword in keywords:
        if keyword in text:
            score += 1
    return score


def suggest_position_code(question_text: str | None) -> Tuple[str | None, Dict[str, int]]:
    normalized = _normalize_text(question_text)
    scores: Dict[str, int] = {}
    if not normalized:
        return None, scores

    for code, keywords in KEYWORD_MAP.items():
        scores[code] = _keyword_score(normalized, keywords)

    if not scores:
        return None, {}

    best_score = max(scores.values())
    if best_score <= 0:
        return None, scores

    best_matches = [code for code, score in scores.items() if score == best_score]
    if len(best_matches) != 1:
        return None, scores

    return best_matches[0], scores


def get_alignment_error(question_text: str | None, assigned_code: str | None) -> str | None:
    suggested, _scores = suggest_position_code(question_text)
    if not suggested:
        return None
    if not assigned_code:
        return None
    if assigned_code == suggested:
        return None
    return (
        f"Question text suggests '{suggested}' but is assigned to '{assigned_code}'. "
        "Please correct the position before saving."
    )
