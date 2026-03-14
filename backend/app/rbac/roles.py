"""
rbac/roles.py — Platform role definitions.

Defines the Role enumeration used throughout the RBAC system.
Each role maps to a set of permissions defined in permissions.py.
"""

from enum import Enum


class Role(str, Enum):
    """Platform roles for the cross-border collaboration system."""

    CLIENT = "CLIENT"
    """Businesses or individuals seeking freelance services."""

    FREELANCER = "FREELANCER"
    """Verified professionals offering services on the platform."""

    ARBITRATOR = "ARBITRATOR"
    """Trusted neutral parties who resolve contract disputes."""

    ADMIN = "ADMIN"
    """Platform administrators with full access."""

    @classmethod
    def values(cls) -> list[str]:
        """Return all role value strings."""
        return [r.value for r in cls]
