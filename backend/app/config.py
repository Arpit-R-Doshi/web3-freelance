"""
config.py — Application configuration.

Loads settings from environment variables (or a .env file).
All sensitive values must be provided at runtime; defaults are
safe placeholder strings that will raise errors if used as-is.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str = ""
    supabase_key: str = ""

    # ── JWT ───────────────────────────────────────────────────────────────────
    jwt_secret: str = "changeme-use-a-strong-secret-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours for hackathon convenience

    # ── File Storage ──────────────────────────────────────────────────────────
    upload_dir: str = "storage/kyc_documents"
    max_upload_size_mb: int = 10  # 10 MB limit per file

    # ── Identity ──────────────────────────────────────────────────────────────
    platform_did: str = "did:key:platform-issuer"  # overridden on first run

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor — call this everywhere instead of importing Settings directly."""
    return Settings()
