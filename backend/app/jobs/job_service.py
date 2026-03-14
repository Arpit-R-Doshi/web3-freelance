"""
jobs/job_service.py — Job posting and application logic.

Handles the first half of the freelance lifecycle:
  client posts job → freelancers apply → client accepts application.
"""

import logging
from typing import List, Optional

from fastapi import HTTPException, status

from app.database.db import get_db
from app.database.models import ApplicationDB, JobDB

logger = logging.getLogger(__name__)


def create_job(client_id: str, title: str, description: Optional[str],
               skill_category: Optional[str], budget: Optional[float]) -> JobDB:
    """Create a new job posting."""
    db = get_db()

    data = {
        "client_id": client_id,
        "title": title,
        "description": description,
        "skill_category": skill_category,
        "budget": budget,
        "status": "open",
    }

    result = db.table("jobs").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create job.")

    logger.info("Job created: id=%s by client=%s", result.data[0]["id"], client_id)
    return JobDB(**result.data[0])


def list_jobs(skill: Optional[str] = None, status_filter: str = "open") -> List[JobDB]:
    """List jobs, optionally filtered by skill category."""
    db = get_db()
    qb = db.table("jobs").select("*").eq("status", status_filter)
    if skill:
        qb = qb.eq("skill_category", skill)
    qb = qb.order("created_at", desc=True)
    result = qb.execute()
    return [JobDB(**row) for row in result.data]


def get_job(job_id: str) -> JobDB:
    """Fetch a single job by ID."""
    db = get_db()
    result = db.table("jobs").select("*").eq("id", job_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    return JobDB(**result.data[0])


def apply_to_job(job_id: str, freelancer_id: str,
                 cover_letter: Optional[str], proposed_rate: Optional[float]) -> ApplicationDB:
    """Freelancer applies to a job."""
    db = get_db()

    # Verify job exists and is open
    job = get_job(job_id)
    if job.status.value != "open":
        raise HTTPException(status_code=400, detail="Job is not open for applications.")

    # Verify freelancer isn't the client
    if job.client_id == freelancer_id:
        raise HTTPException(status_code=400, detail="You cannot apply to your own job.")

    # Check for duplicate application
    existing = (
        db.table("applications").select("id")
        .eq("job_id", job_id)
        .eq("freelancer_id", freelancer_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="You have already applied to this job.")

    data = {
        "job_id": job_id,
        "freelancer_id": freelancer_id,
        "cover_letter": cover_letter,
        "proposed_rate": proposed_rate,
        "status": "pending",
    }

    result = db.table("applications").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to submit application.")

    logger.info("Application created: id=%s job=%s freelancer=%s",
                result.data[0]["id"], job_id, freelancer_id)
    return ApplicationDB(**result.data[0])


def list_applications(job_id: str, client_id: str) -> List[ApplicationDB]:
    """List all applications for a job (only the job's client can view)."""
    job = get_job(job_id)
    if job.client_id != client_id:
        raise HTTPException(status_code=403, detail="Only the job owner can view applications.")

    db = get_db()
    result = (
        db.table("applications").select("*")
        .eq("job_id", job_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [ApplicationDB(**row) for row in result.data]


def accept_application(application_id: str, client_id: str) -> ApplicationDB:
    """Accept a freelancer's application and move the job to in_progress."""
    db = get_db()

    # Fetch the application
    app_result = db.table("applications").select("*").eq("id", application_id).execute()
    if not app_result.data:
        raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")

    application = ApplicationDB(**app_result.data[0])

    # Verify the client owns the job
    job = get_job(application.job_id)
    if job.client_id != client_id:
        raise HTTPException(status_code=403, detail="Only the job owner can accept applications.")

    if application.status.value != "pending":
        raise HTTPException(status_code=400, detail="Application is not in pending state.")

    # Accept this application
    db.table("applications").update({"status": "accepted"}).eq("id", application_id).execute()

    # Reject all other pending applications for this job
    other_apps = (
        db.table("applications").select("id")
        .eq("job_id", application.job_id)
        .eq("status", "pending")
        .execute()
    )
    for other in other_apps.data:
        if other["id"] != application_id:
            db.table("applications").update({"status": "rejected"}).eq("id", other["id"]).execute()

    # Move job to in_progress
    db.table("jobs").update({"status": "in_progress"}).eq("id", application.job_id).execute()

    logger.info("Application %s accepted, job %s → in_progress", application_id, application.job_id)

    # Return updated application
    updated = db.table("applications").select("*").eq("id", application_id).execute()
    return ApplicationDB(**updated.data[0])
