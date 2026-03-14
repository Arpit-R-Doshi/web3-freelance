"""
jobs/contract_routes.py — Contract and milestone API endpoints.

  POST /contracts                   — Create a milestone-based contract (CLIENT)
  GET  /contracts/{id}              — Get contract + milestones (parties)
  GET  /contracts/my                — List user's contracts (any auth)
  POST /milestones/{id}/submit      — Submit work for a milestone (FREELANCER)
  POST /milestones/{id}/approve     — Approve a milestone (CLIENT)
"""

import logging

from fastapi import APIRouter, Depends, status

from app.database.models import (
    ContractCreateRequest,
    ContractResponse,
    MilestoneDB,
    MilestoneSubmitRequest,
    TokenData,
)
from app.jobs.contract_service import (
    approve_milestone,
    create_contract,
    get_contract,
    get_contract_milestones,
    get_user_contracts,
    submit_milestone,
)
from app.middleware.rbac_middleware import get_current_user
from app.rbac.authorization import require_permission
from app.rbac.permissions import Permission

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Contracts"])


@router.post(
    "/contracts",
    response_model=ContractResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a milestone-based contract",
    description="**Required permission:** `create_contract` (CLIENT or ADMIN)",
)
async def create_contract_endpoint(
    payload: ContractCreateRequest,
    current_user: TokenData = Depends(require_permission(Permission.CREATE_CONTRACT)),
) -> ContractResponse:
    contract = create_contract(
        client_id=current_user.user_id,
        job_id=payload.job_id,
        freelancer_id=payload.freelancer_id,
        total_amount=payload.total_amount,
        milestones=payload.milestones,
    )
    milestones = get_contract_milestones(contract.id)
    return ContractResponse(**contract.model_dump(), milestones=milestones)


@router.get(
    "/contracts/my",
    response_model=list[ContractResponse],
    summary="List user's contracts",
    description="Returns all contracts where the user is either client or freelancer.",
)
async def my_contracts_endpoint(
    current_user: TokenData = Depends(get_current_user),
) -> list[ContractResponse]:
    contracts = get_user_contracts(current_user.user_id)
    result = []
    for c in contracts:
        ms = get_contract_milestones(c.id)
        result.append(ContractResponse(**c.model_dump(), milestones=ms))
    return result


@router.get(
    "/contracts/{contract_id}",
    response_model=ContractResponse,
    summary="Get contract details with milestones",
)
async def get_contract_endpoint(
    contract_id: str,
    current_user: TokenData = Depends(get_current_user),
) -> ContractResponse:
    contract = get_contract(contract_id)
    milestones = get_contract_milestones(contract_id)
    return ContractResponse(**contract.model_dump(), milestones=milestones)


@router.post(
    "/milestones/{milestone_id}/submit",
    response_model=MilestoneDB,
    summary="Submit work for a milestone",
    description="**Required permission:** `submit_work` (FREELANCER or ADMIN)",
)
async def submit_milestone_endpoint(
    milestone_id: str,
    payload: MilestoneSubmitRequest,
    current_user: TokenData = Depends(require_permission(Permission.SUBMIT_WORK)),
) -> MilestoneDB:
    return submit_milestone(
        milestone_id=milestone_id,
        freelancer_id=current_user.user_id,
        work_url=payload.work_url,
        submission_notes=payload.submission_notes,
    )


@router.post(
    "/milestones/{milestone_id}/approve",
    response_model=MilestoneDB,
    summary="Approve a submitted milestone",
    description="**Required permission:** `approve_milestone` (CLIENT or ADMIN)",
)
async def approve_milestone_endpoint(
    milestone_id: str,
    current_user: TokenData = Depends(require_permission(Permission.APPROVE_MILESTONE)),
) -> MilestoneDB:
    return approve_milestone(
        milestone_id=milestone_id,
        client_id=current_user.user_id,
    )
