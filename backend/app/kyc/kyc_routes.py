"""
kyc/kyc_routes.py — KYC submission and status endpoints.

POST /kyc/submit  — accepts multipart upload, runs real Aadhaar verification, returns VC
GET  /kyc/status  — returns current KYC status for authenticated user
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.database.models import CredentialResponse, KYCStatusResponse
from app.kyc.document_processor import extract_document_info, save_file
from app.kyc.kyc_service import approve_kyc, get_kyc_status, reject_kyc, submit_kyc
from app.middleware.rbac_middleware import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kyc", tags=["KYC Verification"])


@router.post(
    "/submit",
    response_model=CredentialResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit Aadhaar KYC documents",
    description=(
        "Upload an **Aadhaar card image** (JPEG/PNG) and a **selfie**. "
        "The system performs real OCR, Aadhaar number validation (Verhoeff checksum), "
        "and face matching before issuing a Verifiable Credential."
    ),
)
async def submit_kyc_endpoint(
    document_type: str = Form(..., description="Must be 'aadhaar'"),
    document_number: str = Form(..., description="12-digit Aadhaar number (e.g. 1234 5678 9012)"),
    document_image: UploadFile = File(..., description="Front image of Aadhaar card (JPEG or PNG)"),
    selfie_image: UploadFile = File(..., description="Clear front-facing selfie photo (JPEG or PNG)"),
    current_user=Depends(get_current_user),
) -> CredentialResponse:
    user_id = current_user.user_id

    # ── 1. Save uploaded files ────────────────────────────────────────────────
    doc_path = await save_file(document_image, subdirectory=user_id)
    selfie_path = await save_file(selfie_image, subdirectory=user_id)

    # ── 2. Run real Aadhaar verification pipeline ─────────────────────────────
    doc_info = extract_document_info(
        document_path=doc_path,
        document_type=document_type,
        document_number=document_number,
        selfie_path=selfie_path,
    )
    logger.info("Verification result for user %s: %s", user_id, doc_info)

    # ── 3. Persist KYC submission record ──────────────────────────────────────
    extracted_number = doc_info.get("aadhaar_number") or document_number
    kyc_record = await submit_kyc(
        user_id=user_id,
        document_type=document_type,
        document_number=extracted_number,
        document_path=doc_path,
        selfie_path=selfie_path,
    )

    # ── 4. Gate on verification result ────────────────────────────────────────
    if doc_info.get("verification_status") != "passed":
        # Mark KYC as rejected in DB, then return a clear 422
        reason = doc_info.get("reason", "verification_failed")
        detail = doc_info.get("detail", "Document verification did not pass.")
        await reject_kyc(user_id=user_id, reason=reason)

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "KYC verification failed.",
                "reason": reason,
                "detail": detail,
                "face_distance": doc_info.get("face_distance"),
            },
        )

    # ── 5. Approve and issue Verifiable Credential ────────────────────────────
    vc_jwt = await approve_kyc(user_id=user_id)

    return CredentialResponse(
        credential_id=kyc_record.id,
        vc_jwt=vc_jwt,
        message=(
            f"Aadhaar KYC verified. "
            f"Confidence: {doc_info.get('confidence', 'N/A')} | "
            f"Face distance: {doc_info.get('face_distance', 'N/A')}. "
            f"Verifiable Credential issued."
        ),
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
