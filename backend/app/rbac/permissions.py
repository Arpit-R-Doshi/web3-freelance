"""
rbac/permissions.py — Permission definitions and role-permission mapping.

The ROLE_PERMISSIONS dict is the single source of truth for authorization.
To add a new permission, add it to the relevant role's set here.
"""

from typing import Dict, Set

from app.rbac.roles import Role


# Permission strings used throughout the system
class Permission:
    # Contract lifecycle
    CREATE_CONTRACT = "create_contract"
    ACCEPT_CONTRACT = "accept_contract"
    SUBMIT_WORK = "submit_work"

    # Payments
    DEPOSIT_FUNDS = "deposit_funds"

    # Dispute resolution
    RESOLVE_DISPUTE = "resolve_dispute"

    # Administration
    MANAGE_USERS = "manage_users"
    APPROVE_KYC = "approve_kyc"

    @classmethod
    def all(cls) -> Set[str]:
        """Return all defined permission strings."""
        return {
            v for k, v in vars(cls).items()
            if not k.startswith("_") and isinstance(v, str)
        }


# ── Role → Permissions mapping ────────────────────────────────────────────────
ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    Role.CLIENT.value: {
        Permission.CREATE_CONTRACT,
        Permission.DEPOSIT_FUNDS,
    },
    Role.FREELANCER.value: {
        Permission.ACCEPT_CONTRACT,
        Permission.SUBMIT_WORK,
    },
    Role.ARBITRATOR.value: {
        Permission.RESOLVE_DISPUTE,
    },
    Role.ADMIN.value: {
        # Admins inherit all permissions
        Permission.CREATE_CONTRACT,
        Permission.ACCEPT_CONTRACT,
        Permission.SUBMIT_WORK,
        Permission.DEPOSIT_FUNDS,
        Permission.RESOLVE_DISPUTE,
        Permission.MANAGE_USERS,
        Permission.APPROVE_KYC,
    },
}


def has_permission(role: str, permission: str) -> bool:
    """Return True if *role* is allowed to perform *permission*.

    Args:
        role:       Role string (e.g. 'CLIENT').
        permission: Permission string (e.g. 'create_contract').

    Returns:
        True if permitted, False otherwise.
    """
    allowed = ROLE_PERMISSIONS.get(role, set())
    return permission in allowed


def get_permissions(role: str) -> Set[str]:
    """Return the full set of permissions for a given role."""
    return ROLE_PERMISSIONS.get(role, set())
