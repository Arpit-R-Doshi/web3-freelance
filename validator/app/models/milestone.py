from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    title = Column(String, index=True)
    description = Column(String)
    status = Column(String, default="pending") # pending, completed, failed

    project = relationship("Project", back_populates="milestones")
    test_cases = relationship("TestCase", back_populates="milestone")
    test_results = relationship("TestResult", back_populates="milestone")
