"""
Notifies the Integration Service when all milestones for a project are complete.
Called by WebhookService after running tests.
"""
import logging
import os
import httpx
from sqlalchemy.orm import Session

from app.models.project import Project
from app.config import config

logger = logging.getLogger(__name__)

INTEGRATION_SERVICE_URL = getattr(config, "INTEGRATION_SERVICE_URL", "http://localhost:8003")


class IntegrationNotifier:
    def notify_if_complete(self, project_id: int, db: Session) -> bool:
        """Check if all milestones are completed; notify Integration Service if so."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project or not project.milestones:
            return False

        all_done = all(m.status == "completed" for m in project.milestones)
        if not all_done:
            logger.info(
                f"Project {project_id}: {sum(1 for m in project.milestones if m.status == 'completed')}"
                f"/{len(project.milestones)} milestones complete"
            )
            return False

        logger.info(f"Project {project_id}: all milestones complete — notifying Integration Service")
        try:
            resp = httpx.post(
                f"{INTEGRATION_SERVICE_URL}/internal/validator-complete",
                json={"validator_project_id": project_id},
                timeout=10.0,
            )
            resp.raise_for_status()
            logger.info(f"Integration Service notified for project {project_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to notify Integration Service: {e}")
            return False
