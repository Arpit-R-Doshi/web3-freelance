"""
auth/password_utils.py — Password hashing and verification.

Uses the bcrypt library directly because passlib 1.7.4 has a known
compatibility bug with bcrypt >= 4.0.0.
"""

import bcrypt

# bcrypt cost factor 12 is a good default for hackathon
_ROUNDS = 12


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of *plain*."""
    # bcrypt requires bytes
    pwd_bytes = plain.encode("utf-8")
    salt = bcrypt.gensalt(rounds=_ROUNDS)
    hashed_bytes = bcrypt.hashpw(pwd_bytes, salt)
    return hashed_bytes.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # Catch invalid hash formats
        return False

