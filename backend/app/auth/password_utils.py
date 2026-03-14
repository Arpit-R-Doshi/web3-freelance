"""
auth/password_utils.py — Password hashing and verification.

Uses passlib with bcrypt backend. All password operations go
through this module to keep hashing logic in one place.
"""

from passlib.context import CryptContext

# bcrypt context — cost factor 12 is a good default for hackathon
# (increase in production as hardware allows)
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of *plain*."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*."""
    return _pwd_context.verify(plain, hashed)
