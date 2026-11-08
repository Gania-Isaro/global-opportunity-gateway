-- GOG database schema (PostgreSQL)
-- Safe to run many times: every statement uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('participant', 'owner', 'admin')),
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  banned          BOOLEAN NOT NULL DEFAULT FALSE,
  failed_logins   INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id      INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL DEFAULT '',
  bio          TEXT NOT NULL DEFAULT '',
  skills       TEXT[] NOT NULL DEFAULT '{}',
  education    TEXT NOT NULL DEFAULT '',
  location     TEXT NOT NULL DEFAULT '',
  interests    TEXT NOT NULL DEFAULT '',
  experiences  TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email confirmation and password reset links (FR 1.2, FR 1.4)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('confirm', 'reset')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS organisations (
  id                SERIAL PRIMARY KEY,
  rep_user_id       INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  sector            TEXT NOT NULL,
  description       TEXT NOT NULL,
  contact_person    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS organisation_documents (
  id          SERIAL PRIMARY KEY,
  org_id      INT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INT NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS challenges (
  id            SERIAL PRIMARY KEY,
  owner_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id        INT REFERENCES organisations(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  sector        TEXT NOT NULL,
  skills        TEXT[] NOT NULL DEFAULT '{}',
  outcome       TEXT NOT NULL,
  deadline      DATE NOT NULL,
  team_size     INT NOT NULL CHECK (team_size BETWEEN 1 AND 50),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'removed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ
);

