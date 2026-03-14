"""
kyc/kyc_routes.py — KYC submission and status endpoints.

POST /kyc/submit  — accepts multipart upload, saves files, auto-approves, returns VC
GET  /kyc/status  — returns current KYC status for authenticated user
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.database.models import CredentialResponse, KYCStatusResponse
from app.kyc.document_processor import extract_document_info, save_file
from app.kyc.kyc_service import approve_kyc, get_kyc_status, submit_kyc
from app.middleware.rbac_middleware import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kyc", tags=["KYC Verification"])


@router.post(
    "/submit",
    response_model=CredentialResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit KYC documents",
    description=(
        "Upload identity documents and a selfie. The platform simulates verification "
        "and immediately issues a Verifiable Credential upon success."
    ),
)
async def submit_kyc_endpoint(
    document_type: str = Form(..., description="E.g. passport, driving_licence, national_id"),
    document_number: str = Form(..., description="Document identifier number"),
    document_image: UploadFile = File(..., description="Front image of the identity document"),
    selfie_image: UploadFile = File(..., description="Selfie photograph of the applicant"),
    current_user=Depends(get_current_user),
) -> CredentialResponse:
    user_id = current_user.user_id

    # ── 1. Save uploaded files ────────────────────────────────────────────────
    doc_path = await save_file(document_image, subdirectory=user_id)
    selfie_path = await save_file(selfie_image, subdirectory=user_id)

    # ── 2. Extract document info (simulated) ──────────────────────────────────
    doc_info = extract_document_info(doc_path, document_type, document_number)
    logger.info("Document info: %s", doc_info)

    # ── 3. Persist KYC submission ─────────────────────────────────────────────
    kyc_record = await submit_kyc(
        user_id=user_id,
        document_type=document_type,
        document_number=document_number,
        document_path=doc_path,
        selfie_path=selfie_path,
    )

    # ── 4. Auto-approve and issue VC ──────────────────────────────────────────
    vc_jwt = await approve_kyc(user_id=user_id)

    return CredentialResponse(
        credential_id=kyc_record.id,
        vc_jwt=vc_jwt,
        message="KYC verified. Verifiable Credential issued successfully.",
    )


@router.get(
    "/status",
    response_model=KYCStatusResponse,
    summary="Get current KYC verification status",
)
async def kyc_status_endpoint(
    current_user=Depends(get_current_user),
) -> KYCStatusResponse:
    info = get_kyc_status(current_user.user_id)
    return KYCStatusResponse(**info)
