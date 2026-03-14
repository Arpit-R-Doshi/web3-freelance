"""
database/db.py — Supabase client factory.

Provides a singleton Supabase client so that all modules share
a single connection without re-initialising on every request.
"""

from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_db() -> Client:
    """Return the cached Supabase client.

    This is intentionally a module-level singleton so that tests can
    override it by calling ``get_db.cache_clear()`` and swapping the
    environment variables before the first real call.
    """
    settings = get_settings()

    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_KEY must be set in your .env file."
        )

    return create_client(settings.supabase_url, settings.supabase_key)
