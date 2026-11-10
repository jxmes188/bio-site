/* =========================================================
   Bio site server
   /              sign up / sign in
   /dashboard     edit your own page (signed in)
   /<username>    anyone's public profile page
   ========================================================= */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");

const { db, DATA_DIR } = require("./db");
const auth = require("./auth");
const { defaultProfile, sanitizeProfile, BADGE_ICONS } = require("./profile");
const mail = require("./mail");
const { applyPlan, featureInfo } = require("./features");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "..", "public");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const VIEW_SECRET = process.env.VIEW_SECRET || crypto.randomBytes(16).toString("hex");
const QUOTA_BYTES = 150 * 1024 * 1024; // per user storage
const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, ""); // e.g. https://goyslop.work
const VERIFY_HOURS = 24;                 // confirm link lifetime; unconfirmed accounts are deleted after this
const SIGNUPS_PER_IP_PER_DAY = 3;
const RESEND_COOLDOWN_MS = 60 * 1000;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const RESERVED = new Set([
  "api", "dashboard", "login", "logout", "signup", "register", "signin", "settings", "admin",
  "uploads", "css", "js", "img", "assets", "static", "public", "help", "about", "terms",
  "privacy", "support", "home", "index", "www", "root", "null", "undefined", "profile", "user", "users",
  "verify", "confirm", "reset", "email", "mail"
]);
const USERNAME_RE = /^(?![.])(?!.*[.]$)[a-z0-9_.]{2,20}$/;

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

// ---------- Security headers ----------
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "media-src 'self'",
      "connect-src 'self' https://api.lanyard.rest wss://api.lanyard.rest",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'self'"
    ].join("; ")
  });
  next();
});

app.use(express.json({ limit: "200kb" }));
app.use(auth.loadUser);
// Browsers must check for a newer version on every visit (fast "not modified" if unchanged),
// so an update never mixes a new page with an old cached script.
app.use(express.static(PUBLIC, {
  index: false,
  setHeaders: res => res.set("Cache-Control", "no-cache")
}));
app.use("/uploads", express.static(UPLOAD_DIR, {
  maxAge: "7d",
  setHeaders: res => res.set("Content-Security-Policy", "default-src 'none'; sandbox")
}));

// ---------- Helpers ----------
// Accounts allowed to open /admin (they still need the admin code). Set ADMIN_USERNAMES=lock,other on Railway.
const ADMINS = new Set((process.env.ADMIN_USERNAMES || "lock").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));

// Users store badge ids; turn them into {icon, label, color} from the badge catalog
function resolveBadges(json) {
  let ids = [];
  try { ids = JSON.parse(json || "[]"); } catch {}
  if (!Array.isArray(ids) || !ids.length) return [];
  const all = db.prepare("SELECT * FROM badges ORDER BY sort, id").all();
  return all.filter(b => ids.includes(b.id) && BADGE_ICONS.includes(b.icon)).map(b => ({ id: b.id, icon: b.icon, label: b.name, color: b.color }));
}

const getUserByName = name => db.prepare("SELECT * FROM users WHERE username = ?").get(String(name).toLowerCase());
const getUserById = id => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
const fileUrl = f => `/uploads/${f.user_id}/${f.filename}`;
const listFiles = userId => db.prepare("SELECT * FROM files WHERE user_id = ? ORDER BY created_at").all(userId);
const ownFileSet = userId => new Set(listFiles(userId).map(fileUrl));

function readProfile(user) {
  let p;
  try { p = JSON.parse(user.profile); } catch { p = {}; }
  const clean = sanitizeProfile(p, user.username, ownFileSet(user.id));
  return applyPlan(clean, defaultProfile(user.username), user.plan);
}
function readPrefs(user) {
  let p = {};
  try { p = JSON.parse(user.prefs || "{}"); } catch {}
  return {
    theme: ["light", "dark", "system"].includes(p.theme) ? p.theme : "dark",
    accent: /^#[0-9a-f]{6}$/i.test(p.accent || "") ? p.accent.toLowerCase() : "#a855f7",
    advanced: !!p.advanced
  };
}
function saveProfile(userId, profile) {
  db.prepare("UPDATE users SET profile = ? WHERE id = ?").run(JSON.stringify(profile), userId);
}
// Only confirmed accounts hold a username / email. Leftover unconfirmed ones
// (from the old email-link system) don't block anyone.
const getVerifiedByName = u => db.prepare("SELECT * FROM users WHERE username = ? AND email_verified = 1").get(u);
const getVerifiedByEmail = e => db.prepare("SELECT * FROM users WHERE email = ? AND email_verified = 1").get(e);

