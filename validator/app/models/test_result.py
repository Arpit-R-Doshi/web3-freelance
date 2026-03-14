from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, index=True)
    milestone_id = Column(Integer, ForeignKey("milestones.id"))
    status = Column(String) # pass, fail
    logs = Column(Text)
    executed_at = Column(DateTime, default=datetime.utcnow)

    milestone = relationship("Milestone", back_populates="test_results")
