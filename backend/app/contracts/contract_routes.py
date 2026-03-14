"""
contracts/contract_routes.py — Demo RBAC-protected contract endpoints.

These routes demonstrate RBAC enforcement in action:

  POST /contracts/create  → requires 'create_contract'  (CLIENT role)
  POST /contracts/accept  → requires 'accept_contract'  (FREELANCER role)
  POST /contracts/submit  → requires 'submit_work'      (FREELANCER role)

The business logic is intentionally minimal — the value is in the
authorization demonstration, not in complex contract management.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, status

from app.database.models import ContractAccept, ContractCreate, ContractSubmit, TokenData
from app.rbac.authorization import require_permission
from app.rbac.permissions import Permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/contracts", tags=["Contracts (RBAC Demo)"])


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new contract",
    description=(
        "**Required role:** `CLIENT`  \n"
        "**Required permission:** `create_contract`  \n\n"
        "Clients use this endpoint to post new work contracts."
    ),
)
async def create_contract(
    payload: ContractCreate,
    current_user: TokenData = Depends(require_permission(Permission.CREATE_CONTRACT)),
) -> dict:
    contract_id = str(uuid.uuid4())
    logger.info(
        "Contract created by CLIENT user_id=%s title='%s'",
        current_user.user_id,
        payload.title,
    )
    return {
        "message": "Contract created successfully.",
        "contract": {
            "id": contract_id,
            "title": payload.title,
            "description": payload.description,
            "budget": payload.budget,
            "status": "open",
            "created_by": current_user.user_id,
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
        },
        "authorized_by": {
            "role": current_user.role.value,
            "permission": Permission.CREATE_CONTRACT,
        },
    }


@router.post(
    "/accept",
    summary="Accept an existing contract",
    description=(
        "**Required role:** `FREELANCER`  \n"
        "**Required permission:** `accept_contract`  \n\n"
        "Freelancers accept open contracts to begin work."
    ),
)
async def accept_contract(
    payload: ContractAccept,
    current_user: TokenData = Depends(require_permission(Permission.ACCEPT_CONTRACT)),
) -> dict:
    logger.info(
        "Contract %s accepted by FREELANCER user_id=%s",
        payload.contract_id,
        current_user.user_id,
    )
    return {
        "message": "Contract accepted successfully.",
        "contract": {
            "id": payload.contract_id,
            "status": "in_progress",
            "accepted_by": current_user.user_id,
            "accepted_at": datetime.now(tz=timezone.utc).isoformat(),
        },
        "authorized_by": {
            "role": current_user.role.value,
            "permission": Permission.ACCEPT_CONTRACT,
        },
    }


@router.post(
    "/submit",
    summary="Submit completed work for a contract",
    description=(
        "**Required role:** `FREELANCER`  \n"
        "**Required permission:** `submit_work`  \n\n"
        "Freelancers submit their deliverables for client review."
    ),
)
async def submit_work(
    payload: ContractSubmit,
    current_user: TokenData = Depends(require_permission(Permission.SUBMIT_WORK)),
) -> dict:
    logger.info(
        "Work submitted for contract %s by FREELANCER user_id=%s",
        payload.contract_id,
        current_user.user_id,
    )
    return {
        "message": "Work submitted successfully. Awaiting client review.",
        "submission": {
            "contract_id": payload.contract_id,
            "work_url": payload.work_url,
            "notes": payload.notes,
            "submitted_by": current_user.user_id,
            "submitted_at": datetime.now(tz=timezone.utc).isoformat(),
            "status": "under_review",
        },
        "authorized_by": {
            "role": current_user.role.value,
            "permission": Permission.SUBMIT_WORK,
        },
    }