function usernameProblem(u) {
  if (!USERNAME_RE.test(u)) return "2–20 characters: letters, numbers, _ and . only";
  if (RESERVED.has(u)) return "That username is reserved";
  if (db.prepare("SELECT 1 FROM blocked_usernames WHERE name = ?").get(u)) return "That username isn't available";
  if (getVerifiedByName(u)) return "That username is already taken";
  return null;
}

// ---------- Sign-up codes ----------
const CODE_MINUTES = 15;        // a code works for 15 minutes
const CODE_MAX_TRIES = 5;       // wrong guesses allowed per code
const CODES_PER_IP_PER_HOUR = 10;

function siteHost(req) {
  try { return new URL(SITE_URL || `https://${req.get("host")}`).host; } catch { return req.get("host"); }
}
const hashCode = (id, code) => auth.sha256(`${id}|${code}|${VIEW_SECRET}`);

async function sendCode(req, pending) {
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  db.prepare("UPDATE pending_signups SET code_hash = ?, attempts = 0, sent_at = ?, expires_at = ? WHERE id = ?")
    .run(hashCode(pending.id, code), Date.now(), Date.now() + CODE_MINUTES * 60e3, pending.id);
  await mail.sendCode(pending.email, pending.username, code, siteHost(req));
}

// Hourly tidy-up: old unconfirmed accounts, expired codes, old logs
function cleanup() {
  const cutoff = Date.now() - VERIFY_HOURS * 3600e3;
  for (const u of db.prepare("SELECT id FROM users WHERE email_verified = 0 AND created_at < ?").all(cutoff)) {
    db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
    fs.rmSync(path.join(UPLOAD_DIR, String(u.id)), { recursive: true, force: true });
  }
  db.prepare("DELETE FROM pending_signups WHERE expires_at < ?").run(Date.now() - 3600e3);
  db.prepare("DELETE FROM signup_log WHERE created_at < ?").run(Date.now() - 864e5);
}
cleanup();
setInterval(cleanup, 3600e3).unref();

function meResponse(user) {
  return {
    username: user.username,
    email: user.email,
    views: user.views,
    badges: resolveBadges(user.badges),
    isAdmin: ADMINS.has(user.username),
    profile: readProfile(user),
    defaults: defaultProfile(user.username),
    prefs: readPrefs(user),
    features: featureInfo(user.plan),
    createdAt: user.created_at,
    files: listFiles(user.id).map(f => ({ id: f.id, kind: f.kind, url: fileUrl(f), name: f.original_name, size: f.size })),
    quota: QUOTA_BYTES
  };
}

const authLimiter = auth.rateLimit({ windowMs: 15 * 60e3, max: 20 });
const codeLimiter = auth.rateLimit({ windowMs: 15 * 60e3, max: 30 });

// ---------- Auth API ----------
app.get("/api/check/:username", (req, res) => {
  const u = String(req.params.username).toLowerCase();
  const problem = usernameProblem(u);
  res.json({ available: !problem, reason: problem });
});

