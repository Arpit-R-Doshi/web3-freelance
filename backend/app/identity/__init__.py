"""
identity/__init__.py — Identity router aggregator.

Exposes an identity router with endpoints for DID resolution
and credential verification — useful for demo verification flows.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.database.models import CredentialResponse, TokenData
from app.identity.credential_verifier import extract_claims_no_verify, verify_credential
from app.identity.did_service import resolve_did
from app.middleware.rbac_middleware import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/identity", tags=["Decentralized Identity"])


@router.get(
    "/resolve/{did:path}",
    summary="Resolve a DID Document",
    description="Resolve a `did:key` identifier and return its DID Document.",
)
async def resolve_did_endpoint(did: str) -> dict:
    try:
        doc = resolve_did(did)
        return {"did": did, "document": doc}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not resolve DID: {exc}",
        ) from exc


@router.post(
    "/verify-credential",
    summary="Verify a Verifiable Credential",
    description=(
        "Submit a signed VC JWT to verify its signature and extract claims. "
        "Requires authentication."
    ),
)
async def verify_credential_endpoint(
    body: dict,
    current_user: TokenData = Depends(get_current_user),
) -> dict:
    vc_jwt = body.get("vc_jwt", "")
    if not vc_jwt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request body must include 'vc_jwt' key.",
        )
    try:
        result = await verify_credential(vc_jwt)
        return {"verified": True, "claims": result}
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/my-credentials",
    summary="Retrieve issued credentials for the current user",
    description="Lists all Verifiable Credentials issued to the authenticated user.",
)
async def my_credentials(
    current_user: TokenData = Depends(get_current_user),
) -> dict:
    from app.database.db import get_db

    db = get_db()
    result = (
        db.table("credentials")
        .select("id, vc_jwt, issued_at")
        .eq("user_id", current_user.user_id)
        .order("issued_at", desc=True)
        .execute()
    )

    credentials = []
    for row in result.data or []:
        claims = extract_claims_no_verify(row["vc_jwt"])
        credentials.append(
            {
                "id": row["id"],
                "issued_at": row["issued_at"],
                "claims": claims,
            }
        )

    return {"user_id": current_user.user_id, "credentials": credentials}
