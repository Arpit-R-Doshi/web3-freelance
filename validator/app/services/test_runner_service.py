import os
from sqlalchemy.orm import Session
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.test_result import TestResult
from app.utils.docker_runner import run_tests_in_docker
from app.config import config
import logging

logger = logging.getLogger(__name__)

class TestRunnerService:
    def __init__(self, db: Session):
        self.db = db

    def run_tests_for_project(self, project: Project):
        """Runs generated tests for a specific project based on its cloned code."""
        local_repo_path = os.path.join(config.BASE_REPO_PATH, project.repo_name)
        
        if not os.path.exists(local_repo_path):
            logger.error(f"Repository path {local_repo_path} not found. Cannot run tests.")
            return

        for milestone in project.milestones:
            if not milestone.test_cases:
                continue
                
            test_script_path = milestone.test_cases[0].test_script_path
            tests_dir = os.path.dirname(test_script_path)
            
            # Run docker
            success, output = run_tests_in_docker(
                repo_path=local_repo_path,
                tests_path=tests_dir
            )
            
            # Update milestone status
            new_status = "completed" if success else "failed"
            milestone.status = new_status
            
            # Store test results
            test_result = TestResult(
                milestone_id=milestone.id,
                status=new_status,
                logs=output
            )
            self.db.add(test_result)
            
        self.db.commit()