// Step 1: check the details and email a 6-digit code. Nothing is created yet.
app.post("/api/signup", authLimiter, async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const problem = usernameProblem(username);
  if (problem) return res.status(400).json({ error: problem, field: "username" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
    return res.status(400).json({ error: "Enter a valid email", field: "email" });
  if (getVerifiedByEmail(email))
    return res.status(400).json({ error: "That email already has an account", field: "email" });
  if (password.length < 8 || password.length > 200)
    return res.status(400).json({ error: "Password must be at least 8 characters", field: "password" });

  const ipHash = auth.sha256(`${req.ip}|${VIEW_SECRET}`);
  const made = db.prepare("SELECT COUNT(*) n FROM signup_log WHERE ip_hash = ? AND created_at > ?").get(ipHash, Date.now() - 864e5).n;
  if (made >= SIGNUPS_PER_IP_PER_DAY)
    return res.status(429).json({ error: "Too many accounts created from this connection today. Try again tomorrow." });
  const codes = db.prepare("SELECT COUNT(*) n FROM pending_signups WHERE ip_hash = ? AND created_at > ?").get(ipHash, Date.now() - 3600e3).n;
  if (codes >= CODES_PER_IP_PER_HOUR)
    return res.status(429).json({ error: "Too many sign-up attempts. Try again in an hour." });

  // One pending sign-up per email: starting again replaces the old one
  db.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
  const pending = { id: crypto.randomBytes(16).toString("hex"), username, email };
  db.prepare(`INSERT INTO pending_signups (id, username, email, pass_hash, code_hash, attempts, sent_at, expires_at, ip_hash, created_at)
              VALUES (?, ?, ?, ?, '', 0, 0, 0, ?, ?)`)
    .run(pending.id, username, email, auth.hashPassword(password), ipHash, Date.now());

  try { await sendCode(req, pending); }
  catch (err) {
    console.error("Sign-up code email failed:", err.message);
    db.prepare("DELETE FROM pending_signups WHERE id = ?").run(pending.id);
    return res.status(502).json({ error: "We couldn't send the email. Check the address and try again." });
  }
  res.json({ ok: true, pendingId: pending.id, email, username });
});

// Step 2: the code from the email creates the account and claims the username
app.post("/api/signup/verify", codeLimiter, (req, res) => {
  const p = db.prepare("SELECT * FROM pending_signups WHERE id = ?").get(String(req.body.pendingId || ""));
  if (!p || p.expires_at < Date.now())
    return res.status(400).json({ error: "This code has expired. Press \"Resend code\" to get a new one.", expired: true });
  if (p.attempts >= CODE_MAX_TRIES)
    return res.status(400).json({ error: "Too many wrong codes. Press \"Resend code\" to get a new one." });

  const code = String(req.body.code || "").replace(/\D/g, "");
  const ok = code.length === 6 && crypto.timingSafeEqual(Buffer.from(hashCode(p.id, code)), Buffer.from(p.code_hash));
  if (!ok) {
    db.prepare("UPDATE pending_signups SET attempts = attempts + 1 WHERE id = ?").run(p.id);
    const left = CODE_MAX_TRIES - p.attempts - 1;
    return res.status(400).json({ error: left > 0 ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.` : "Wrong code. Press \"Resend code\" to get a new one." });
  }

  // Someone may have claimed the name or email while this code was waiting
  if (getVerifiedByName(p.username)) {
    db.prepare("DELETE FROM pending_signups WHERE id = ?").run(p.id);
    return res.status(409).json({ error: "Someone just claimed that username. Pick another one.", restart: true });
  }
  if (getVerifiedByEmail(p.email)) {
    db.prepare("DELETE FROM pending_signups WHERE id = ?").run(p.id);
    return res.status(409).json({ error: "That email already has an account. Sign in instead.", restart: true });
  }

  // Clear any leftover unconfirmed account holding this name or email
  for (const old of db.prepare("SELECT id FROM users WHERE email_verified = 0 AND (username = ? OR email = ?)").all(p.username, p.email)) {
    db.prepare("DELETE FROM users WHERE id = ?").run(old.id);
    fs.rmSync(path.join(UPLOAD_DIR, String(old.id)), { recursive: true, force: true });
  }

  const info = db.prepare("INSERT INTO users (username, email, pass_hash, profile, created_at, email_verified) VALUES (?, ?, ?, ?, ?, 1)")
    .run(p.username, p.email, p.pass_hash, JSON.stringify(defaultProfile(p.username)), Date.now());
  db.prepare("DELETE FROM pending_signups WHERE id = ? OR username = ?").run(p.id, p.username);
  db.prepare("INSERT INTO signup_log (ip_hash, created_at) VALUES (?, ?)").run(p.ip_hash, Date.now());
  auth.createSession(res, Number(info.lastInsertRowid), req.secure);
  res.json({ ok: true, username: p.username });
});

app.post("/api/signup/resend", codeLimiter, async (req, res) => {
  const p = db.prepare("SELECT * FROM pending_signups WHERE id = ?").get(String(req.body.pendingId || ""));
  if (!p) return res.status(400).json({ error: "This sign-up has expired. Fill in the form again.", restart: true });
  const wait = p.sent_at + RESEND_COOLDOWN_MS - Date.now();
  if (wait > 0) return res.status(429).json({ error: `Wait ${Math.ceil(wait / 1000)}s before sending another code` });
  try { await sendCode(req, p); }
  catch (err) { console.error("Sign-up code email failed:", err.message); return res.status(502).json({ error: "Couldn't send the email. Try again in a minute." }); }
  res.json({ ok: true });
});

// ---------- Forgot password ----------
// Always answers the same way, so nobody can use it to find out which emails have accounts.
app.post("/api/password/forgot", authLimiter, async (req, res) => {
  const login = String(req.body.login || "").trim().toLowerCase();
  const user = login && db.prepare("SELECT * FROM users WHERE (username = ? OR email = ?) AND email_verified = 1 AND banned = 0").get(login, login);
  const id = crypto.randomBytes(16).toString("hex");
  if (user) {
    const recent = db.prepare("SELECT COUNT(*) n FROM password_resets WHERE user_id = ? AND created_at > ?").get(user.id, Date.now() - 3600e3).n;
    if (recent < 5) {
      db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
      db.prepare("INSERT INTO password_resets (id, user_id, code_hash, attempts, sent_at, expires_at, created_at) VALUES (?, ?, '', 0, 0, 0, ?)")
        .run(id, user.id, Date.now());
      try { await sendResetCode(req, id, user); }
      catch (err) { console.error("Reset email failed:", err.message); return res.status(502).json({ error: "Couldn't send the email. Try again in a minute." }); }
    }
  }
  res.json({ ok: true, resetId: id });
});

async function sendResetCode(req, id, user) {
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  db.prepare("UPDATE password_resets SET code_hash = ?, attempts = 0, sent_at = ?, expires_at = ? WHERE id = ?")
    .run(hashCode(id, code), Date.now(), Date.now() + CODE_MINUTES * 60e3, id);
  await mail.sendResetCode(user.email, user.username, code, siteHost(req));
}

app.post("/api/password/resend", codeLimiter, async (req, res) => {
  const r = db.prepare("SELECT * FROM password_resets WHERE id = ?").get(String(req.body.resetId || ""));
  if (!r) return res.json({ ok: true }); // unknown id: same answer as a real one
  const wait = r.sent_at + RESEND_COOLDOWN_MS - Date.now();
  if (wait > 0) return res.status(429).json({ error: `Wait ${Math.ceil(wait / 1000)}s before sending another code` });
  const user = getUserById(r.user_id);
  try { await sendResetCode(req, r.id, user); }
  catch (err) { console.error("Reset email failed:", err.message); return res.status(502).json({ error: "Couldn't send the email. Try again in a minute." }); }
  res.json({ ok: true });
});

app.post("/api/password/reset", codeLimiter, (req, res) => {
  const r = db.prepare("SELECT * FROM password_resets WHERE id = ?").get(String(req.body.resetId || ""));
  const password = String(req.body.password || "");
  if (password.length < 8 || password.length > 200)
    return res.status(400).json({ error: "New password must be at least 8 characters", field: "password" });
  if (!r) return res.status(400).json({ error: "Wrong code." });
  if (r.expires_at < Date.now()) return res.status(400).json({ error: "This code has expired. Press \"Resend code\" to get a new one." });
  if (r.attempts >= CODE_MAX_TRIES) return res.status(400).json({ error: "Too many wrong codes. Press \"Resend code\" to get a new one." });

  const code = String(req.body.code || "").replace(/\D/g, "");
  const ok = code.length === 6 && crypto.timingSafeEqual(Buffer.from(hashCode(r.id, code)), Buffer.from(r.code_hash));
  if (!ok) {
    db.prepare("UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?").run(r.id);
    const left = CODE_MAX_TRIES - r.attempts - 1;
    return res.status(400).json({ error: left > 0 ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.` : "Wrong code. Press \"Resend code\" to get a new one." });
  }

  db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?").run(auth.hashPassword(password), r.user_id);
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(r.user_id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(r.user_id); // sign out everywhere else
  auth.createSession(res, r.user_id, req.secure);
  res.json({ ok: true, username: getUserById(r.user_id).username });
});

app.post("/api/login", authLimiter, (req, res) => {
  const login = String(req.body.login || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE (username = ? OR email = ?) AND email_verified = 1").get(login, login);
  if (!user || !auth.verifyPassword(password, user.pass_hash))
    return res.status(401).json({ error: "Wrong username/email or password" });
  if (user.banned) return res.status(403).json({ error: "This account has been suspended." });
  auth.createSession(res, user.id, req.secure);
  res.json({ ok: true, username: user.username });
});

app.post("/api/logout", (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

// ---------- Account / profile API ----------
app.get("/api/me", auth.requireUser, (req, res) => res.json(meResponse(getUserById(req.user.id))));

const saveLimiter = auth.rateLimit({ windowMs: 60e3, max: 120 }); // autosave-friendly, but not unlimited

app.put("/api/me/profile", auth.requireUser, saveLimiter, (req, res) => {
  const user = getUserById(req.user.id);
  const clean = sanitizeProfile(req.body, user.username, ownFileSet(user.id));
  saveProfile(user.id, applyPlan(clean, defaultProfile(user.username), user.plan));
  res.json(meResponse(getUserById(user.id)));
});

// Dashboard look: light / dark / system + accent colour
app.put("/api/me/prefs", auth.requireUser, saveLimiter, (req, res) => {
  const user = getUserById(req.user.id);
  const merged = { ...readPrefs(user), ...(req.body || {}) };
  db.prepare("UPDATE users SET prefs = ? WHERE id = ?").run(JSON.stringify(readPrefs({ prefs: JSON.stringify(merged) })), user.id);
  res.json({ prefs: readPrefs(getUserById(user.id)) });
});

// Delete your own account (needs your password)
app.delete("/api/me", auth.requireUser, authLimiter, (req, res) => {
  const user = getUserById(req.user.id);
  if (!auth.verifyPassword(String((req.body || {}).password || ""), user.pass_hash))
    return res.status(400).json({ error: "Password is wrong" });
  if (ADMINS.has(user.username)) return res.status(400).json({ error: "Admin accounts can't be deleted from here" });
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  db.prepare("DELETE FROM view_log WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM click_log WHERE user_id = ?").run(user.id);
  fs.rmSync(path.join(UPLOAD_DIR, String(user.id)), { recursive: true, force: true });
  auth.destroySession(req, res);
  res.json({ ok: true });
});

// ---------- Analytics (your own page) ----------
app.get("/api/me/analytics", auth.requireUser, (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const user = getUserById(req.user.id);
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const from = dayList[0];

  const viewsByDay = Object.fromEntries(db.prepare("SELECT day, COUNT(*) n FROM view_log WHERE user_id = ? AND day >= ? GROUP BY day").all(user.id, from).map(r => [r.day, r.n]));
  const clicksByDay = Object.fromEntries(db.prepare("SELECT day, COUNT(*) n FROM click_log WHERE user_id = ? AND day >= ? GROUP BY day").all(user.id, from).map(r => [r.day, r.n]));
  const profile = readProfile(user);
  const labels = {};
  for (const s of profile.socials) labels[s.url] = s.label;
  for (const l of profile.links) labels[l.url] = l.title;

  res.json({
    days,
    totalViews: user.views,
    series: dayList.map(d => ({ day: d, views: viewsByDay[d] || 0, clicks: clicksByDay[d] || 0 })),
    links: db.prepare("SELECT target, COUNT(*) n FROM click_log WHERE user_id = ? AND day >= ? GROUP BY target ORDER BY n DESC LIMIT 15")
      .all(user.id, from).map(r => ({ url: r.target, label: labels[r.target] || r.target, clicks: r.n })),
    referrers: db.prepare("SELECT ref, COUNT(*) n FROM view_log WHERE user_id = ? AND day >= ? GROUP BY ref ORDER BY n DESC LIMIT 10")
      .all(user.id, from).map(r => ({ source: r.ref || "Direct / unknown", views: r.n }))
  });
});

app.post("/api/me/password", auth.requireUser, authLimiter, (req, res) => {
  const user = getUserById(req.user.id);
  const { current, next } = req.body || {};
  if (!auth.verifyPassword(String(current || ""), user.pass_hash)) return res.status(400).json({ error: "Current password is wrong" });
  if (typeof next !== "string" || next.length < 8 || next.length > 200) return res.status(400).json({ error: "New password must be at least 8 characters" });
  db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?").run(auth.hashPassword(next), user.id);
  res.json({ ok: true });
});

// ---------- Uploads ----------
const IMG = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const VID = [".mp4", ".webm"];
const AUD = [".mp3", ".ogg", ".wav", ".m4a"];
const KINDS = {
  avatar:     { maxMB: 5,  exts: IMG,              single: true },
  banner:     { maxMB: 8,  exts: IMG,              single: true },
  background: { maxMB: 30, exts: [...IMG, ...VID], single: true },
  cursor:     { maxMB: 1,  exts: [".png", ".gif", ".webp"], single: true },
  music:      { maxMB: 20, exts: AUD,              single: false, maxCount: 10 }
};

/** Check the file's first bytes really match its extension (stops renamed files). */
function realTypeMatches(filePath, ext) {
  let b;
  try {
    const fd = fs.openSync(filePath, "r");
    b = Buffer.alloc(16);
    fs.readSync(fd, b, 0, 16, 0);
    fs.closeSync(fd);
  } catch { return false; }
  const ascii = (s, e) => b.toString("latin1", s, e);
  switch (ext) {
    case ".png": return b[0] === 0x89 && ascii(1, 4) === "PNG";
    case ".jpg": case ".jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case ".gif": return ascii(0, 4) === "GIF8";
    case ".webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case ".mp4": case ".m4a": return ascii(4, 8) === "ftyp";
    case ".webm": return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case ".mp3": return ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case ".ogg": return ascii(0, 4) === "OggS";
    case ".wav": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
    default: return false;
  }
}

const uploaders = Object.fromEntries(Object.entries(KINDS).map(([kind, k]) => [kind, multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      const dir = path.join(UPLOAD_DIR, String(req.user.id));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_r, file, cb) => cb(null, crypto.randomBytes(12).toString("hex") + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: k.maxMB * 1024 * 1024, files: 1 },
  fileFilter: (_r, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okMime = /^(image|video|audio)\//.test(file.mimetype);
    if (k.exts.includes(ext) && okMime) cb(null, true);
    else cb(Object.assign(new Error(`Allowed file types: ${k.exts.join(", ")}`), { status: 400 }));
  }
}).single("file")]));

function removeFile(f) {
  db.prepare("DELETE FROM files WHERE id = ?").run(f.id);
  fs.promises.unlink(path.join(UPLOAD_DIR, String(f.user_id), f.filename)).catch(() => {});
}

app.post("/api/me/upload/:kind", auth.requireUser, (req, res, next) => {
  const kind = req.params.kind;
  const k = KINDS[kind];
  if (!k) return res.status(400).json({ error: "Unknown upload type" });
  if (!k.single && db.prepare("SELECT COUNT(*) n FROM files WHERE user_id = ? AND kind = ?").get(req.user.id, kind).n >= k.maxCount)
    return res.status(400).json({ error: `You can upload up to ${k.maxCount} songs` });

  uploaders[kind](req, res, err => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: "No file received" });
    if (!realTypeMatches(req.file.path, path.extname(req.file.filename))) {
      fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: "That file isn't really the type its name says. Try exporting it again." });
    }

    const userId = req.user.id;
    const used = db.prepare("SELECT COALESCE(SUM(size),0) s FROM files WHERE user_id = ?").get(userId).s;
    if (used + req.file.size > QUOTA_BYTES) {
      fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: "Storage full (150 MB). Delete some files first." });
    }

    const file = {
      id: crypto.randomBytes(8).toString("hex"), user_id: userId, kind,
      filename: req.file.filename, original_name: req.file.originalname.slice(0, 120), size: req.file.size
    };

    // Single-file kinds replace the previous one
    if (k.single) for (const old of db.prepare("SELECT * FROM files WHERE user_id = ? AND kind = ?").all(userId, kind)) removeFile(old);

    db.prepare("INSERT INTO files (id, user_id, kind, filename, original_name, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(file.id, userId, kind, file.filename, file.original_name, file.size, Date.now());

    const user = getUserById(userId);
    const profile = readProfile(user);
    const url = fileUrl(file);
    if (kind === "avatar") profile.avatar = url;
    if (kind === "banner") profile.banner = url;
    if (kind === "cursor") profile.cursor.image = url;
    if (kind === "background") {
      profile.background.url = url;
      profile.background.type = VID.includes(path.extname(file.filename)) ? "video" : "image";
    }
    if (kind === "music") {
      profile.music.tracks.push({ id: file.id, title: file.original_name.replace(/\.[^.]+$/, ""), src: url });
    }
    saveProfile(userId, sanitizeProfile(profile, user.username, ownFileSet(userId)));
    res.json(meResponse(getUserById(userId)));
  });
});

