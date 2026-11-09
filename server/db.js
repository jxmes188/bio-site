/* SQLite database (built into Node 22.13+, no install needed) */
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "bio.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash   TEXT NOT NULL,
    profile     TEXT NOT NULL DEFAULT '{}',
    badges      TEXT NOT NULL DEFAULT '[]',
    views       INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id            TEXT PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL,
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size          INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS view_log (
    user_id      INTEGER NOT NULL,
    visitor_hash TEXT NOT NULL,
    day          TEXT NOT NULL,
    PRIMARY KEY (user_id, visitor_hash, day)
  );

  -- Sign-ups waiting for the 6-digit email code (no account exists yet)
  CREATE TABLE IF NOT EXISTS pending_signups (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL COLLATE NOCASE,
    email       TEXT NOT NULL COLLATE NOCASE,
    pass_hash   TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    sent_at     INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    ip_hash     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  DROP TABLE IF EXISTS email_tokens;

  -- "Forgot password" requests waiting for their 6-digit code
  CREATE TABLE IF NOT EXISTS password_resets (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    sent_at     INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signup_log (
    ip_hash     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_signup_ip ON signup_log(ip_hash, created_at);
`);

// ---------- Migrations for databases created before email confirmation ----------
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes("email_verified")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  // Accounts that existed before this feature are trusted
  db.exec("UPDATE users SET email_verified = 1");
}
if (!userCols.includes("verify_sent_at")) {
  db.exec("ALTER TABLE users ADD COLUMN verify_sent_at INTEGER NOT NULL DEFAULT 0");
}

// Clear expired sessions on start
db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());

module.exports = { db, DATA_DIR };
