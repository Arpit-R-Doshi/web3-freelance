import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
    GITHUB_OWNER = os.getenv("GITHUB_OWNER", "")
    BASE_REPO_PATH = os.getenv("BASE_REPO_PATH", "./repos")
    TEST_OUTPUT_PATH = os.getenv("TEST_OUTPUT_PATH", "./tests_generated")
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")
    INTEGRATION_SERVICE_URL = os.getenv("INTEGRATION_SERVICE_URL", "http://localhost:8003")

config = Config()
