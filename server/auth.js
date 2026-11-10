/* Passwords, sessions and rate limiting (Node built-in crypto only) */
const crypto = require("crypto");
const { db } = require("./db");

const SESSION_DAYS = 30;
const COOKIE = "sid";

// ---------- Passwords ----------
// New hashes use argon2id (built into Node 24.7+). Older accounts were hashed with scrypt
// ("salt:hash"); those still verify and are upgraded to argon2id the next time they sign in.
const HAS_ARGON2 = typeof crypto.argon2Sync === "function";
const ARGON = { parallelism: 1, tagLength: 32, memory: 19456, passes: 2 }; // OWASP minimum for argon2id

function hashPassword(password) {
  if (HAS_ARGON2) {
    const nonce = crypto.randomBytes(16);
    const tag = crypto.argon2Sync("argon2id", { message: String(password), nonce, ...ARGON });
    return `argon2id$m=${ARGON.memory},t=${ARGON.passes},p=${ARGON.parallelism}$${nonce.toString("hex")}$${tag.toString("hex")}`;
  }
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const s = String(stored || "");
  if (!s) return false; // accounts made with Google / Discord may have no password
  if (s.startsWith("argon2id$")) {
    if (!HAS_ARGON2) return false;
    const [, params, nonceHex, tagHex] = s.split("$");
    const p = Object.fromEntries(String(params).split(",").map(kv => kv.split("=")));
    const real = Buffer.from(tagHex || "", "hex");
    if (!real.length) return false;
    const test = crypto.argon2Sync("argon2id", {
      message: String(password), nonce: Buffer.from(nonceHex, "hex"),
      parallelism: Number(p.p), tagLength: real.length, memory: Number(p.m), passes: Number(p.t)
    });
    return crypto.timingSafeEqual(real, test);
  }
  const [salt, hash] = s.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const real = Buffer.from(hash, "hex");
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

/** True when a stored hash should be replaced with a fresh argon2id one */
const needsRehash = stored => HAS_ARGON2 && !!stored && !String(stored).startsWith("argon2id$");

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
    if (i > -1 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
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
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.email_verified = 1 AND u.banned = 0`).get(sha256(token), Date.now());
    if (row) req.user = row;
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not signed in" });
  next();
}

// ---------- Rate limiting (in memory) ----------
// key: how to group requests (default: by IP). Return "" to skip limiting that request.
function rateLimit({ windowMs, max, key, message }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = key ? key(req) : req.ip;
    if (!k) return next();
    const now = Date.now();
    let h = hits.get(k);
    if (!h || h.reset < now) { h = { count: 0, reset: now + windowMs }; hits.set(k, h); }
    if (++h.count > max) {
      res.set("Retry-After", String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: message || "Too many attempts, try again in a few minutes" });
    }
    next();
  };
}

module.exports = { hashPassword, verifyPassword, needsRehash, createSession, destroySession, loadUser, requireUser, rateLimit, sha256, readCookie };
