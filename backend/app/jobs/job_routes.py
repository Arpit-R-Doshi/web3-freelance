"""
jobs/job_routes.py — Job posting and application API endpoints.

  POST /jobs                        — Post a new job (CLIENT)
  GET  /jobs                        — Browse open jobs (any)
  GET  /jobs/{id}                   — Get job details (any)
  POST /jobs/{id}/apply             — Apply to a job (FREELANCER)
  GET  /jobs/{id}/applications      — View applications (CLIENT/owner)
  POST /applications/{id}/accept    — Accept an application (CLIENT/owner)
"""

import logging

from fastapi import APIRouter, Depends, Query, status

from app.database.models import (
    ApplicationCreateRequest,
    ApplicationResponse,
    JobCreateRequest,
    JobResponse,
    TokenData,
)
from app.jobs.job_service import (
    accept_application,
    apply_to_job,
    create_job,
    get_job,
    list_applications,
    list_jobs,
)
from app.middleware.rbac_middleware import get_current_user
from app.rbac.authorization import require_permission
from app.rbac.permissions import Permission

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Jobs"])


@router.post(
    "/jobs",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Post a new job",
    description="**Required permission:** `post_job` (CLIENT or ADMIN)",
)
async def create_job_endpoint(
    payload: JobCreateRequest,
    current_user: TokenData = Depends(require_permission(Permission.POST_JOB)),
) -> JobResponse:
    job = create_job(
        client_id=current_user.user_id,
        title=payload.title,
        description=payload.description,
        skill_category=payload.skill_category,
        budget=payload.budget,
    )
    return JobResponse(**job.model_dump())


@router.get(
    "/jobs",
    response_model=list[JobResponse],
    summary="Browse open jobs",
    description="Lists open jobs. Optionally filter by `?skill=web_dev`.",
)
async def list_jobs_endpoint(
    skill: str | None = Query(None, description="Filter by skill category"),
    current_user: TokenData = Depends(get_current_user),
) -> list[JobResponse]:
    jobs = list_jobs(skill=skill)
    return [JobResponse(**j.model_dump()) for j in jobs]


@router.get(
    "/jobs/{job_id}",
    response_model=JobResponse,
    summary="Get job details",
)
async def get_job_endpoint(
    job_id: str,
    current_user: TokenData = Depends(get_current_user),
) -> JobResponse:
    from app.database.db import get_db
    job = get_job(job_id)

    # Count applications
    db = get_db()
    apps = db.table("applications").select("id").eq("job_id", job_id).execute()
    app_count = len(apps.data)

    return JobResponse(**job.model_dump(), application_count=app_count)


@router.post(
    "/jobs/{job_id}/apply",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Apply to a job",
    description="**Required permission:** `apply_job` (FREELANCER or ADMIN)",
)
async def apply_to_job_endpoint(
    job_id: str,
    payload: ApplicationCreateRequest,
    current_user: TokenData = Depends(require_permission(Permission.APPLY_JOB)),
) -> ApplicationResponse:
    application = apply_to_job(
        job_id=job_id,
        freelancer_id=current_user.user_id,
        cover_letter=payload.cover_letter,
        proposed_rate=payload.proposed_rate,
    )
    return ApplicationResponse(**application.model_dump())


@router.get(
    "/jobs/{job_id}/applications",
    response_model=list[ApplicationResponse],
    summary="View applications for a job",
    description="Only the job owner (CLIENT) can view applications.",
)
async def list_applications_endpoint(
    job_id: str,
    current_user: TokenData = Depends(get_current_user),
) -> list[ApplicationResponse]:
    apps = list_applications(job_id=job_id, client_id=current_user.user_id)
    return [ApplicationResponse(**a.model_dump()) for a in apps]


@router.post(
    "/applications/{application_id}/accept",
    response_model=ApplicationResponse,
    summary="Accept an application",
    description="Accepts the application, rejects others, and moves the job to `in_progress`.",
)
async def accept_application_endpoint(
    application_id: str,
    current_user: TokenData = Depends(require_permission(Permission.MANAGE_APPLICATION)),
) -> ApplicationResponse:
    app = accept_application(
        application_id=application_id,
        client_id=current_user.user_id,
    )
    return ApplicationResponse(**app.model_dump())
