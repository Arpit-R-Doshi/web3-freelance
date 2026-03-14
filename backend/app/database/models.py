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


# ── Contract Models (demo — kept for backward compat) ─────────────────────────

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


# ══════════════════════════════════════════════════════════════════════════════
# FREELANCE PLATFORM MODELS
# ══════════════════════════════════════════════════════════════════════════════

# ── Freelance Enumerations ────────────────────────────────────────────────────

class JobStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ApplicationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class ContractStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    DISPUTED = "disputed"
    CANCELLED = "cancelled"


class MilestoneStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    DISPUTED = "disputed"


# ── Job Models ────────────────────────────────────────────────────────────────

class JobCreateRequest(BaseModel):
    """Payload to post a new job."""
    title: str
    description: Optional[str] = None
    skill_category: Optional[str] = None
    budget: Optional[float] = None


class JobDB(BaseModel):
    """Job row from the database."""
    id: str
    client_id: str
    title: str
    description: Optional[str] = None
    skill_category: Optional[str] = None
    budget: Optional[float] = None
    status: JobStatus = JobStatus.OPEN
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class JobResponse(BaseModel):
    """Job details returned to clients."""
    id: str
    client_id: str
    title: str
    description: Optional[str] = None
    skill_category: Optional[str] = None
    budget: Optional[float] = None
    status: JobStatus
    application_count: Optional[int] = None
    created_at: Optional[str] = None


# ── Application Models ────────────────────────────────────────────────────────

class ApplicationCreateRequest(BaseModel):
    """Payload for a freelancer to apply to a job."""
    cover_letter: Optional[str] = None
    proposed_rate: Optional[float] = None


class ApplicationDB(BaseModel):
    """Application row from the database."""
    id: str
    job_id: str
    freelancer_id: str
    cover_letter: Optional[str] = None
    proposed_rate: Optional[float] = None
    status: ApplicationStatus = ApplicationStatus.PENDING
    created_at: Optional[str] = None


class ApplicationResponse(BaseModel):
    """Application details returned to clients."""
    id: str
    job_id: str
    freelancer_id: str
    cover_letter: Optional[str] = None
    proposed_rate: Optional[float] = None
    status: ApplicationStatus
    created_at: Optional[str] = None


# ── Contract Models (real) ────────────────────────────────────────────────────

class MilestoneInput(BaseModel):
    """A single milestone within a contract creation request."""
    title: str
    description: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[str] = None


class ContractCreateRequest(BaseModel):
    """Payload to create a milestone-based contract."""
    job_id: str
    freelancer_id: str
    total_amount: Optional[float] = None
    milestones: list[MilestoneInput] = []


class ContractDB(BaseModel):
    """Contract row from the database."""
    id: str
    job_id: str
    client_id: str
    freelancer_id: str
    total_amount: Optional[float] = None
    status: ContractStatus = ContractStatus.ACTIVE
    created_at: Optional[str] = None


class MilestoneDB(BaseModel):
    """Milestone row from the database."""
    id: str
    contract_id: str
    title: str
    description: Optional[str] = None
    amount: Optional[float] = None
    status: MilestoneStatus = MilestoneStatus.PENDING
    work_url: Optional[str] = None
    submission_notes: Optional[str] = None
    due_date: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MilestoneSubmitRequest(BaseModel):
    """Payload for a freelancer to submit work for a milestone."""
    work_url: Optional[str] = None
    submission_notes: Optional[str] = None


class ContractResponse(BaseModel):
    """Contract details with milestones."""
    id: str
    job_id: str
    client_id: str
    freelancer_id: str
    total_amount: Optional[float] = None
    status: ContractStatus
    milestones: list[MilestoneDB] = []
    created_at: Optional[str] = None


# ── Arbitration Enumerations ──────────────────────────────────────────────────

class DisputeStatus(str, Enum):
    OPEN = "open"
    IN_ARBITRATION = "in_arbitration"
    RESOLVED = "resolved"


class VoteDecision(str, Enum):
    CLIENT_WINS = "client_wins"
    FREELANCER_WINS = "freelancer_wins"
    PARTIAL_REFUND = "partial_refund"


# ── Arbitration Request Models ────────────────────────────────────────────────

class DisputeCreate(BaseModel):
    """Payload to raise a new dispute."""
    job_id: str
    freelancer_id: str
    skill: str


class VoteSubmit(BaseModel):
    """Payload for a juror to submit a vote."""
    dispute_id: str
    decision: VoteDecision


# ── Arbitration DB Row Models ─────────────────────────────────────────────────

class DisputeDB(BaseModel):
    """Dispute record as stored in Supabase."""
    id: str
    job_id: str
    client_id: str
    freelancer_id: str
    skill: str
    status: DisputeStatus = DisputeStatus.OPEN
    jury: list[str] = []
    result: Optional[str] = None
    created_at: Optional[datetime] = None


class VoteDB(BaseModel):
    """Vote record as stored in Supabase."""
    id: Optional[str] = None
    dispute_id: str
    juror_id: str
    decision: VoteDecision
    created_at: Optional[datetime] = None


class ReputationLogDB(BaseModel):
    """Reputation change log entry."""
    id: Optional[str] = None
    user_id: str
    change: int
    reason: str
    created_at: Optional[datetime] = None


# ── Arbitration Response Models ───────────────────────────────────────────────

class DisputeResponse(BaseModel):
    """Dispute details returned to the client."""
    id: str
    job_id: str
    client_id: str
    freelancer_id: str
    skill: str
    status: DisputeStatus
    jury: list[str] = []
    result: Optional[str] = None
    votes: Optional[list[VoteDB]] = None
    created_at: Optional[datetime] = None


class VoteResponse(BaseModel):
    """Response after a juror casts a vote."""
    message: str
    dispute_id: str
    decision: VoteDecision
    dispute_resolved: bool = False
    result: Optional[str] = None
