"""
jobs/contract_service.py — Contract and milestone management.

Handles the second half of the freelance lifecycle:
  client creates contract → freelancer submits work → client approves milestone.
"""

import logging
from typing import List

from fastapi import HTTPException, status

from app.database.db import get_db
from app.database.models import ContractDB, MilestoneDB, MilestoneInput

logger = logging.getLogger(__name__)


def create_contract(
    client_id: str,
    job_id: str,
    freelancer_id: str,
    total_amount: float | None,
    milestones: List[MilestoneInput],
) -> ContractDB:
    """Create a contract with milestones after hiring."""
    db = get_db()

    # Insert contract
    contract_data = {
        "job_id": job_id,
        "client_id": client_id,
        "freelancer_id": freelancer_id,
        "total_amount": total_amount,
        "status": "active",
    }
    result = db.table("contracts").insert(contract_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create contract.")

    contract_id = result.data[0]["id"]

    # Insert milestones
    for ms in milestones:
        ms_data = {
            "contract_id": contract_id,
            "title": ms.title,
            "description": ms.description,
            "amount": ms.amount,
            "status": "pending",
            "due_date": ms.due_date,
        }
        db.table("milestones").insert(ms_data).execute()

    logger.info("Contract created: id=%s job=%s client=%s freelancer=%s milestones=%d",
                contract_id, job_id, client_id, freelancer_id, len(milestones))

    return ContractDB(**result.data[0])


def get_contract(contract_id: str) -> ContractDB:
    """Fetch a contract by ID."""
    db = get_db()
    result = db.table("contracts").select("*").eq("id", contract_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found.")
    return ContractDB(**result.data[0])


def get_contract_milestones(contract_id: str) -> List[MilestoneDB]:
    """Fetch all milestones for a contract."""
    db = get_db()
    result = db.table("milestones").select("*").eq("contract_id", contract_id).execute()
    return [MilestoneDB(**row) for row in result.data]


def get_user_contracts(user_id: str) -> List[ContractDB]:
    """Fetch all contracts where the user is either client or freelancer."""
    db = get_db()
    # Get contracts as client
    as_client = db.table("contracts").select("*").eq("client_id", user_id).execute()
    # Get contracts as freelancer
    as_freelancer = db.table("contracts").select("*").eq("freelancer_id", user_id).execute()

    # Merge and deduplicate
    seen = set()
    contracts = []
    for row in (as_client.data or []) + (as_freelancer.data or []):
        if row["id"] not in seen:
            seen.add(row["id"])
            contracts.append(ContractDB(**row))
    return contracts


def submit_milestone(milestone_id: str, freelancer_id: str,
                     work_url: str | None, submission_notes: str | None) -> MilestoneDB:
    """Freelancer submits work for a milestone."""
    db = get_db()

    # Fetch milestone
    ms_result = db.table("milestones").select("*").eq("id", milestone_id).execute()
    if not ms_result.data:
        raise HTTPException(status_code=404, detail=f"Milestone {milestone_id} not found.")

    milestone = MilestoneDB(**ms_result.data[0])

    # Verify the freelancer owns this contract
    contract = get_contract(milestone.contract_id)
    if contract.freelancer_id != freelancer_id:
        raise HTTPException(status_code=403, detail="Only the assigned freelancer can submit work.")

    if milestone.status.value not in ("pending", "in_progress"):
        raise HTTPException(status_code=400,
                            detail=f"Milestone is '{milestone.status.value}', cannot submit.")

    # Update milestone
    db.table("milestones").update({
        "status": "submitted",
        "work_url": work_url,
        "submission_notes": submission_notes,
    }).eq("id", milestone_id).execute()

    logger.info("Milestone %s submitted by freelancer %s", milestone_id, freelancer_id)

    updated = db.table("milestones").select("*").eq("id", milestone_id).execute()
    return MilestoneDB(**updated.data[0])


def approve_milestone(milestone_id: str, client_id: str) -> MilestoneDB:
    """Client approves a submitted milestone. Auto-completes contract if all done."""
    db = get_db()

    # Fetch milestone
    ms_result = db.table("milestones").select("*").eq("id", milestone_id).execute()
    if not ms_result.data:
        raise HTTPException(status_code=404, detail=f"Milestone {milestone_id} not found.")

    milestone = MilestoneDB(**ms_result.data[0])

    # Verify the client owns this contract
    contract = get_contract(milestone.contract_id)
    if contract.client_id != client_id:
        raise HTTPException(status_code=403, detail="Only the contract client can approve milestones.")

    if milestone.status.value != "submitted":
        raise HTTPException(status_code=400,
                            detail=f"Milestone is '{milestone.status.value}', not submitted.")

    # Approve
    db.table("milestones").update({"status": "approved"}).eq("id", milestone_id).execute()
    logger.info("Milestone %s approved by client %s", milestone_id, client_id)

    # Check if all milestones are approved → auto-complete contract
    all_milestones = get_contract_milestones(contract.id)
    all_approved = all(
        ms.status.value == "approved" or (ms.id == milestone_id)
        for ms in all_milestones
    )

    if all_approved:
        db.table("contracts").update({"status": "completed"}).eq("id", contract.id).execute()
        db.table("jobs").update({"status": "completed"}).eq("id", contract.job_id).execute()
        logger.info("Contract %s auto-completed (all milestones approved)", contract.id)

    updated = db.table("milestones").select("*").eq("id", milestone_id).execute()
    return MilestoneDB(**updated.data[0])
