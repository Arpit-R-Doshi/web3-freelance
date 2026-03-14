"""
jobs — Freelance platform module.

Exposes the job and contract routers for mounting in the main app.
"""

from app.jobs.job_routes import router as job_router
from app.jobs.contract_routes import router as contract_router

__all__ = ["job_router", "contract_router"]
