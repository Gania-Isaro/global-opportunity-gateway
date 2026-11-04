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

CREATE TABLE IF NOT EXISTS applications (
  id              SERIAL PRIMARY KEY,
  challenge_id    INT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  participant_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  motivation      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted', 'under_review', 'accepted', 'rejected', 'withdrawn')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at      TIMESTAMPTZ,
  UNIQUE (challenge_id, participant_id) -- BR 3 / FR 6.2
);

CREATE TABLE IF NOT EXISTS invitations (
  id              SERIAL PRIMARY KEY,
  application_id  INT UNIQUE NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'confirmed', 'declined')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS projects (
  id            SERIAL PRIMARY KEY,
  challenge_id  INT UNIQUE NOT NULL REFERENCES challenges(id) ON DELETE CASCADE, -- BR 6 / FR 8.4
  owner_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id  INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'Member',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id           SERIAL PRIMARY KEY,
  project_id   INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  assignee_id  INT REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  due_date     DATE,
  created_by   INT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS research_notes (
  id          SERIAL PRIMARY KEY,
  project_id  INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id   INT REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_files (
  id           SERIAL PRIMARY KEY,
  project_id   INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploader_id  INT REFERENCES users(id) ON DELETE SET NULL,
  filename     TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size         INT NOT NULL,
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discussion_posts (
  id          SERIAL PRIMARY KEY,
  project_id  INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id   INT REFERENCES users(id) ON DELETE SET NULL,
  parent_id   INT REFERENCES discussion_posts(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS milestones (
  id          SERIAL PRIMARY KEY,
  project_id  INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  due_date    DATE,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  message     TEXT NOT NULL,
  link        TEXT,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id           SERIAL PRIMARY KEY,
  reporter_id  INT REFERENCES users(id) ON DELETE SET NULL,
  target_type  TEXT NOT NULL CHECK (target_type IN ('challenge', 'user')),
  target_id    INT NOT NULL,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append only. The app never updates or deletes rows here (NFR 11, BR 10).
CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL PRIMARY KEY,
  admin_id     INT REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  target_id    INT,
  details      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id          SERIAL PRIMARY KEY,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  delivered   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_applications_participant ON applications(participant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
