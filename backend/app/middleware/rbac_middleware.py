"""
middleware/rbac_middleware.py — Shared auth dependencies and logging middleware.

Provides:
  - `get_current_user()`: FastAPI dependency that returns decoded TokenData.
    Used by routes that only need auth but no specific permission check.
  - `RBACLoggingMiddleware`: optional Starlette middleware for audit logging.
"""

import logging
import time
from typing import Optional

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.auth.jwt_handler import decode_access_token
from app.database.models import TokenData

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(_bearer_scheme),
) -> TokenData:
    """FastAPI dependency: decode Bearer JWT and return TokenData.

    Raises:
        HTTPException 401: If the token is missing, malformed, or expired.
    """
    try:
        return decode_access_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


class RBACLoggingMiddleware(BaseHTTPMiddleware):
    """Starlette middleware that logs auth decisions for every request.

    Adds ``X-Auth-User-Id`` and ``X-Auth-Role`` response headers
    for debugging during hackathon demos.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()

        # Try to extract user info from Authorization header (best-effort)
        user_id: Optional[str] = None
        role: Optional[str] = None

        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                token_data = decode_access_token(auth_header[7:])
                user_id = token_data.user_id
                role = token_data.role.value
            except Exception:
                pass  # Unauthenticated request — that's fine

        response = await call_next(request)

        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "[%s] %s %s | user=%s role=%s | status=%d | %.1fms",
            request.method,
            request.url.path,
            request.url.query or "",
            user_id or "anon",
            role or "-",
            response.status_code,
            elapsed_ms,
        )

        # Inject debug headers (remove in production)
        if user_id:
            response.headers["X-Auth-User-Id"] = user_id
        if role:
            response.headers["X-Auth-Role"] = role

        return response
