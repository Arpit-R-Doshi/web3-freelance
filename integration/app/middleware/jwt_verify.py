"""
Decodes Auth Service JWTs using the shared JWT_SECRET.
No network call needed — same HS256 secret is shared.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

bearer_scheme = HTTPBearer()


class TokenData:
    def __init__(self, user_id: str, role: str, kyc_status: str, raw_token: str):
        self.user_id = user_id
        self.role = role
        self.kyc_status = kyc_status
        self.raw_token = raw_token  # Original token to forward to Auth Service


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> TokenData:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": True},
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenData(
        user_id=payload["sub"],
        role=payload.get("role", ""),
        kyc_status=payload.get("kyc_status", ""),
        raw_token=token,
    )


def require_role(*roles: str):
    """Dependency that enforces one of the given roles."""
    def _check(current_user: TokenData = Depends(get_current_user)) -> TokenData:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not allowed here. Required: {roles}",
            )
        return current_user
    return _check
