"""
database/init_db.py — SQLite schema initialisation.

Creates all tables on first run. Safe to call repeatedly
(uses IF NOT EXISTS for every statement).

Called from the FastAPI lifespan handler in main.py.
"""

import logging

from app.database.db import get_db

logger = logging.getLogger(__name__)

_SCHEMA_SQL = """
-- ══════════════════════════════════════════════════════════════════════════════
-- USERS
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    did             TEXT,
    jwk             TEXT,
    role            TEXT DEFAULT 'CLIENT',
    kyc_status      TEXT DEFAULT 'unverified',
    skills          TEXT DEFAULT '[]',
    reputation_score INTEGER DEFAULT 1000,
    cases_judged    INTEGER DEFAULT 0,
    cases_correct   INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ══════════════════════════════════════════════════════════════════════════════
-- KYC
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS kyc_submissions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type   TEXT,
    document_number TEXT,
    document_path   TEXT,
    selfie_path     TEXT,
    status          TEXT DEFAULT 'pending',
    submitted_at    TEXT DEFAULT (datetime('now'))
);

-- ══════════════════════════════════════════════════════════════════════════════
-- CREDENTIALS (Verifiable Credentials)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS credentials (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vc_jwt          TEXT NOT NULL,
    issued_at       TEXT DEFAULT (datetime('now'))
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ARBITRATION — Disputes
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS disputes (
    id              TEXT PRIMARY KEY,
    job_id          TEXT NOT NULL,
    client_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    freelancer_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',
    jury            TEXT DEFAULT '[]',
    result          TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ARBITRATION — Votes
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS votes (
    id              TEXT PRIMARY KEY,
    dispute_id      TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    juror_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    decision        TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(dispute_id, juror_id)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ARBITRATION — Reputation logs
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reputation_logs (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    change          INTEGER NOT NULL,
    reason          TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ══════════════════════════════════════════════════════════════════════════════
-- FREELANCE — Jobs
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    skill_category  TEXT,
    budget          REAL,
    status          TEXT DEFAULT 'open',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ══════════════════════════════════════════════════════════════════════════════
-- FREELANCE — Applications
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS applications (
    id              TEXT PRIMARY KEY,
    job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    freelancer_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cover_letter    TEXT,
    proposed_rate   REAL,
    status          TEXT DEFAULT 'pending',
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(job_id, freelancer_id)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- FREELANCE — Contracts
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS contracts (
    id              TEXT PRIMARY KEY,
    job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    client_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    freelancer_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_amount    REAL,
    status          TEXT DEFAULT 'active',
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ══════════════════════════════════════════════════════════════════════════════
-- FREELANCE — Milestones
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS milestones (
    id              TEXT PRIMARY KEY,
    contract_id     TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    amount          REAL,
    status          TEXT DEFAULT 'pending',
    work_url        TEXT,
    submission_notes TEXT,
    due_date        TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_jobs_client       ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status       ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_apps_job          ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_apps_freelancer   ON applications(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_job     ON contracts(job_id);
CREATE INDEX IF NOT EXISTS idx_milestones_contract ON milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_disputes_client   ON disputes(client_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status   ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_votes_dispute     ON votes(dispute_id);
CREATE INDEX IF NOT EXISTS idx_reputation_user   ON reputation_logs(user_id);
"""


def init_db() -> None:
    """Create all tables if they don't exist.

    Safe to call on every startup — uses IF NOT EXISTS throughout.
    """
    db = get_db()
    db.connection.executescript(_SCHEMA_SQL)
    logger.info("✅ SQLite schema initialised (all tables ready).")
