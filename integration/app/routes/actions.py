from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.jwt_verify import TokenData, get_current_user
from app.models.schemas import ActionResponse, DisputeRequest
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["actions"])


@router.post("/{project_id}/accept", response_model=ActionResponse)
def accept_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Client marks the project as accepted.
    The actual on-chain acceptProject() call is done from the client's wallet via the frontend.
    This endpoint updates the integration DB status.
    """
    if current_user.role != "CLIENT":
        raise HTTPException(status_code=403, detail="Only clients can accept projects")
    result = project_service.handle_accept(db, project_id)
    if result is None:
        raise HTTPException(
            status_code=400,
            detail="Project not found or not in client_review state",
        )
    return ActionResponse(success=True, message="Project accepted. Payment released on-chain via your wallet.")


@router.post("/{project_id}/revise", response_model=ActionResponse)
def request_revision(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Client requests a revision.
    The on-chain requestRevision() call is done from client's wallet via frontend.
    This endpoint tracks revision count in integration DB.
    """
    if current_user.role != "CLIENT":
        raise HTTPException(status_code=403, detail="Only clients can request revisions")
    result = project_service.handle_revise(db, project_id)
    if result is None:
        raise HTTPException(
            status_code=400,
            detail="Project not found or not in client_review state",
        )
    if result == "max_revisions":
        raise HTTPException(status_code=400, detail="Maximum revisions (3) already used")
    proj = project_service.get_project_detail(db, project_id)
    used = proj["revision_count"] if proj else 0
    return ActionResponse(
        success=True,
        message=f"Revision {used}/3 requested. 10% payment released to freelancer on-chain via your wallet.",
    )


@router.post("/{project_id}/dispute", response_model=ActionResponse)
def raise_dispute(
    project_id: str,
    req: DisputeRequest,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Client raises a dispute — creates dispute in Auth Service and freezes funds on-chain."""
    if current_user.role != "CLIENT":
        raise HTTPException(status_code=403, detail="Only clients can raise disputes")

    proj = project_service.get_project_detail(db, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    result = project_service.handle_dispute(
        db=db,
        project_id=project_id,
        auth_user_id=current_user.user_id,
        skill=proj.get("skill_category", "general"),
        user_token=current_user.raw_token,
    )
    if not result:
        raise HTTPException(
            status_code=400,
            detail="Cannot raise dispute — project not in active or client_review state",
        )
    return ActionResponse(
        success=True,
        message="Dispute raised. Funds frozen. Arbitrators will be assigned shortly.",
        tx_hash=result.get("dispute_id"),
    )
