"""
arbitration/jury_service.py — KYC-aware jury selection with reputation fallback.

Selects 3 jurors for a dispute based on:
  1. Skill match
  2. KYC verification status (preferred)
  3. High reputation fallback (score > 1200) when not enough verified jurors
"""

import logging
import random
from typing import List

from fastapi import HTTPException, status

from app.database.db import get_db

logger = logging.getLogger(__name__)

JURY_SIZE = 3
REPUTATION_FALLBACK_THRESHOLD = 1200


def select_jury(skill: str, exclude_ids: List[str]) -> List[str]:
    """Select a jury of 3 users for the given skill category.

    Algorithm:
        1. Find users whose ``skills`` array contains *skill* AND
           ``kyc_status = 'verified'`` AND are NOT in *exclude_ids*.
        2. If ≥ 3 verified candidates → randomly pick 3.
        3. Fallback: broaden to users with ``reputation_score > 1200``
           (regardless of KYC) and randomly pick 3 from the combined pool.
        4. If still < 3 → raise HTTP 422.

    Args:
        skill:       Skill tag to match (e.g. 'web_dev').
        exclude_ids: User IDs to exclude (client + freelancer).

    Returns:
        List of 3 user ID strings.

    Raises:
        HTTPException 422: If fewer than 3 eligible jurors are available.
    """
    db = get_db()

    # ── 1. Try KYC-verified jurors ────────────────────────────────────────────
    verified_result = (
        db.table("users")
        .select("id")
        .contains("skills", [skill])
        .eq("kyc_status", "verified")
        .execute()
    )

    verified_candidates = [
        row["id"] for row in (verified_result.data or [])
        if row["id"] not in exclude_ids
    ]

    logger.info(
        "Jury selection: skill=%s | verified candidates=%d",
        skill,
        len(verified_candidates),
    )

    if len(verified_candidates) >= JURY_SIZE:
        jury = random.sample(verified_candidates, JURY_SIZE)
        logger.info("Jury selected (verified): %s", jury)
        return jury

    # ── 2. Fallback: add high-reputation users ────────────────────────────────
    fallback_result = (
        db.table("users")
        .select("id")
        .contains("skills", [skill])
        .gt("reputation_score", REPUTATION_FALLBACK_THRESHOLD)
        .execute()
    )

    fallback_candidates = [
        row["id"] for row in (fallback_result.data or [])
        if row["id"] not in exclude_ids
    ]

    # Merge both pools (deduplicate)
    all_candidates = list(set(verified_candidates + fallback_candidates))

    logger.info(
        "Jury selection fallback: skill=%s | total pool=%d",
        skill,
        len(all_candidates),
    )

    if len(all_candidates) < JURY_SIZE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Not enough eligible jurors for skill '{skill}'. "
                f"Found {len(all_candidates)}, need {JURY_SIZE}. "
                f"Ensure users have the skill tag and are either KYC-verified "
                f"or have reputation > {REPUTATION_FALLBACK_THRESHOLD}."
            ),
        )

    jury = random.sample(all_candidates, JURY_SIZE)
    logger.info("Jury selected (with fallback): %s", jury)
    return jury
