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

  -- ---------- Admin ----------
  CREATE TABLE IF NOT EXISTS badges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    icon        TEXT NOT NULL,
    color       TEXT NOT NULL,
    sort        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin       TEXT NOT NULL,
    action      TEXT NOT NULL,
    target      TEXT NOT NULL DEFAULT '',
    details     TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocked_usernames (
    name        TEXT PRIMARY KEY COLLATE NOCASE,
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
if (!userCols.includes("banned")) {
  db.exec("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0");
}
// Dashboard look (light/dark, accent) chosen by the user
if (!userCols.includes("prefs")) {
  db.exec("ALTER TABLE users ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}'");
}
// "free" or "premium" (everything is free unless PREMIUM_ENABLED=true, see features.js)
if (!userCols.includes("plan")) {
  db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
}

// ---------- Analytics ----------
// Where a view came from (site name only, e.g. "tiktok.com")
const viewCols = db.prepare("PRAGMA table_info(view_log)").all().map(c => c.name);
if (!viewCols.includes("ref")) {
  db.exec("ALTER TABLE view_log ADD COLUMN ref TEXT NOT NULL DEFAULT ''");
}
// One row per visitor, per day, per link clicked (so spam-clicking counts once)
db.exec(`
  CREATE TABLE IF NOT EXISTS click_log (
    user_id      INTEGER NOT NULL,
    visitor_hash TEXT NOT NULL,
    day          TEXT NOT NULL,
    target       TEXT NOT NULL,
    PRIMARY KEY (user_id, visitor_hash, day, target)
  );
  CREATE INDEX IF NOT EXISTS idx_click_user_day ON click_log(user_id, day);
  CREATE INDEX IF NOT EXISTS idx_view_user_day ON view_log(user_id, day);
`);

// ---------- Badge catalog (editable from the admin page) ----------
if (db.prepare("SELECT COUNT(*) n FROM badges").get().n === 0) {
  const seed = [
    ["Owner", "crown", "#facc15"], ["Staff", "shield", "#38bdf8"], ["Verified", "verified", "#a855f7"],
    ["Developer", "code", "#22c55e"], ["Early Supporter", "star", "#f59e0b"], ["Booster", "bolt", "#ec4899"],
    ["Popular", "fire", "#f97316"], ["Friend", "heart", "#f43f5e"]
  ];
  const ins = db.prepare("INSERT INTO badges (name, icon, color, sort) VALUES (?, ?, ?, ?)");
  seed.forEach(([n, i, c], k) => ins.run(n, i, c, k));

  // Users used to store badges as [{icon, label}]; switch them to badge ids
  const byIcon = Object.fromEntries(db.prepare("SELECT id, icon FROM badges").all().map(b => [b.icon, b.id]));
  for (const u of db.prepare("SELECT id, badges FROM users").all()) {
    let list = [];
    try { list = JSON.parse(u.badges || "[]"); } catch {}
    const ids = [...new Set(list.map(b => (typeof b === "number" ? b : byIcon[b && b.icon])).filter(Boolean))];
    db.prepare("UPDATE users SET badges = ? WHERE id = ?").run(JSON.stringify(ids), u.id);
  }
}

// Clear expired sessions on start
db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").run(Date.now());

module.exports = { db, DATA_DIR };
