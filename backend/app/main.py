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
from app.contracts.contract_routes import router as contract_router
from app.identity import router as identity_router
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

    # Ensure local storage directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)
    logger.info("Upload directory ready: %s", settings.upload_dir)
    logger.info("Platform DID: %s", settings.platform_did)
    logger.info("🚀 Identity & Trust Layer started.")

    yield  # ← application runs here

    logger.info("👋 Identity & Trust Layer shutting down.")


# ── App factory ────────────────────────────────────────────────────────────────
def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Identity & Trust Layer",
        summary=(
            "Hackathon-ready cross-border collaboration platform — "
            "decentralized identity (DID + VC) + RBAC authorization."
        ),
        description="""
## Overview
A trust infrastructure where users prove identity using **Verifiable Credentials**
and gain platform access based on **verified roles**.

## Demo Flow
1. `POST /auth/register` — Register + auto-generate `did:key`
2. `POST /auth/login` — Obtain JWT
3. `POST /kyc/submit` — Upload documents → VC issued automatically
4. Use JWT in `Authorization: Bearer <token>` header
5. `POST /contracts/create` _(CLIENT only)_, `/contracts/accept` _(FREELANCER only)_
6. Pass `X-VC-Token: <vc_jwt>` for identity proof on any endpoint

## Roles & Permissions
| Role | Permissions |
|------|------------|
| CLIENT | create_contract, deposit_funds |
| FREELANCER | accept_contract, submit_work |
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
