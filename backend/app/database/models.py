"""
database/models.py — Pydantic data models.

These models serve three purposes:
  1. Request / response validation (FastAPI body schemas)
  2. Internal data transfer objects between service layers
  3. Database row representations returned from Supabase
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator


# ── Enumerations ──────────────────────────────────────────────────────────────

class UserRole(str, Enum):
    CLIENT = "CLIENT"
    FREELANCER = "FREELANCER"
    ARBITRATOR = "ARBITRATOR"
    ADMIN = "ADMIN"


class KYCStatus(str, Enum):
    UNVERIFIED = "unverified"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


# ── User Models ───────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    """Payload sent by the client during registration."""
    email: EmailStr
    password: str
    role: UserRole = UserRole.CLIENT

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class UserLogin(BaseModel):
    """Payload sent by the client during login."""
    email: EmailStr
    password: str


class UserDB(BaseModel):
    """Full user record as stored in Supabase."""
    id: str
    email: str
    password_hash: str
    did: Optional[str] = None
    jwk: Optional[str] = None          # Ed25519 private key JSON (demo only)
    role: UserRole = UserRole.CLIENT
    kyc_status: KYCStatus = KYCStatus.UNVERIFIED
    created_at: Optional[datetime] = None


class UserPublic(BaseModel):
    """Safe user representation returned to the client (no secrets)."""
    id: str
    email: str
    did: Optional[str] = None
    role: UserRole
    kyc_status: KYCStatus


class TokenResponse(BaseModel):
    """Login / register response containing the JWT."""
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


# ── JWT Payload ───────────────────────────────────────────────────────────────

class TokenData(BaseModel):
    """Decoded JWT payload used internally."""
    user_id: str
    role: UserRole
    kyc_status: KYCStatus


# ── KYC Models ────────────────────────────────────────────────────────────────

class KYCRecord(BaseModel):
    """KYC submission row as stored in Supabase."""
    id: Optional[str] = None
    user_id: str
    document_type: str
    document_number: str
    document_path: str
    selfie_path: str
    status: str = "pending"
    submitted_at: Optional[datetime] = None


class KYCStatusResponse(BaseModel):
    """Response returned when querying KYC status."""
    user_id: str
    kyc_status: KYCStatus
    submission_id: Optional[str] = None
    submitted_at: Optional[datetime] = None


# ── Credential Models ─────────────────────────────────────────────────────────

class CredentialRecord(BaseModel):
    """Verifiable Credential row as stored in Supabase."""
    id: Optional[str] = None
    user_id: str
    vc_jwt: str
    issued_at: Optional[datetime] = None


class CredentialResponse(BaseModel):
    """Response returned after VC issuance."""
    credential_id: Optional[str] = None
    vc_jwt: str
    message: str = "Verifiable credential issued successfully."


# ── Contract Models (demo) ────────────────────────────────────────────────────

class ContractCreate(BaseModel):
    title: str
    description: Optional[str] = None
    budget: Optional[float] = None


class ContractAccept(BaseModel):
    contract_id: str


class ContractSubmit(BaseModel):
    contract_id: str
    work_url: Optional[str] = None
    notes: Optional[str] = None
