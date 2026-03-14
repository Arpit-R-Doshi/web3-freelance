"""
Orchestration logic — ties Auth, Validator, and Blockchain together.
"""
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.project_map import IntegrationUser, ProjectMapping
from app.models.schemas import MilestoneOut
from app.services.validator_client import ValidatorClient
from app.services.auth_client import AuthClient
from app.services.blockchain_service import BlockchainService

validator_client = ValidatorClient()
auth_client = AuthClient()
blockchain_service = BlockchainService()


def upsert_user_wallet(db: Session, auth_user_id: str, wallet_address: str):
    user = db.query(IntegrationUser).filter_by(auth_user_id=auth_user_id).first()
    if user:
        user.wallet_address = wallet_address
    else:
        user = IntegrationUser(auth_user_id=auth_user_id, wallet_address=wallet_address)
        db.add(user)
    db.commit()


def create_project(
    db: Session,
    auth_user_id: str,
    name: str,
    description: str,
    freelancer_github: str,
    freelancer_wallet: str,
    client_wallet: str,
    payment_amount_usdt: float,
    skill_category: str,
    blockchain_project_id: int,
) -> dict:
    # 1. Call Validator Service to create repo + milestones
    validator_resp = validator_client.create_project(name, description, freelancer_github)
    validator_project_id = validator_resp.get("project_id")
    repo_url = validator_resp.get("repo_url", "")
    raw_milestones = validator_resp.get("milestones", [])

    # 2. Store wallet mapping
    upsert_user_wallet(db, auth_user_id, client_wallet)

    # 3. Store cross-service mapping
    mapping = ProjectMapping(
        auth_user_id=auth_user_id,
        validator_project_id=validator_project_id,
        blockchain_project_id=blockchain_project_id,
        client_wallet=client_wallet,
        worker_wallet=freelancer_wallet,
        freelancer_github=freelancer_github,
        project_name=name,
        total_amount_usdt=payment_amount_usdt,
        skill_category=skill_category,
        status="active",
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)

    milestones = [
        MilestoneOut(
            id=m.get("id", i),
            title=m.get("title", ""),
            description=m.get("description", ""),
            status=m.get("status", "pending"),
        )
        for i, m in enumerate(raw_milestones)
    ]

    return {
        "integration_project_id": mapping.id,
        "validator_project_id": validator_project_id,
        "github_repo_url": repo_url,
        "milestones": milestones,
    }


def get_projects_for_user(db: Session, auth_user_id: str, role: str) -> List[dict]:
    if role == "CLIENT":
        mappings = db.query(ProjectMapping).filter_by(auth_user_id=auth_user_id).all()
    else:
        # For FREELANCER: look up projects by worker wallet using integration_users
        iu = db.query(IntegrationUser).filter_by(auth_user_id=auth_user_id).first()
        if not iu or not iu.wallet_address:
            return []
        mappings = db.query(ProjectMapping).filter_by(
            worker_wallet=iu.wallet_address.lower()
        ).all()

    result = []
    for m in mappings:
        milestones = _fetch_milestones(m.validator_project_id)
        result.append(_mapping_to_dict(m, milestones))
    return result


def get_project_detail(db: Session, project_id: str) -> Optional[dict]:
    m = db.query(ProjectMapping).filter_by(id=project_id).first()
    if not m:
        return None
    milestones = _fetch_milestones(m.validator_project_id)
    return _mapping_to_dict(m, milestones)


def handle_validator_complete(db: Session, validator_project_id: int) -> bool:
    """Called when Validator Service reports all milestones complete."""
    m = db.query(ProjectMapping).filter_by(
        validator_project_id=validator_project_id
    ).first()
    if not m or m.status != "active":
        return False

    # Fire on-chain setClientReview
    tx = blockchain_service.set_client_review(m.blockchain_project_id)
    m.status = "client_review"
    db.commit()
    return True


def handle_accept(db: Session, project_id: str) -> Optional[str]:
    """Client accepts — returns note that frontend must call acceptProject() directly."""
    m = db.query(ProjectMapping).filter_by(id=project_id).first()
    if not m or m.status != "client_review":
        return None
    # acceptProject() is called directly from client's wallet in frontend (not admin).
    # We only update our DB status; the frontend handles the on-chain call.
    m.status = "completed"
    db.commit()
    return "ok"


def handle_revise(db: Session, project_id: str) -> Optional[str]:
    """Client requests revision — frontend calls requestRevision() on-chain directly."""
    m = db.query(ProjectMapping).filter_by(id=project_id).first()
    if not m or m.status != "client_review":
        return None
    if m.revision_count >= 3:
        return "max_revisions"
    # Partial amount: 10% of total
    partial = m.total_amount_usdt * 0.10
    m.revision_count += 1
    m.revision_paid_usdt += partial
    m.status = "active"
    db.commit()
    return "ok"


def handle_dispute(
    db: Session, project_id: str, auth_user_id: str, skill: str, user_token: str
) -> Optional[dict]:
    m = db.query(ProjectMapping).filter_by(id=project_id).first()
    if not m or m.status not in ("client_review", "active"):
        return None

    # Create dispute in Auth Service
    try:
        dispute_resp = auth_client.create_dispute(
            job_id=m.id,
            client_id=auth_user_id,
            freelancer_id="",  # Auth service will look up by job
            skill=skill or m.skill_category or "general",
            user_token=user_token,
        )
        dispute_id = dispute_resp.get("id", "")
    except Exception as e:
        dispute_id = f"local-{project_id[:8]}"

    # Freeze funds on-chain
    blockchain_service.raise_dispute(m.blockchain_project_id, dispute_id)

    m.status = "disputed"
    m.dispute_id = dispute_id
    db.commit()
    return {"dispute_id": dispute_id}


def handle_dispute_resolved(
    db: Session, dispute_id: str, result: str
) -> bool:
    """Called after arbitrators vote and Auth Service resolves. result: 'freelancer_wins' | 'client_wins'"""
    m = db.query(ProjectMapping).filter_by(dispute_id=dispute_id).first()
    if not m:
        return False

    if result == "freelancer_wins":
        blockchain_service.resolve_dispute_for_worker(m.blockchain_project_id)
        m.status = "completed"
    else:
        blockchain_service.resolve_dispute_for_client(m.blockchain_project_id)
        m.status = "refunded"

    db.commit()
    return True


def _fetch_milestones(validator_project_id: Optional[int]) -> List[MilestoneOut]:
    if not validator_project_id:
        return []
    try:
        data = validator_client.get_project_status(validator_project_id)
        if not data:
            return []
        raw = data.get("milestones", [])
        return [
            MilestoneOut(
                id=m.get("id", i),
                title=m.get("title", ""),
                description=m.get("description", ""),
                status=m.get("status", "pending"),
            )
            for i, m in enumerate(raw)
        ]
    except Exception:
        return []


def _mapping_to_dict(m: ProjectMapping, milestones: List[MilestoneOut]) -> dict:
    return {
        "id": m.id,
        "project_name": m.project_name,
        "status": m.status,
        "client_wallet": m.client_wallet,
        "worker_wallet": m.worker_wallet,
        "freelancer_github": m.freelancer_github,
        "total_amount_usdt": m.total_amount_usdt,
        "revision_count": m.revision_count,
        "revision_paid_usdt": m.revision_paid_usdt,
        "blockchain_project_id": m.blockchain_project_id,
        "validator_project_id": m.validator_project_id,
        "dispute_id": m.dispute_id,
        "skill_category": m.skill_category,
        "created_at": m.created_at,
        "milestones": milestones,
    }
