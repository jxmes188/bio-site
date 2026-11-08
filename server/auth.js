/* Passwords, sessions and rate limiting (Node built-in crypto only) */
const crypto = require("crypto");
const { db } = require("./db");

const SESSION_DAYS = 30;
const COOKIE = "sid";

// ---------- Passwords (scrypt) ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const real = Buffer.from(hash, "hex");
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

// ---------- Sessions ----------
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");

function createSession(res, userId, secure) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: SESSION_DAYS * 864e5,
    path: "/"
  });
}

function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  res.clearCookie(COOKIE, { path: "/" });
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Attaches req.user (or null) on every request */
function loadUser(req, _res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    const row = db.prepare(`
      SELECT u.id, u.username, u.email FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), Date.now());
    if (row) req.user = row;
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not signed in" });
  next();
}

// ---------- Rate limiting (per IP, in memory) ----------
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.reset < now) { h = { count: 0, reset: now + windowMs }; hits.set(req.ip, h); }
    if (++h.count > max) return res.status(429).json({ error: "Too many attempts, try again in a few minutes" });
    next();
  };
}

module.exports = { hashPassword, verifyPassword, createSession, destroySession, loadUser, requireUser, rateLimit, sha256 };
