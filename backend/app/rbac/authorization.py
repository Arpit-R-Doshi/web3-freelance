"""
rbac/authorization.py — FastAPI dependency for RBAC enforcement.

Usage:
    @router.post("/contracts/create")
    async def create(
        current_user=Depends(require_permission("create_contract"))
    ): ...

The dependency:
  1. Extracts and validates the JWT from the Authorization header.
  2. Checks the role's permissions against the requested permission.
  3. Optionally verifies a Verifiable Credential if provided via
     X-VC-Token header.
  4. Returns the token data on success or raises HTTP 403 on failure.
"""

import logging
from typing import Callable, Optional

from fastapi import Depends, Header, HTTPException, status
from starlette.requests import Request

from app.auth.jwt_handler import decode_access_token
from app.database.models import TokenData
from app.identity.credential_verifier import verify_credential
from app.rbac.permissions import has_permission

logger = logging.getLogger(__name__)


async def _get_token_data(
    request: Request,
    x_jwt_token: Optional[str] = Header(
        None, 
        alias="X-JWT-Token", 
        description="Swagger UI Box: Paste your JWT here (format: Bearer <token>)"
    ),
) -> TokenData:
    """Decode and validate the Bearer JWT; raise 401 on failure."""
    # Accept token from standard Authorization header OR explicit X-JWT-Token box
    auth_header = request.headers.get("Authorization") or x_jwt_token

    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication credentials (must be 'Bearer <token>')",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    try:
        token_data = decode_access_token(auth_header[7:])
    except Exception as exc:
        logger.warning("JWT validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return token_data


def require_permission(permission: str) -> Callable:
    """Return a FastAPI dependency that enforces a specific permission.

    Args:
        permission: The permission string to require (e.g. 'create_contract').

    Returns:
        A FastAPI dependency function that resolves to ``TokenData`` on success.

    Raises:
        HTTPException 401: JWT is missing, invalid, or expired.
        HTTPException 403: User's role lacks the required permission.
    """

    async def dependency(
        token_data: TokenData = Depends(_get_token_data),
        x_vc_token: Optional[str] = Header(
            default=None,
            alias="X-VC-Token",
            description="Optional signed Verifiable Credential JWT for identity proof.",
        ),
    ) -> TokenData:
        # ── 1. Role → permission check ─────────────────────────────────────────
        if not has_permission(token_data.role.value, permission):
            logger.warning(
                "Access denied: role='%s' missing permission='%s'",
                token_data.role,
                permission,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Your role '{token_data.role.value}' does not have "
                    f"the required permission: '{permission}'."
                ),
            )

        # ── 2. Optional VC verification ────────────────────────────────────────
        if x_vc_token:
            try:
                vc_claims = await verify_credential(x_vc_token)
                logger.info(
                    "VC verified for user %s. Claims: %s",
                    token_data.user_id,
                    vc_claims.get("claims"),
                )
            except Exception as exc:
                logger.warning(
                    "VC verification failed for user %s: %s",
                    token_data.user_id,
                    exc,
                )
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Verifiable Credential verification failed: {exc}",
                )

        logger.info(
            "Access granted: user='%s' role='%s' permission='%s'",
            token_data.user_id,
            token_data.role,
            permission,
        )
        return token_data

    return dependency
