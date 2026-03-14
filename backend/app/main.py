"""
main.py — FastAPI application entry point.

Assembles all routers, registers middleware, and configures the app
metadata used in the Swagger/ReDoc documentation.

Run locally:
    uvicorn app.main:app --reload
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.arbitration import router as arbitration_router
from app.auth.auth_routes import router as auth_router
from app.config import get_settings
from app.database.init_db import init_db
from app.identity import router as identity_router
from app.jobs import contract_router, job_router
from app.kyc.kyc_routes import router as kyc_router
from app.middleware.rbac_middleware import RBACLoggingMiddleware

# ── Logging configuration ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan: startup / shutdown ───────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler — runs once at startup and shutdown."""
    settings = get_settings()

    # Initialise SQLite database (creates tables on first run)
    init_db()
    logger.info("Database ready: %s", settings.database_path)

    # Ensure local storage directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)
    logger.info("Upload directory ready: %s", settings.upload_dir)
    logger.info("🚀 Freelance Platform started.")

    yield  # ← application runs here

    logger.info("👋 Freelance Platform shutting down.")


# ── App factory ────────────────────────────────────────────────────────────────
def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Programmable Escrow Platform",
        summary=(
            "Freelance marketplace with milestone-based contracts, "
            "reputation-based arbitration, and decentralized identity."
        ),
        description="""
## Overview
A full-stack programmable escrow platform for freelance work.

## Flow
1. `POST /auth/register` → `POST /auth/login` → get JWT
2. CLIENT: `POST /jobs` → FREELANCER: `POST /jobs/{id}/apply`
3. CLIENT: `POST /applications/{id}/accept` → `POST /contracts` (with milestones)
4. FREELANCER: `POST /milestones/{id}/submit` → CLIENT: `POST /milestones/{id}/approve`
5. Disputes: `POST /disputes` → jurors vote via `POST /arbitration/vote`

## Roles & Permissions
| Role | Key Permissions |
|------|----------------|
| CLIENT | post_job, create_contract, approve_milestone, raise_dispute |
| FREELANCER | apply_job, submit_work |
| ARBITRATOR | resolve_dispute |
| ADMIN | all permissions |
        """,
        version="1.0.0",
        lifespan=lifespan,
        contact={"name": "Hackathon Team"},
        license_info={"name": "MIT"},
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Auth-User-Id", "X-Auth-Role"],
    )

    # ── Audit logging middleware ───────────────────────────────────────────────
    app.add_middleware(RBACLoggingMiddleware)

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(auth_router)
    app.include_router(kyc_router)
    app.include_router(identity_router)
    app.include_router(job_router)
    app.include_router(contract_router)
    app.include_router(arbitration_router)

    return app


app = create_app()


@app.get("/", tags=["Health"], summary="Health check")
async def root() -> dict:
    """Returns service status and a link to the interactive docs."""
    return {
        "service": "Identity & Trust Layer",
        "status": "running",
        "docs": "/docs",
        "version": "1.0.0",
    }
