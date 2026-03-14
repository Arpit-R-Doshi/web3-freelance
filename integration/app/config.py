import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Service URLs
    AUTH_SERVICE_URL: str = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
    VALIDATOR_SERVICE_URL: str = os.getenv("VALIDATOR_SERVICE_URL", "http://localhost:8002")

    # JWT (must match Auth Service)
    JWT_SECRET: str = os.getenv("JWT_SECRET", "replace-with-a-strong-random-secret")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./data/integration.db")

    # Blockchain
    BLOCKCHAIN_RPC_URL: str = os.getenv("BLOCKCHAIN_RPC_URL", "http://127.0.0.1:8545")
    ESCROW_CONTRACT_ADDRESS: str = os.getenv("ESCROW_CONTRACT_ADDRESS", "")
    ADMIN_PRIVATE_KEY: str = os.getenv("ADMIN_PRIVATE_KEY", "")

    # CORS
    CORS_ORIGINS: list = ["*"]


settings = Settings()
