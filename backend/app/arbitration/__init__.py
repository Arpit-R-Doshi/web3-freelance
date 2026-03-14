"""
arbitration — Reputation-based dispute resolution module.

Exposes the router for mounting in the main FastAPI application.
"""

from app.arbitration.arbitration_routes import router  # noqa: F401
