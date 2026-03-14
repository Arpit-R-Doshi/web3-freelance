from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

from app.database import get_db
from app.models.project import Project
from app.services.milestone_service import MilestoneService
from app.services.github_service import GithubService
from app.services.repo_service import RepoService
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])

class ProjectCreateRequest(BaseModel):
    name: str
    description: str
    freelancer_github: str

@router.post("")
def create_project(request: ProjectCreateRequest, db: Session = Depends(get_db)):
    """
    Analyzes requirements, generates milestones & tests, creates GitHub repo, clones it.
    """
    logger.info(f"Creating project: {request.name}")
    import uuid

    # 1. Generate repo name based on project name
    base_repo_name = "".join(x for x in request.name if x.isalnum() or x in " -_").replace(" ", "-").lower()
    repo_name = f"{base_repo_name}-{uuid.uuid4().hex[:6]}"

    # 2. Add Project to DB initially to get ID for milestones
    project = Project(
        name=request.name,
        description=request.description,
        repo_name=repo_name,
        status="pending"
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    
    # 3. Process Requirements into Milestones and Tests
    milestone_service = MilestoneService(db)
    created_milestones = milestone_service.process_requirements(project.id, request.description)

    # 4. Create GitHub Repository
    github_service = GithubService()
    repo_data = github_service.create_repository(repo_name, request.description)
    repo_url = repo_data.get("html_url", f"https://github.com/mock/{repo_name}")
    
    # Update project with GitHub URL
    project.github_url = repo_url
    db.commit()
    
    # 5. Add Freelancer Collaborator
    if request.freelancer_github:
        github_service.add_collaborator(repo_name, request.freelancer_github)
        
    # 6. Clone repository locally
    repo_service = RepoService()
    try:
        repo_service.setup_local_repo(repo_url, repo_name)
    except Exception as e:
        logger.error(f"Error checking out repo: {e}")
        # Not throwing exception to ensure project is partially created.
        
    # 7. Format response — include project_id so Integration Service can store the mapping
    return {
        "project_id": project.id,
        "repo_url": repo_url,
        "milestones": [{"id": m.id, "title": m.title, "description": m.description, "status": m.status} for m in created_milestones]
    }

@router.get("/{project_id}/status")
def get_project_status(project_id: int, db: Session = Depends(get_db)):
    """Fetches the overall status and milestone statuses of a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    return {
        "project_id": project.id,
        "project": project.name,
        "milestones": [
            {
                "id": m.id,
                "title": m.title,
                "description": m.description,
                "status": m.status
            } for m in project.milestones
        ]
    }
