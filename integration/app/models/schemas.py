from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


# ── Request Schemas ────────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    name: str
    description: str
    freelancer_github: str
    freelancer_wallet: str
    client_wallet: Optional[str] = None  # Connected wallet address of the client
    payment_amount_usdt: float
    skill_category: Optional[str] = "general"
    blockchain_project_id: int  # Set by frontend after on-chain createProject()


class DisputeRequest(BaseModel):
    reason: Optional[str] = ""


class ValidatorCompleteRequest(BaseModel):
    validator_project_id: int


# ── Response Schemas ───────────────────────────────────────────────────────────

class MilestoneOut(BaseModel):
    id: int
    title: str
    description: str
    status: str  # pending | completed | failed


class ProjectOut(BaseModel):
    id: str
    project_name: str
    status: str
    client_wallet: str
    worker_wallet: str
    freelancer_github: str
    total_amount_usdt: float
    revision_count: int
    revision_paid_usdt: float
    blockchain_project_id: Optional[int]
    validator_project_id: Optional[int]
    dispute_id: Optional[str]
    skill_category: Optional[str]
    created_at: datetime
    milestones: List[MilestoneOut] = []


class CreateProjectResponse(BaseModel):
    integration_project_id: str
    validator_project_id: Optional[int]
    github_repo_url: str
    milestones: List[MilestoneOut]


class ActionResponse(BaseModel):
    success: bool
    message: str
    tx_hash: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    services: dict
