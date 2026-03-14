"""
Internal routes — called by Validator Service (not user-facing).
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.schemas import ValidatorCompleteRequest
from app.services import project_service

router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/validator-complete")
def validator_complete(
    req: ValidatorCompleteRequest,
    db: Session = Depends(get_db),
    x_internal_secret: Optional[str] = Header(None),
):
    """
    Called by Validator Service when all milestones for a project are complete.
    Triggers setClientReview() on-chain.
    """
    success = project_service.handle_validator_complete(db, req.validator_project_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Project not found, already completed, or not in active state",
        )
    return {"success": True, "message": "Project moved to client_review on-chain"}


@router.post("/dispute-resolved")
def dispute_resolved(
    dispute_id: str,
    result: str,  # "freelancer_wins" | "client_wins"
    db: Session = Depends(get_db),
):
    """
    Called after arbitration resolves in Auth Service.
    Triggers on-chain payment release or refund.
    """
    if result not in ("freelancer_wins", "client_wins"):
        raise HTTPException(status_code=400, detail="result must be 'freelancer_wins' or 'client_wins'")
    success = project_service.handle_dispute_resolved(db, dispute_id, result)
    if not success:
        raise HTTPException(status_code=404, detail="No project found for this dispute_id")
    return {"success": True, "result": result}
