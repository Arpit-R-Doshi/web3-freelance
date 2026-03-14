import os
import uuid
from sqlalchemy.orm import Session
from app.models.milestone import Milestone
from app.models.test_case import TestCase
from app.services.llm_service import LLMService
from app.config import config

class MilestoneService:
    def __init__(self, db: Session):
        self.db = db
        self.llm_service = LLMService()

    def process_requirements(self, project_id: int, description: str) -> list[Milestone]:
        """Calls LLM requirement analyzer, saves milestones and generates test scripts."""
        
        milestones_data = self.llm_service.generate_milestones(description)
        created_milestones = []
        
        os.makedirs(config.TEST_OUTPUT_PATH, exist_ok=True)
        
        for data in milestones_data:
            title = data.get("title", "Untitled Milestone")
            desc = data.get("description", "")
            
            # Save Milestone to DB
            milestone = Milestone(
                project_id=project_id,
                title=title,
                description=desc,
                status="pending"
            )
            self.db.add(milestone)
            self.db.commit()
            self.db.refresh(milestone)
            created_milestones.append(milestone)
            
            # Generate Test Script
            test_script_code = self.llm_service.generate_test_scripts(title, desc)
            
            # Save Test Script locally
            safe_title = "".join(x for x in title if x.isalnum() or x in " _-").replace(" ", "_").lower()
            file_name = f"test_{milestone.id}_{safe_title}_{uuid.uuid4().hex[:6]}.py"
            file_path = os.path.join(config.TEST_OUTPUT_PATH, file_name)
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(test_script_code)
                
            # Store Test Case in DB
            test_case = TestCase(
                milestone_id=milestone.id,
                test_script_path=file_path
            )
            self.db.add(test_case)
            self.db.commit()

        return created_milestones
