from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.jwt_verify import TokenData, get_current_user
from app.models.schemas import CreateProjectRequest, CreateProjectResponse, ProjectOut
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=CreateProjectResponse)
def create_project(
    req: CreateProjectRequest,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    if current_user.role != "CLIENT":
        raise HTTPException(status_code=403, detail="Only clients can create projects")
    if current_user.kyc_status != "verified":
        raise HTTPException(status_code=403, detail="KYC verification required to create projects")

    result = project_service.create_project(
        db=db,
        auth_user_id=current_user.user_id,
        name=req.name,
        description=req.description,
        freelancer_github=req.freelancer_github,
        freelancer_wallet=req.freelancer_wallet,
        client_wallet=req.client_wallet if hasattr(req, "client_wallet") and req.client_wallet else current_user.user_id,
        payment_amount_usdt=req.payment_amount_usdt,
        skill_category=req.skill_category or "general",
        blockchain_project_id=req.blockchain_project_id,
    )

    # store actual wallet — passed via header or body not available in JWT
    # Use freelancer_wallet as worker_wallet; client's wallet stored separately
    return CreateProjectResponse(
        integration_project_id=result["integration_project_id"],
        validator_project_id=result["validator_project_id"],
        github_repo_url=result["github_repo_url"],
        milestones=result["milestones"],
    )


@router.get("", response_model=list)
def list_projects(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    projects = project_service.get_projects_for_user(db, current_user.user_id, current_user.role)
    return projects


@router.get("/{project_id}")
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    project = project_service.get_project_detail(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
