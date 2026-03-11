-- ============================================================
-- QAcademy Alpha — D1 Database Schema
-- Database name: Alpha_db
-- Origin: QAcademy_Portal_DB (Google Sheets)
-- Run this entire file in the D1 query console
-- ============================================================


-- ============================================================
-- USERS
-- Origin: QAcademy_Portal_DB → 'users' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  user_id               TEXT PRIMARY KEY,
  username              TEXT UNIQUE,
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT DEFAULT '',
  salt                  TEXT DEFAULT '',
  name                  TEXT DEFAULT '',
  forename              TEXT DEFAULT '',
  surname               TEXT DEFAULT '',
  phone_number          TEXT DEFAULT '',
  program_id            TEXT DEFAULT '',
  cohort                TEXT DEFAULT '',
  level                 TEXT DEFAULT '',
  role                  TEXT NOT NULL DEFAULT 'STUDENT',  -- STUDENT | ADMIN
  active                INTEGER NOT NULL DEFAULT 1,       -- 1 = active, 0 = disabled
  avatar_url            TEXT DEFAULT '',
  must_change_password  INTEGER DEFAULT 0,
  expires_utc           TEXT DEFAULT '',
  last_login_utc        TEXT DEFAULT '',
  signup_source         TEXT DEFAULT '',                  -- SELF | ADMIN | PAYSTACK | TA_SELF
  created_utc           TEXT NOT NULL DEFAULT '',
  updated_utc           TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_program  ON users(program_id);


-- ============================================================
-- PROGRAMS
-- Origin: QAcademy_Portal_DB → 'programs' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS programs (
  program_id   TEXT PRIMARY KEY,   -- RN | RM | RPHN | RMHN | NACNAP
  label        TEXT NOT NULL,
  status       TEXT DEFAULT 'active',
  sort_order   INTEGER DEFAULT 0
);


-- ============================================================
-- COURSES
-- Origin: QAcademy_Portal_DB → 'courses' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  course_id     TEXT PRIMARY KEY,   -- GP | RN_MED | RN_SURG | etc.
  title         TEXT NOT NULL,
  program_scope TEXT DEFAULT '',    -- which program this belongs to
  sheet_id      TEXT DEFAULT '',    -- original Google Sheet ID (reference only)
  status        TEXT DEFAULT 'active',
  sort_order    INTEGER DEFAULT 0
);


-- ============================================================
-- PROGRAM_COURSE_MAP
-- Origin: QAcademy_Portal_DB → 'program_course_map' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS program_course_map (
  program_id   TEXT NOT NULL REFERENCES programs(program_id),
  course_id    TEXT NOT NULL REFERENCES courses(course_id),
  is_core      INTEGER DEFAULT 1,
  sort_order   INTEGER DEFAULT 0,
  PRIMARY KEY (program_id, course_id)
);


-- ============================================================
-- LEVELS
-- Origin: QAcademy_Portal_DB → 'levels' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS levels (
  level_id     TEXT PRIMARY KEY,   -- 100 | 200 | 300 | 400
  label        TEXT NOT NULL,
  sort_order   INTEGER DEFAULT 0
);


-- ============================================================
-- PRODUCTS
-- Origin: QAcademy_Portal_DB → 'products' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  product_id       TEXT PRIMARY KEY,   -- RN_FULL_2026 | WELCOME_TRIAL | etc.
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL,      -- PAID | TRIAL | FREE
  courses_included TEXT DEFAULT '',    -- comma-separated course IDs: RN_MED,RN_SURG,GP
  duration_days    INTEGER DEFAULT 0,
  price            REAL DEFAULT 0,
  currency         TEXT DEFAULT 'GHS',
  summary          TEXT DEFAULT '',
  status           TEXT DEFAULT 'active',
  created_utc      TEXT NOT NULL DEFAULT '',
  updated_utc      TEXT NOT NULL DEFAULT ''
);