app.delete("/api/me/files/:id", auth.requireUser, (req, res) => {
  const f = db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!f) return res.status(404).json({ error: "File not found" });
  removeFile(f);
  // readProfile drops any reference to a file the user no longer owns
  const user = getUserById(req.user.id);
  const profile = readProfile(user);
  if (f.kind === "background" && !profile.background.url && ["image", "video"].includes(profile.background.type))
    profile.background.type = "color";
  saveProfile(user.id, profile);
  res.json(meResponse(getUserById(user.id)));
});

// ---------- Public profile API ----------
app.get("/api/profile/:username", (req, res) => {
  const user = getUserByName(req.params.username);
  if (!user || !user.email_verified || user.banned)
    return res.status(404).json({ error: "User not found" });

  // Count one view per visitor per day (visitor = hashed IP + browser, never stored raw)
  if (req.query.preview !== "1") {
    const day = new Date().toISOString().slice(0, 10);
    const visitor = auth.sha256(`${req.ip}|${req.get("user-agent") || ""}|${VIEW_SECRET}`);
    // Where they came from: just the site name, e.g. "tiktok.com" (sent by the page from document.referrer)
    let ref = String(req.query.ref || "").toLowerCase().replace(/^www\./, "");
    if (!/^[a-z0-9.-]{3,100}$/.test(ref) || !ref.includes(".") || ref === siteHost(req)) ref = "";
    const r = db.prepare("INSERT OR IGNORE INTO view_log (user_id, visitor_hash, day, ref) VALUES (?, ?, ?, ?)").run(user.id, visitor, day, ref);
    if (r.changes) db.prepare("UPDATE users SET views = views + 1 WHERE id = ?").run(user.id);
  }

  const fresh = getUserById(user.id);
  res.json({
    username: fresh.username,
    views: fresh.views,
    createdAt: fresh.created_at,
    badges: resolveBadges(fresh.badges),
    profile: readProfile(fresh)
  });
});

