"""
kyc/kyc_service.py — KYC business logic.

Handles KYC submission persistence and the approval workflow.
For the hackathon, KYC is auto-approved immediately after submission.
In production this would invoke a third-party verification service.
"""

import logging
from typing import Optional

from app.database.db import get_db
from app.database.models import KYCRecord, KYCStatus
from app.identity.credential_issuer import issue_credential

logger = logging.getLogger(__name__)


async def submit_kyc(
    user_id: str,
    document_type: str,
    document_number: str,
    document_path: str,
    selfie_path: str,
) -> KYCRecord:
    """Persist a KYC submission and trigger auto-approval.

    Args:
        user_id:         UUID of the submitting user.
        document_type:   E.g. 'passport', 'driving_licence', 'national_id'.
        document_number: Document identifier string.
        document_path:   Local path to saved document image.
        selfie_path:     Local path to saved selfie image.

    Returns:
        KYCRecord with status='pending' (immediately promoted to 'approved').
    """
    db = get_db()

    record_data = {
        "user_id": user_id,
        "document_type": document_type,
        "document_number": document_number,
        "document_path": document_path,
        "selfie_path": selfie_path,
        "status": "pending",
    }

    result = db.table("kyc_submissions").insert(record_data).execute()
    if not result.data:
        raise RuntimeError("Failed to save KYC submission.")

    row = result.data[0]
    logger.info("KYC submission created: %s for user %s", row["id"], user_id)

    return KYCRecord(**row)


async def approve_kyc(user_id: str) -> str:
    """Approve KYC for a user and issue a Verifiable Credential.

    Updates the user's `kyc_status` to 'verified',
    marks the latest KYC submission as 'approved',
    then issues and returns a signed VC JWT.

    Args:
        user_id: UUID of the user to approve.

    Returns:
        Signed VC JWT string.
    """
    db = get_db()

    # ── Update user KYC status ────────────────────────────────────────────────
    db.table("users").update({"kyc_status": KYCStatus.VERIFIED.value}).eq(
        "id", user_id
    ).execute()

    # ── Update latest KYC submission ──────────────────────────────────────────
    submissions = (
        db.table("kyc_submissions")
        .select("id")
        .eq("user_id", user_id)
        .order("submitted_at", desc=True)
        .limit(1)
        .execute()
    )
    if submissions.data:
        db.table("kyc_submissions").update({"status": "approved"}).eq(
            "id", submissions.data[0]["id"]
        ).execute()

    # ── Fetch user DID ────────────────────────────────────────────────────────
    user_result = db.table("users").select("did").eq("id", user_id).execute()
    if not user_result.data or not user_result.data[0].get("did"):
        raise RuntimeError(f"No DID found for user {user_id}; cannot issue VC.")

    user_did = user_result.data[0]["did"]

    # ── Issue Verifiable Credential ───────────────────────────────────────────
    vc_jwt = await issue_credential(
        user_id=user_id,
        user_did=user_did,
    )

    logger.info("KYC approved and VC issued for user %s", user_id)
    return vc_jwt


def get_kyc_status(user_id: str) -> dict:
    """Return the current KYC status and latest submission metadata.

    Args:
        user_id: UUID of the user.

    Returns:
        Dict with ``kyc_status``, optional ``submission_id``, ``submitted_at``.
    """
    db = get_db()

    # User row
    user_res = (
        db.table("users").select("kyc_status").eq("id", user_id).execute()
    )
    if not user_res.data:
        raise ValueError(f"User {user_id} not found.")

    kyc_status = user_res.data[0]["kyc_status"]

    # Latest submission
    sub_res = (
        db.table("kyc_submissions")
        .select("id, submitted_at, status")
        .eq("user_id", user_id)
        .order("submitted_at", desc=True)
        .limit(1)
        .execute()
    )

    sub = sub_res.data[0] if sub_res.data else {}

    return {
        "user_id": user_id,
        "kyc_status": kyc_status,
        "submission_id": sub.get("id"),
        "submitted_at": sub.get("submitted_at"),
        "submission_status": sub.get("status"),
    }
