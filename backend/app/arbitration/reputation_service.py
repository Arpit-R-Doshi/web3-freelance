"""
arbitration/reputation_service.py — Reputation scoring and audit logging.

Rewards jurors who vote with the consensus (+10) and penalises
those who vote against (−20), creating a game-theoretic incentive
to judge honestly.
"""

import logging
from typing import List

from app.database.db import get_db
from app.database.models import VoteDB

logger = logging.getLogger(__name__)

# Reputation deltas
REWARD_CORRECT = 10
PENALTY_INCORRECT = -20


def update_reputation(juror_id: str, change: int, reason: str, is_correct: bool) -> None:
    """Update a single juror's reputation and log the change.

    Args:
        juror_id:   UUID of the juror.
        change:     Points to add (positive) or subtract (negative).
        reason:     Human-readable reason for the change.
        is_correct: Whether the juror voted with the consensus.
    """
    db = get_db()

    # ── 1. Fetch current user record ──────────────────────────────────────────
    user_result = (
        db.table("users")
        .select("reputation_score, cases_judged, cases_correct")
        .eq("id", juror_id)
        .single()
        .execute()
    )
    user = user_result.data

    new_score = user["reputation_score"] + change
    new_judged = user["cases_judged"] + 1
    new_correct = user["cases_correct"] + (1 if is_correct else 0)

    # ── 2. Update user reputation ─────────────────────────────────────────────
    db.table("users").update({
        "reputation_score": new_score,
        "cases_judged": new_judged,
        "cases_correct": new_correct,
    }).eq("id", juror_id).execute()

    # ── 3. Insert audit log entry ─────────────────────────────────────────────
    db.table("reputation_logs").insert({
        "user_id": juror_id,
        "change": change,
        "reason": reason,
    }).execute()

    logger.info(
        "Reputation updated: juror=%s change=%+d new_score=%d reason='%s'",
        juror_id,
        change,
        new_score,
        reason,
    )


def process_resolution(
    dispute_id: str,
    result: str,
    jury: List[str],
    votes: List[VoteDB],
) -> None:
    """Apply reputation changes for all jurors after a dispute is resolved.

    Jurors whose vote matches *result* gain ``REWARD_CORRECT`` points.
    Jurors whose vote does not match lose ``PENALTY_INCORRECT`` points.

    Args:
        dispute_id: The resolved dispute's UUID.
        result:     The consensus decision string.
        jury:       List of juror UUIDs.
        votes:      List of VoteDB records.
    """
    vote_map = {v.juror_id: v.decision.value for v in votes}

    for juror_id in jury:
        juror_decision = vote_map.get(juror_id)
        if juror_decision is None:
            logger.warning(
                "Juror %s has no vote for dispute %s — skipping reputation update.",
                juror_id,
                dispute_id,
            )
            continue

        if juror_decision == result:
            update_reputation(
                juror_id=juror_id,
                change=REWARD_CORRECT,
                reason=f"Voted with consensus on dispute {dispute_id}",
                is_correct=True,
            )
        else:
            update_reputation(
                juror_id=juror_id,
                change=PENALTY_INCORRECT,
                reason=f"Voted against consensus on dispute {dispute_id}",
                is_correct=False,
            )

    logger.info("Reputation processing complete for dispute %s", dispute_id)