// Link click tracking (sent by the profile page). Only counts links that are really on that page,
// once per visitor per link per day, so it can't be spammed.
const trackLimiter = auth.rateLimit({ windowMs: 60e3, max: 60 });
app.post("/api/track/click", trackLimiter, (req, res) => {
  const { u, t } = req.body || {};
  const user = typeof u === "string" && getUserByName(u);
  if (!user || !user.email_verified || user.banned || typeof t !== "string") return res.status(204).end();
  const p = readProfile(user);
  if (![...p.socials.map(s => s.url), ...p.links.map(l => l.url)].includes(t)) return res.status(204).end();
  const day = new Date().toISOString().slice(0, 10);
  const visitor = auth.sha256(`${req.ip}|${req.get("user-agent") || ""}|${VIEW_SECRET}`);
  db.prepare("INSERT OR IGNORE INTO click_log (user_id, visitor_hash, day, target) VALUES (?, ?, ?, ?)").run(user.id, visitor, day, t);
  res.status(204).end();
});

// ---------- Admin ----------
require("./admin-panel")(app, {
  db, auth, ADMINS, PUBLIC, UPLOAD_DIR, USERNAME_RE, RESERVED,
  getUserById, readProfile, saveProfile, defaultProfile, sanitizeProfile, ownFileSet, listFiles, fileUrl, removeFile, resolveBadges
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// ---------- Pages ----------
// The homepage always shows sign in / sign up (signed-in visitors also get a "Go to dashboard" bar)
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC, "index.html")));
app.get("/dashboard", (req, res) => (req.user ? res.sendFile(path.join(PUBLIC, "dashboard.html")) : res.redirect("/")));

app.get("/:username", (req, res, next) => {
  const name = req.params.username;
  const user = getUserByName(name);
  if (!user || !user.email_verified || user.banned) return next();
  if (name !== user.username) return res.redirect(301, "/" + user.username);
  res.sendFile(path.join(PUBLIC, "profile.html"));
});

app.use((_req, res) => res.status(404).sendFile(path.join(PUBLIC, "404.html")));

// ---------- Errors ----------
app.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "That file is too big" });
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Too much data" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`\n  Bio site running:  http://localhost:${PORT}`);
  console.log(`  Database:          ${path.join(DATA_DIR, "bio.db")}`);
  console.log(`  Uploads:           ${UPLOAD_DIR}\n`);
});
