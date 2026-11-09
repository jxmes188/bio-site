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
app.use(express.static(PUBLIC, { index: false, maxAge: "1h" }));
app.use("/uploads", express.static(UPLOAD_DIR, {
  maxAge: "7d",
  setHeaders: res => res.set("Content-Security-Policy", "default-src 'none'; sandbox")
}));

// ---------- Helpers ----------
const getUserByName = name => db.prepare("SELECT * FROM users WHERE username = ?").get(String(name).toLowerCase());
const getUserById = id => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
const fileUrl = f => `/uploads/${f.user_id}/${f.filename}`;
const listFiles = userId => db.prepare("SELECT * FROM files WHERE user_id = ? ORDER BY created_at").all(userId);
const ownFileSet = userId => new Set(listFiles(userId).map(fileUrl));

function readProfile(user) {
  let p;
  try { p = JSON.parse(user.profile); } catch { p = {}; }
  return sanitizeProfile({ ...defaultProfile(user.username), ...p }, user.username, ownFileSet(user.id));
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
    badges: JSON.parse(user.badges || "[]"),
    profile: readProfile(user),
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

app.post("/api/login", authLimiter, (req, res) => {
  const login = String(req.body.login || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE (username = ? OR email = ?) AND email_verified = 1").get(login, login);
  if (!user || !auth.verifyPassword(password, user.pass_hash))
    return res.status(401).json({ error: "Wrong username/email or password" });
  auth.createSession(res, user.id, req.secure);
  res.json({ ok: true, username: user.username });
});

app.post("/api/logout", (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

// ---------- Account / profile API ----------
app.get("/api/me", auth.requireUser, (req, res) => res.json(meResponse(getUserById(req.user.id))));

app.put("/api/me/profile", auth.requireUser, (req, res) => {
  const user = getUserById(req.user.id);
  const profile = sanitizeProfile(req.body, user.username, ownFileSet(user.id));
  saveProfile(user.id, profile);
  res.json(meResponse(getUserById(user.id)));
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
  music:      { maxMB: 20, exts: AUD,              single: false, maxCount: 10 }
};

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
    profile.background.type = "particles";
  saveProfile(user.id, profile);
  res.json(meResponse(getUserById(user.id)));
});

// ---------- Public profile API ----------
app.get("/api/profile/:username", (req, res) => {
  const user = getUserByName(req.params.username);
  if (!user || !user.email_verified)
    return res.status(404).json({ error: "User not found" });

  // Count one view per visitor per day (visitor = hashed IP + browser, never stored raw)
  if (req.query.preview !== "1") {
    const day = new Date().toISOString().slice(0, 10);
    const visitor = auth.sha256(`${req.ip}|${req.get("user-agent") || ""}|${VIEW_SECRET}`);
    const r = db.prepare("INSERT OR IGNORE INTO view_log (user_id, visitor_hash, day) VALUES (?, ?, ?)").run(user.id, visitor, day);
    if (r.changes) db.prepare("UPDATE users SET views = views + 1 WHERE id = ?").run(user.id);
  }

  const fresh = getUserById(user.id);
  res.json({
    username: fresh.username,
    views: fresh.views,
    createdAt: fresh.created_at,
    badges: JSON.parse(fresh.badges || "[]").filter(b => BADGE_ICONS.includes(b.icon)),
    profile: readProfile(fresh)
  });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// ---------- Pages ----------
app.get("/", (req, res) => (req.user ? res.redirect("/dashboard") : res.sendFile(path.join(PUBLIC, "index.html"))));
app.get("/dashboard", (req, res) => (req.user ? res.sendFile(path.join(PUBLIC, "dashboard.html")) : res.redirect("/")));

app.get("/:username", (req, res, next) => {
  const name = req.params.username;
  const user = getUserByName(name);
  if (!user || !user.email_verified) return next();
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