-- ============================================================
-- SUBSCRIPTIONS
-- Origin: QAcademy_Portal_DB → 'subscriptions' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id  TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(user_id),
  product_id       TEXT NOT NULL REFERENCES products(product_id),
  kind             TEXT NOT NULL DEFAULT 'PAID',   -- PAID | TRIAL | FREE
  status           TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | EXPIRED | CANCELLED
  start_utc        TEXT NOT NULL DEFAULT '',
  expires_utc      TEXT NOT NULL DEFAULT '',
  source           TEXT DEFAULT '',                -- PAYSTACK | ADMIN | SELF
  source_ref       TEXT DEFAULT '',                -- Paystack reference or note
  expiry_reminded  TEXT DEFAULT '',                -- none | soon | both
  created_utc      TEXT NOT NULL DEFAULT '',
  updated_utc      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user    ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_utc);


-- ============================================================
-- AUTH_EVENTS
-- Origin: QAcademy_Portal_DB → 'auth_events' tab
-- Used for login audit log and rate limiting
-- ============================================================
CREATE TABLE IF NOT EXISTS auth_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,      -- LOGIN_EMAIL | LOGIN_GOOGLE | LOGOUT | RESET_REQUEST | RESET_APPLY
  identifier   TEXT DEFAULT '',    -- email or username attempted
  user_id      TEXT DEFAULT '',
  ip_hash      TEXT DEFAULT '',
  ua_hash      TEXT DEFAULT '',
  ok           INTEGER DEFAULT 0,  -- 1 = success, 0 = failure
  error_code   TEXT DEFAULT '',
  note         TEXT DEFAULT '',
  created_utc  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_auth_events_user    ON auth_events(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_kind    ON auth_events(kind);
CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(created_utc);


-- ============================================================
-- RESET_REQUESTS
-- Origin: QAcademy_Portal_DB → 'reset_requests' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS reset_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  email        TEXT NOT NULL,
  reset_token  TEXT NOT NULL UNIQUE,
  expires_utc  TEXT NOT NULL,
  used         INTEGER DEFAULT 0,
  created_utc  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_reset_token ON reset_requests(reset_token);
CREATE INDEX IF NOT EXISTS idx_reset_user  ON reset_requests(user_id);


-- ============================================================
-- PAYMENTS
-- Origin: QAcademy_Portal_DB → 'payments' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  payment_id       TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(user_id),
  product_id       TEXT NOT NULL,
  paystack_ref     TEXT DEFAULT '',
  amount           REAL DEFAULT 0,
  currency         TEXT DEFAULT 'GHS',
  status           TEXT DEFAULT 'pending',  -- pending | success | failed
  verified_at_utc  TEXT DEFAULT '',
  metadata_json    TEXT DEFAULT '',          -- raw Paystack payload
  created_utc      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_payments_user   ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_ref    ON payments(paystack_ref);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);


