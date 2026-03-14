import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime

from app.database import Base


class ProjectMapping(Base):
    __tablename__ = "project_mappings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    auth_user_id = Column(String, nullable=False, index=True)
    validator_project_id = Column(Integer, nullable=True)
    blockchain_project_id = Column(Integer, nullable=True)
    client_wallet = Column(String, nullable=False)
    worker_wallet = Column(String, nullable=False)
    freelancer_github = Column(String, nullable=False)
    project_name = Column(String, nullable=False)
    total_amount_usdt = Column(Float, nullable=False)
    skill_category = Column(String, nullable=True)
    # active | client_review | disputed | completed | refunded
    status = Column(String, default="active", nullable=False)
    revision_count = Column(Integer, default=0)
    revision_paid_usdt = Column(Float, default=0.0)
    dispute_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class IntegrationUser(Base):
    __tablename__ = "integration_users"

    auth_user_id = Column(String, primary_key=True)
    wallet_address = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
