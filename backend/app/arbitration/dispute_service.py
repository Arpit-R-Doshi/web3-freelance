"""
arbitration/dispute_service.py — Dispute lifecycle management.

Handles creation of disputes, jury assignment, vote collection,
majority resolution, and delegation of reputation updates.
"""

import logging
from collections import Counter
from typing import List, Optional

from fastapi import HTTPException, status

from app.arbitration.jury_service import select_jury
from app.arbitration.reputation_service import process_resolution
from app.database.db import get_db
from app.database.models import DisputeDB, VoteDB, VoteDecision

logger = logging.getLogger(__name__)

JURY_SIZE = 3


def create_dispute(client_id: str, job_id: str, freelancer_id: str, skill: str) -> DisputeDB:
    """Create a new dispute and assign a jury.

    Steps:
        1. Insert dispute row with ``status='open'``.
        2. Select jury via ``select_jury()`` (KYC-aware with fallback).
        3. Update dispute with ``jury`` and ``status='in_arbitration'``.

    Args:
        client_id:     UUID of the client raising the dispute.
        job_id:        Job/milestone identifier.
        freelancer_id: UUID of the freelancer being disputed.
        skill:         Skill category for jury matching.

    Returns:
        Complete DisputeDB record.

    Raises:
        HTTPException 422: If jury selection fails.
    """
    db = get_db()

    # ── 1. Insert initial dispute ─────────────────────────────────────────────
    insert_result = (
        db.table("disputes")
        .insert({
            "job_id": job_id,
            "client_id": client_id,
            "freelancer_id": freelancer_id,
            "skill": skill,
            "status": "open",
        })
        .execute()
    )

    if not insert_result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create dispute record.",
        )

    dispute_row = insert_result.data[0]
    dispute_id = dispute_row["id"]

    logger.info(
        "Dispute created: id=%s client=%s freelancer=%s skill=%s",
        dispute_id,
        client_id,
        freelancer_id,
        skill,
    )

    # ── 2. Select jury ────────────────────────────────────────────────────────
    jury = select_jury(skill=skill, exclude_ids=[client_id, freelancer_id])

    # ── 3. Assign jury and transition to in_arbitration ───────────────────────
    update_result = (
        db.table("disputes")
        .update({
            "jury": jury,
            "status": "in_arbitration",
        })
        .eq("id", dispute_id)
        .execute()
    )

    updated_row = update_result.data[0]
    logger.info("Dispute %s → in_arbitration with jury=%s", dispute_id, jury)

    return DisputeDB(**updated_row)


def get_dispute(dispute_id: str) -> DisputeDB:
    """Fetch a dispute by ID.

    Raises:
        HTTPException 404: If the dispute does not exist.
    """
    db = get_db()
    result = (
        db.table("disputes")
        .select("*")
        .eq("id", dispute_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dispute {dispute_id} not found.",
        )

    return DisputeDB(**result.data[0])


def get_votes_for_dispute(dispute_id: str) -> List[VoteDB]:
    """Return all votes cast for a specific dispute."""
    db = get_db()
    result = (
        db.table("votes")
        .select("*")
        .eq("dispute_id", dispute_id)
        .execute()
    )
    return [VoteDB(**row) for row in (result.data or [])]


def submit_vote(
    dispute_id: str,
    juror_id: str,
    decision: VoteDecision,
) -> dict:
    """Record a juror's vote and trigger resolution if all jurors have voted.

    Guards:
        - Dispute must be ``in_arbitration``.
        - Juror must be in the dispute's ``jury`` list.
        - Juror must not have already voted (enforced by DB unique constraint).

    Args:
        dispute_id: UUID of the dispute.
        juror_id:   UUID of the voting juror.
        decision:   The juror's decision.

    Returns:
        Dict with ``dispute_resolved``, ``result`` (if resolved), and ``message``.

    Raises:
        HTTPException 404: Dispute not found.
        HTTPException 403: Juror not assigned to this dispute.
        HTTPException 409: Juror already voted.
        HTTPException 400: Dispute not in arbitration.
    """
    db = get_db()

    # ── 1. Fetch dispute ──────────────────────────────────────────────────────
    dispute = get_dispute(dispute_id)

    if dispute.status.value != "in_arbitration":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dispute is '{dispute.status.value}', not in_arbitration.",
        )

    if juror_id not in dispute.jury:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned as a juror for this dispute.",
        )

    # ── 2. Check for duplicate vote ───────────────────────────────────────────
    existing_vote = (
        db.table("votes")
        .select("id")
        .eq("dispute_id", dispute_id)
        .eq("juror_id", juror_id)
        .execute()
    )

    if existing_vote.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already voted on this dispute.",
        )

    # ── 3. Insert vote ────────────────────────────────────────────────────────
    db.table("votes").insert({
        "dispute_id": dispute_id,
        "juror_id": juror_id,
        "decision": decision.value,
    }).execute()

    logger.info(
        "Vote recorded: dispute=%s juror=%s decision=%s",
        dispute_id,
        juror_id,
        decision.value,
    )

    # ── 4. Check if all jurors have voted ─────────────────────────────────────
    all_votes = get_votes_for_dispute(dispute_id)

    if len(all_votes) >= JURY_SIZE:
        result = resolve_dispute(dispute_id, dispute.jury, all_votes)
        return {
            "dispute_resolved": True,
            "result": result,
            "message": f"All jurors voted. Dispute resolved: {result}.",
        }

    return {
        "dispute_resolved": False,
        "result": None,
        "message": f"Vote recorded. {JURY_SIZE - len(all_votes)} vote(s) remaining.",
    }


def resolve_dispute(
    dispute_id: str,
    jury: List[str],
    votes: List[VoteDB],
) -> str:
    """Calculate majority decision, update dispute, and process reputation.

    Args:
        dispute_id: UUID of the dispute.
        jury:       List of juror UUIDs.
        votes:      List of VoteDB records.

    Returns:
        The majority decision string.
    """
    db = get_db()

    # ── Majority calculation ──────────────────────────────────────────────────
    decision_counts = Counter(v.decision.value for v in votes)
    result, _ = decision_counts.most_common(1)[0]

    logger.info(
        "Dispute %s resolved: result=%s votes=%s",
        dispute_id,
        result,
        dict(decision_counts),
    )

    # ── Update dispute status ─────────────────────────────────────────────────
    db.table("disputes").update({
        "status": "resolved",
        "result": result,
    }).eq("id", dispute_id).execute()

    # ── Update juror reputations ──────────────────────────────────────────────
    process_resolution(
        dispute_id=dispute_id,
        result=result,
        jury=jury,
        votes=votes,
    )

    return result
