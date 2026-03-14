"""
auth/auth_routes.py — Registration and login endpoints.

POST /auth/register  — creates a user, generates a DID, returns JWT
POST /auth/login     — validates credentials, returns JWT
"""

import logging
from fastapi import APIRouter, HTTPException, status

from app.auth.jwt_handler import create_access_token
from app.auth.password_utils import hash_password, verify_password
from app.database.db import get_db
from app.database.models import (
    KYCStatus,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserPublic,
    UserRole,
)
from app.identity.did_service import generate_did

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description=(
        "Creates a new user account, generates a `did:key` decentralized identifier, "
        "and returns a signed JWT on success."
    ),
)
async def register(payload: UserCreate) -> TokenResponse:
    db = get_db()

    # ── 1. Ensure email is not already taken ──────────────────────────────────
    existing = (
        db.table("users").select("id").eq("email", payload.email).execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    # ── 2. Hash password ──────────────────────────────────────────────────────
    password_hash = hash_password(payload.password)

    # ── 3. Generate DID + JWK keypair ─────────────────────────────────────────
    try:
        did, jwk = generate_did()
        logger.info("Generated DID: %s", did)
    except Exception as exc:
        logger.error("DID generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate decentralized identifier.",
        ) from exc

    # ── 4. Persist user ───────────────────────────────────────────────────────
    user_data = {
        "email": payload.email,
        "password_hash": password_hash,
        "did": did,
        "jwk": jwk,
        "role": payload.role.value,
        "kyc_status": KYCStatus.UNVERIFIED.value,
    }

    result = db.table("users").insert(user_data).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save user record.",
        )

    user_row = result.data[0]

    # ── 5. Issue JWT ───────────────────────────────────────────────────────────
    token = create_access_token(
        user_id=user_row["id"],
        role=UserRole(user_row["role"]),
        kyc_status=KYCStatus(user_row["kyc_status"]),
    )

    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user_row["id"],
            email=user_row["email"],
            did=user_row["did"],
            role=UserRole(user_row["role"]),
            kyc_status=KYCStatus(user_row["kyc_status"]),
        ),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login and retrieve a JWT",
    description="Validates email/password and returns a signed JWT.",
)
async def login(payload: UserLogin) -> TokenResponse:
    db = get_db()

    # ── 1. Fetch user ──────────────────────────────────────────────────────────
    result = (
        db.table("users")
        .select("*")
        .eq("email", payload.email)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    user_row = result.data[0]

    # ── 2. Verify password ─────────────────────────────────────────────────────
    if not verify_password(payload.password, user_row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # ── 3. Issue JWT ──────────────────────────────────────────────────────────
    token = create_access_token(
        user_id=user_row["id"],
        role=UserRole(user_row["role"]),
        kyc_status=KYCStatus(user_row["kyc_status"]),
    )

    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user_row["id"],
            email=user_row["email"],
            did=user_row.get("did"),
            role=UserRole(user_row["role"]),
            kyc_status=KYCStatus(user_row["kyc_status"]),
        ),
    )
