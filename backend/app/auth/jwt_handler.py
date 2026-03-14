"""
auth/jwt_handler.py — JWT creation and validation.

Tokens are signed with HS256 and carry the minimal claims needed
for RBAC: user_id, role, and kyc_status.  Expiry is configurable
via settings.jwt_expire_minutes (default 24 hours for demo convenience).
"""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import get_settings
from app.database.models import KYCStatus, TokenData, UserRole


def create_access_token(user_id: str, role: UserRole, kyc_status: KYCStatus) -> str:
    """Generate a signed JWT for the given user.

    Args:
        user_id: UUID string of the authenticated user.
        role: The user's platform role (CLIENT, FREELANCER, …).
        kyc_status: Current KYC verification status.

    Returns:
        Encoded JWT string.
    """
    settings = get_settings()

    now = datetime.now(tz=timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_expire_minutes)

    payload = {
        "sub": user_id,          # subject — standard JWT claim
        "role": role.value,
        "kyc_status": kyc_status.value,
        "iat": now,
        "exp": expire,
    }

    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> TokenData:
    """Decode and validate a JWT, returning structured token data.

    Raises:
        jose.JWTError: If the token is invalid or expired.
    """
    settings = get_settings()

    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        options={"verify_exp": True},
    )

    return TokenData(
        user_id=payload["sub"],
        role=UserRole(payload["role"]),
        kyc_status=KYCStatus(payload["kyc_status"]),
    )
