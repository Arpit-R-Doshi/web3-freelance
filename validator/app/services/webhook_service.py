from sqlalchemy.orm import Session
from app.models.project import Project
from app.services.repo_service import RepoService
from app.services.test_runner_service import TestRunnerService
import logging

logger = logging.getLogger(__name__)

class WebhookService:
    def __init__(self, db: Session):
        self.db = db
        self.repo_service = RepoService()
        self.test_runner = TestRunnerService(db)

    def process_github_push(self, payload: dict):
        """Handles GitHub push event: Pulls code and runs tests."""
        repository_data = payload.get("repository", {})
        repo_name = repository_data.get("name")
        
        if not repo_name:
            logger.error("No repository name found in webhook payload")
            return
            
        project = self.db.query(Project).filter(Project.repo_name == repo_name).first()
        if not project:
            logger.warning(f"Project for repo {repo_name} not found in DB")
            return
            
        logger.info(f"Processing webhook for repo {repo_name} - pulling latest changes")
        self.repo_service.setup_local_repo(
            repo_url=project.github_url,
            repo_name=project.repo_name
        )
        
        logger.info(f"Running tests for project {project.name}")
        self.test_runner.run_tests_for_project(project)

        # Notify Integration Service if all milestones are now complete
        from app.services.integration_notifier import IntegrationNotifier
        IntegrationNotifier().notify_if_complete(project.id, self.db)