-- ============================================================
-- QUIZZES
-- Origin: QAcademy_Portal_DB → 'quizzes' tab
-- Fixed/admin-posted quizzes (not builder attempts)
-- ============================================================
CREATE TABLE IF NOT EXISTS quizzes (
  quiz_id       TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(course_id),
  type          TEXT NOT NULL DEFAULT 'TIMED',  -- TIMED | INSTANT
  title         TEXT NOT NULL DEFAULT '',
  n             INTEGER DEFAULT 0,              -- number of questions
  duration_min  INTEGER DEFAULT 0,
  published     INTEGER DEFAULT 0,
  visibility    TEXT DEFAULT 'public',          -- public | hidden
  publish_at    TEXT DEFAULT '',
  unpublish_at  TEXT DEFAULT '',
  notes         TEXT DEFAULT '',
  created_utc   TEXT NOT NULL DEFAULT '',
  updated_utc   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_quizzes_course     ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_published  ON quizzes(published);


-- ============================================================
-- ATTEMPTS
-- Origin: QAcademy_Portal_DB → 'attempts' tab
-- Covers builder attempts, fixed quiz attempts, retakes
-- ============================================================
CREATE TABLE IF NOT EXISTS attempts (
  attempt_id        TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(user_id),
  course_id         TEXT NOT NULL,
  quiz_id           TEXT DEFAULT '',       -- set for fixed quiz attempts
  mode              TEXT NOT NULL,         -- timed | instant
  source            TEXT DEFAULT '',       -- builder | fixed
  display_label     TEXT DEFAULT '',
  n                 INTEGER DEFAULT 0,
  duration_min      INTEGER DEFAULT 0,
  seed              TEXT DEFAULT '',
  item_ids          TEXT DEFAULT '',       -- comma-separated item IDs
  status            TEXT DEFAULT 'in_progress',  -- in_progress | completed | abandoned
  score_raw         INTEGER DEFAULT 0,
  score_total       INTEGER DEFAULT 0,
  score_pct         REAL DEFAULT 0,
  time_taken_s      INTEGER DEFAULT 0,
  answers_json      TEXT DEFAULT '',       -- JSON: {item_id: selected_option}
  origin_attempt_id TEXT DEFAULT '',       -- set on retakes
  ts_iso            TEXT NOT NULL DEFAULT '',
  updated_utc       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_attempts_user    ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_course  ON attempts(course_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status  ON attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_ts      ON attempts(ts_iso);


-- ============================================================
-- OFFLINE_PACKS
-- Origin: QAcademy_Portal_DB → 'offline_packs' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS offline_packs (
  pack_id        TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(user_id),
  course_id      TEXT NOT NULL,
  pack_name      TEXT DEFAULT '',
  question_count INTEGER DEFAULT 0,
  topics         TEXT DEFAULT '',       -- comma-separated
  difficulties   TEXT DEFAULT '',       -- comma-separated
  question_ids   TEXT DEFAULT '',       -- comma-separated item IDs
  watermark      TEXT DEFAULT '',
  status         TEXT DEFAULT 'active', -- active | deleted
  created_utc    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_offline_packs_user   ON offline_packs(user_id);
CREATE INDEX IF NOT EXISTS idx_offline_packs_course ON offline_packs(course_id);


-- ============================================================
-- THREADS
-- Origin: QAcademy_Portal_DB → 'threads' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS threads (
  thread_id      TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(user_id),
  context_type   TEXT DEFAULT 'general',  -- general | course | question
  context_id     TEXT DEFAULT '',         -- course_id or item_id if scoped
  subject        TEXT DEFAULT '',
  status         TEXT DEFAULT 'open',     -- open | closed
  last_message_at TEXT DEFAULT '',
  created_utc    TEXT NOT NULL DEFAULT '',
  updated_utc    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_threads_user    ON threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_status  ON threads(status);


-- ============================================================
-- MESSAGES
-- Origin: QAcademy_Portal_DB → 'messages' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  message_id   TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL REFERENCES threads(thread_id),
  sender_id    TEXT NOT NULL REFERENCES users(user_id),
  sender_role  TEXT DEFAULT '',        -- STUDENT | ADMIN
  body         TEXT NOT NULL DEFAULT '',
  created_utc  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);


-- ============================================================
-- ANNOUNCEMENTS
-- Origin: QAcademy_Portal_DB → 'announcements' tab
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  announcement_id       TEXT PRIMARY KEY,
  title                 TEXT NOT NULL DEFAULT '',
  body                  TEXT DEFAULT '',
  body_html             TEXT DEFAULT '',
  status                TEXT DEFAULT 'active',   -- active | draft | archived
  priority              INTEGER DEFAULT 0,
  pinned                INTEGER DEFAULT 0,
  dismissible           INTEGER DEFAULT 1,
  start_at              TEXT DEFAULT '',
  end_at                TEXT DEFAULT '',
  -- targeting / scope
  scope_programs        TEXT DEFAULT '',  -- CSV of program_ids, empty = all
  scope_courses         TEXT DEFAULT '',  -- CSV of course_ids, empty = all
  scope_level           TEXT DEFAULT '',
  scope_cohort          TEXT DEFAULT '',
  scope_subscription_kind TEXT DEFAULT '', -- PAID | TRIAL | FREE
  scope_product_ids     TEXT DEFAULT '',
  scope_audience        TEXT DEFAULT '',  -- ALL | PAID | TRIAL | FREE
  created_utc           TEXT NOT NULL DEFAULT '',
  updated_utc           TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);


-- ============================================================
-- USER_NOTICE_STATE
-- Origin: QAcademy_Portal_DB → 'user_notice_state' tab
-- Tracks per-user seen/dismissed state for announcements
-- ============================================================
CREATE TABLE IF NOT EXISTS user_notice_state (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(user_id),
  user_label  TEXT DEFAULT '',
  user_email  TEXT DEFAULT '',
  item_type   TEXT DEFAULT 'ANNOUNCEMENT',
  item_id     TEXT NOT NULL,
  state       TEXT NOT NULL,  -- seen | dismissed
  seen_at     TEXT DEFAULT '',
  updated_utc TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_notice_state_user ON user_notice_state(user_id);
CREATE INDEX IF NOT EXISTS idx_notice_state_item ON user_notice_state(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notice_state_unique ON user_notice_state(user_id, item_type, item_id);


-- ============================================================
-- CONFIG
-- Origin: QAcademy_Portal_DB → 'config' tab
-- Platform-wide key/value settings (e.g. offline pack limits)
-- ============================================================
CREATE TABLE IF NOT EXISTS config (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL DEFAULT '',
  description  TEXT DEFAULT '',
  updated_utc  TEXT NOT NULL DEFAULT ''
);

-- Seed default config values
INSERT OR IGNORE INTO config (key, value, description, updated_utc) VALUES
  ('offline_max_questions',    '50',  'Max questions per offline pack',     ''),
  ('offline_packs_per_course', '3',   'Max offline packs per course per user', '');


-- ============================================================
-- SEED DATA — Programs
-- ============================================================
INSERT OR IGNORE INTO programs (program_id, label, status, sort_order) VALUES
  ('RN',     'Registered Nurse',                         'active', 1),
  ('RM',     'Registered Midwife',                       'active', 2),
  ('RPHN',   'Registered Public Health Nurse',           'active', 3),
  ('RMHN',   'Registered Mental Health Nurse',           'active', 4),
  ('NACNAP', 'Nurse Anaesthetist / Community Nurse',     'active', 5);


-- ============================================================
-- SEED DATA — Courses
-- ============================================================
INSERT OR IGNORE INTO courses (course_id, title, program_scope, status, sort_order) VALUES
  ('GP',               'General Principles',                        'ALL',   'active', 1),
  ('RN_MED',           'Medical Nursing',                           'RN',    'active', 2),
  ('RN_SURG',          'Surgical Nursing',                          'RN',    'active', 3),
  ('RM_MID',           'Midwifery',                                 'RM',    'active', 4),
  ('RM_PED_OBS_HRN',   'Paediatrics, Obstetrics & HRN',            'RM',    'active', 5),
  ('RPHN_PPHN',        'Primary & Public Health Nursing',           'RPHN',  'active', 6),
  ('RPHN_DISEASE_CTRL','Disease Control',                           'RPHN',  'active', 7),
  ('RMHN_PSYCH_NURS',  'Psychiatric Nursing',                       'RMHN',  'active', 8),
  ('RMHN_PSYCH_PPHARM','Psychiatric Pharmacology',                  'RMHN',  'active', 9),
  ('NAC_BASIC_CLIN',   'Basic Clinical Nursing (NACNAP)',           'NACNAP','active', 10),
  ('NAC_BASIC_PREV',   'Basic Preventive Nursing (NACNAP)',         'NACNAP','active', 11);


-- ============================================================
-- SEED DATA — Program Course Map
-- ============================================================
INSERT OR IGNORE INTO program_course_map (program_id, course_id, is_core, sort_order) VALUES
  ('RN',     'GP',               1, 1),
  ('RN',     'RN_MED',           1, 2),
  ('RN',     'RN_SURG',          1, 3),
  ('RM',     'GP',               1, 1),
  ('RM',     'RM_MID',           1, 2),
  ('RM',     'RM_PED_OBS_HRN',   1, 3),
  ('RPHN',   'GP',               1, 1),
  ('RPHN',   'RPHN_PPHN',        1, 2),
  ('RPHN',   'RPHN_DISEASE_CTRL',1, 3),
  ('RMHN',   'GP',               1, 1),
  ('RMHN',   'RMHN_PSYCH_NURS',  1, 2),
  ('RMHN',   'RMHN_PSYCH_PPHARM',1, 3),
  ('NACNAP', 'GP',               1, 1),
  ('NACNAP', 'NAC_BASIC_CLIN',   1, 2),
  ('NACNAP', 'NAC_BASIC_PREV',   1, 3);
