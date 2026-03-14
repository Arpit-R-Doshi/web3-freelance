-- ============================================================================
-- Arbitration System Schema Migration
-- Run this in the Supabase SQL Editor (supabase.com → SQL Editor)
-- ============================================================================

-- 1. Add arbitration columns to the existing users table
-- ============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS skills       TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reputation_score INT DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS cases_judged    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cases_correct   INT DEFAULT 0;

-- 2. Disputes table
-- ============================================================================
CREATE TABLE IF NOT EXISTS disputes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        TEXT        NOT NULL,
  client_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  freelancer_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill         TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'open',       -- open | in_arbitration | resolved
  jury          UUID[]      DEFAULT '{}',
  result        TEXT,                                       -- client_wins | freelancer_wins | partial_refund
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Votes table (one vote per juror per dispute)
-- ============================================================================
CREATE TABLE IF NOT EXISTS votes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id  UUID        NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  juror_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  decision    TEXT        NOT NULL,                         -- client_wins | freelancer_wins | partial_refund
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (dispute_id, juror_id)                            -- prevents double-voting
);

-- 4. Reputation logs table
-- ============================================================================
CREATE TABLE IF NOT EXISTS reputation_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  change      INT         NOT NULL,
  reason      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes for common queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_disputes_client      ON disputes (client_id);
CREATE INDEX IF NOT EXISTS idx_disputes_freelancer  ON disputes (freelancer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status      ON disputes (status);
CREATE INDEX IF NOT EXISTS idx_votes_dispute        ON votes (dispute_id);
CREATE INDEX IF NOT EXISTS idx_reputation_user      ON reputation_logs (user_id);
