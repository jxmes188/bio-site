/* =========================================================
   Admin panel  (/admin  +  /api/admin/*)

   Who can get in:
     1. You must be signed in as an account listed in ADMIN_USERNAMES (default: lock)
     2. AND type the admin code, which is the ADMIN_CODE setting on Railway.
        It is never stored in the code, because the GitHub repo is public.
   Wrong codes are rate-limited (5 tries per 15 minutes per connection).
   Unlocking lasts 12 hours. Every admin action is written to the admin log.
   ========================================================= */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const ADMIN_COOKIE = "adm";
const ADMIN_HOURS = 12;
const multer = require("multer");
const { BADGE_ICONS } = require("./profile");

module.exports = function mountAdmin(app, d) {
  const { db, auth, ADMINS } = d;
  const ADMIN_CODE = process.env.ADMIN_CODE || "";
  const sha = s => crypto.createHash("sha256").update(String(s)).digest();

  if (!ADMIN_CODE) console.log("  Admin panel:       disabled (set ADMIN_CODE to turn it on)");

  // ---------- helpers ----------
  const isAdminUser = req => !!(req.user && ADMINS.has(req.user.username));

  function adminSession(req) {
    const token = auth.readCookie(req, ADMIN_COOKIE);
    if (!token || !req.user) return null;
    return db.prepare("SELECT * FROM admin_sessions WHERE token_hash = ? AND user_id = ? AND expires_at > ?")
      .get(auth.sha256(token), req.user.id, Date.now());
  }

  // Not an admin account → behave exactly like a page that doesn't exist
  function requireAdminUser(req, res, next) {
    if (!isAdminUser(req) || !ADMIN_CODE) return res.status(404).json({ error: "Not found" });
    next();
  }
  function requireUnlocked(req, res, next) {
    if (!adminSession(req)) return res.status(401).json({ error: "Locked", locked: true });
    next();
  }
  const admin = [requireAdminUser, requireUnlocked];

  function log(req, action, target = "", details = "") {
    db.prepare("INSERT INTO admin_log (admin, action, target, details, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(req.user.username, action, String(target).slice(0, 100), String(details).slice(0, 500), Date.now());
  }

  function userRow(id) { return db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id)); }
  function userIds(json) { try { const a = JSON.parse(json || "[]"); return Array.isArray(a) ? a.filter(Number.isInteger) : []; } catch { return []; } }
  function storageOf(id) { return db.prepare("SELECT COALESCE(SUM(size),0) s, COUNT(*) n FROM files WHERE user_id = ?").get(id); }

  function summary(u) {
    const st = storageOf(u.id);
    let displayName = u.username;
    try { displayName = JSON.parse(u.profile).displayName || u.username; } catch {}
    return {
      id: u.id, username: u.username, email: u.email, displayName,
      createdAt: u.created_at, views: u.views, banned: !!u.banned, verified: !!u.email_verified,
      badges: userIds(u.badges), files: st.n, storage: st.s, isAdmin: ADMINS.has(u.username)
    };
  }

  const deleteUserCompletely = d.deleteUserCompletely;

  const codeLimiter = auth.rateLimit({ windowMs: 15 * 60e3, max: 5 });

  // ---------- Page ----------
  app.get("/admin", (req, res, next) => {
    if (!isAdminUser(req) || !ADMIN_CODE) return next(); // falls through to the 404 page
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(d.PUBLIC, "admin.html"));
  });

  // ---------- Lock / unlock ----------
  app.get("/api/admin/status", requireAdminUser, (req, res) => {
    res.json({ unlocked: !!adminSession(req), admin: req.user.username });
  });

  app.post("/api/admin/unlock", requireAdminUser, codeLimiter, (req, res) => {
    const ok = crypto.timingSafeEqual(sha(req.body.code || ""), sha(ADMIN_CODE));
    if (!ok) {
      console.warn(`[admin] wrong code for ${req.user.username} from ${req.ip}`);
      return res.status(401).json({ error: "Wrong code" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO admin_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(auth.sha256(token), req.user.id, Date.now() + ADMIN_HOURS * 3600e3);
    res.cookie(ADMIN_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: req.secure, maxAge: ADMIN_HOURS * 3600e3, path: "/" });
    log(req, "unlock");
    res.json({ ok: true });
  });

  app.post("/api/admin/lock", requireAdminUser, (req, res) => {
    const token = auth.readCookie(req, ADMIN_COOKIE);
    if (token) db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(auth.sha256(token));
    res.clearCookie(ADMIN_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  // ---------- Overview ----------
  app.get("/api/admin/stats", admin, (_req, res) => {
    const now = Date.now();
    const one = q => db.prepare(q);
    res.json({
      users: one("SELECT COUNT(*) n FROM users WHERE email_verified = 1").get().n,
      banned: one("SELECT COUNT(*) n FROM users WHERE banned = 1").get().n,
      signups24h: one("SELECT COUNT(*) n FROM users WHERE email_verified = 1 AND created_at > ?").get(now - 864e5).n,
      signups7d: one("SELECT COUNT(*) n FROM users WHERE email_verified = 1 AND created_at > ?").get(now - 7 * 864e5).n,
      views: one("SELECT COALESCE(SUM(views),0) n FROM users").get().n,
      storage: one("SELECT COALESCE(SUM(size),0) n FROM files").get().n,
      files: one("SELECT COUNT(*) n FROM files").get().n,
      pending: one("SELECT COUNT(*) n FROM pending_signups WHERE expires_at > ?").get(now).n,
      newest: one("SELECT username, created_at FROM users WHERE email_verified = 1 ORDER BY created_at DESC LIMIT 5").all(),
      topViews: one("SELECT username, views FROM users WHERE email_verified = 1 ORDER BY views DESC LIMIT 5").all()
    });
  });

  // ---------- Users ----------
  app.get("/api/admin/users", admin, (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();
    const sort = { new: "created_at DESC", old: "created_at ASC", views: "views DESC", name: "username ASC" }[req.query.sort] || "created_at DESC";
    const filter = { banned: "AND banned = 1", unverified: "AND email_verified = 0" }[req.query.filter] || "";
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const where = `WHERE (username LIKE ? OR email LIKE ?) ${filter}`;
    const total = db.prepare(`SELECT COUNT(*) n FROM users ${where}`).get(like, like).n;
    const rows = db.prepare(`SELECT * FROM users ${where} ORDER BY ${sort} LIMIT 50 OFFSET ?`).all(like, like, page * 50);
    res.json({ total, page, pageSize: 50, users: rows.map(summary) });
  });

  app.get("/api/admin/users/:id", admin, (req, res) => {
    const u = userRow(req.params.id);
    if (!u) return res.status(404).json({ error: "User not found" });
    const p = d.readProfile(u);
    res.json({
      ...summary(u),
      sessions: db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires_at > ?").get(u.id, Date.now()).n,
      discordId: p.discord.userId, bio: p.bio, location: p.location,
      fileList: d.listFiles(u.id).map(f => ({ id: f.id, kind: f.kind, name: f.original_name, size: f.size, url: d.fileUrl(f), createdAt: f.created_at }))
    });
  });

  // Edit username / email / badges / views / banned
  app.patch("/api/admin/users/:id", admin, (req, res) => {
    const u = userRow(req.params.id);
    if (!u) return res.status(404).json({ error: "User not found" });
    const b = req.body || {};
    const changes = [];

    if (b.username !== undefined) {
      const name = String(b.username).trim().toLowerCase();
      if (name !== u.username) {
        if (!d.USERNAME_RE.test(name)) return res.status(400).json({ error: "Username: 2–20 characters, letters, numbers, _ and . only" });
        if (db.prepare("SELECT 1 FROM users WHERE username = ? AND id != ?").get(name, u.id)) return res.status(400).json({ error: "That username is taken" });
        if (ADMINS.has(u.username) && u.id === req.user.id) return res.status(400).json({ error: "Change your own admin username in ADMIN_USERNAMES first, or you'd lock yourself out" });
        db.prepare("UPDATE users SET username = ? WHERE id = ?").run(name, u.id);
        changes.push(`username ${u.username} → ${name}`);
      }
    }
    if (b.email !== undefined) {
      const email = String(b.email).trim().toLowerCase();
      if (email !== u.email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return res.status(400).json({ error: "Enter a valid email" });
        if (db.prepare("SELECT 1 FROM users WHERE email = ? AND id != ?").get(email, u.id)) return res.status(400).json({ error: "That email is used by another account" });
        db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, u.id);
        changes.push(`email → ${email}`);
      }
    }
    if (b.badges !== undefined) {
      const valid = new Set(db.prepare("SELECT id FROM badges").all().map(r => r.id));
      const ids = [...new Set((Array.isArray(b.badges) ? b.badges : []).map(Number).filter(i => valid.has(i)))];
      db.prepare("UPDATE users SET badges = ? WHERE id = ?").run(JSON.stringify(ids), u.id);
      changes.push(`badges → [${ids.join(", ")}]`);
    }
    if (b.views !== undefined) {
      const v = Math.max(0, Math.min(1e9, parseInt(b.views, 10) || 0));
      db.prepare("UPDATE users SET views = ? WHERE id = ?").run(v, u.id);
      changes.push(`views → ${v}`);
    }
    if (b.banned !== undefined) {
      const ban = !!b.banned;
      if (ban && u.id === req.user.id) return res.status(400).json({ error: "You can't ban yourself" });
      db.prepare("UPDATE users SET banned = ? WHERE id = ?").run(ban ? 1 : 0, u.id);
      if (ban) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
      changes.push(ban ? "banned" : "unbanned");
    }
    if (changes.length) log(req, "edit user", u.username, changes.join("; "));
    res.json(summary(userRow(u.id)));
  });

  app.post("/api/admin/users/:id/password", admin, (req, res) => {
    const u = userRow(req.params.id);
    if (!u) return res.status(404).json({ error: "User not found" });
    const pw = String(req.body.password || "");
    if (pw.length < 8 || pw.length > 200) return res.status(400).json({ error: "Password must be at least 8 characters" });
    db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?").run(auth.hashPassword(pw), u.id);
    if (u.id !== req.user.id) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
    log(req, "set password", u.username);
    res.json({ ok: true });
  });

  app.post("/api/admin/users/:id/signout", admin, (req, res) => {
    const u = userRow(req.params.id);
    if (!u) return res.status(404).json({ error: "User not found" });
    const n = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id).changes;
    log(req, "sign out everywhere", u.username, `${n} sessions`);
    res.json({ ok: true, signedOut: n });
  });

  app.post("/api/admin/users/:id/reset-profile", admin, (req, res) => {
    const u = userRow(req.params.id);
    if (!u) return res.status(404).json({ error: "User not found" });
    if (req.body.deleteFiles) for (const f of d.listFiles(u.id)) d.removeFile(f);
    d.saveProfile(u.id, d.defaultProfile(u.username));
    log(req, "reset page", u.username, req.body.deleteFiles ? "and deleted files" : "");
    res.json({ ok: true });
  });

  app.delete("/api/admin/users/:id/files/:fileId", admin, (req, res) => {
    const u = userRow(req.params.id);
    const f = u && db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").get(req.params.fileId, u.id);
    if (!f) return res.status(404).json({ error: "File not found" });
    d.removeFile(f);
    const p = d.readProfile(userRow(u.id)); // drops references to the deleted file
    if (f.kind === "background" && !p.background.url && ["image", "video"].includes(p.background.type)) p.background.type = "color";
    d.saveProfile(u.id, p);
    log(req, "delete file", u.username, f.original_name);
    res.json({ ok: true });
  });

  app.delete("/api/admin/users/:id", admin, (req, res) => {
    const u = userRow(req.params.id);
    if (!u) return res.status(404).json({ error: "User not found" });
    if (u.id === req.user.id) return res.status(400).json({ error: "You can't delete your own admin account here" });
    if (String(req.body.confirm || "").toLowerCase() !== u.username) return res.status(400).json({ error: "Type the username to confirm" });
    deleteUserCompletely(u);
    if (req.body.block) db.prepare("INSERT OR IGNORE INTO blocked_usernames (name, created_at) VALUES (?, ?)").run(u.username, Date.now());
    log(req, "delete account", u.username, `${u.email}${req.body.block ? "; username blocked" : ""}`);
    res.json({ ok: true });
  });

  // ---------- Badges ----------
  // Icon: one from the built-in set, or an uploaded picture (PNG / SVG / ICO, 256 KB) in uploads/badges/
  const BADGE_DIR = path.join(d.UPLOAD_DIR, "badges");
  fs.mkdirSync(BADGE_DIR, { recursive: true });
  const BADGE_EXTS = [".png", ".svg", ".ico"];
  const badgeImagePath = url => (/^\/uploads\/badges\/[a-f0-9]{24}\.(png|svg|ico)$/.test(url || "") ? path.join(BADGE_DIR, path.basename(url)) : null);
  const removeBadgeImage = url => { const p = badgeImagePath(url); if (p) fs.promises.unlink(p).catch(() => {}); };

  const badgeList = () => db.prepare("SELECT b.*, (SELECT COUNT(*) FROM users u, json_each(u.badges) j WHERE j.value = b.id) AS users FROM badges b ORDER BY sort, id").all()
    .map(b => ({ ...b, glow: !!b.glow }));
  function cleanBadge(b) {
    const name = String(b.name || "").trim().slice(0, 30);
    const icon = BADGE_ICONS.includes(b.icon) ? b.icon : null;
    const color = /^#[0-9a-fA-F]{6}$/.test(b.color || "") ? b.color.toLowerCase() : null;
    if (!name) return { error: "Give the badge a name" };
    if (!icon) return { error: "Pick an icon" };
    if (!color) return { error: "Pick a colour" };
    return { name, icon, color, description: String(b.description || "").trim().slice(0, 80), glow: b.glow ? 1 : 0 };
  }

  app.get("/api/admin/badges", admin, (_req, res) => res.json({ badges: badgeList(), icons: BADGE_ICONS }));

  app.post("/api/admin/badges", admin, (req, res) => {
    const b = cleanBadge(req.body || {});
    if (b.error) return res.status(400).json(b);
    const sort = db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 s FROM badges").get().s;
    const info = db.prepare("INSERT INTO badges (name, icon, color, description, glow, sort) VALUES (?, ?, ?, ?, ?, ?)").run(b.name, b.icon, b.color, b.description, b.glow, sort);
    log(req, "create badge", b.name);
    res.json({ badges: badgeList(), id: Number(info.lastInsertRowid) });
  });

  app.patch("/api/admin/badges/:id", admin, (req, res) => {
    const old = db.prepare("SELECT * FROM badges WHERE id = ?").get(Number(req.params.id));
    if (!old) return res.status(404).json({ error: "Badge not found" });
    const b = cleanBadge({ ...old, ...req.body });
    if (b.error) return res.status(400).json(b);
    db.prepare("UPDATE badges SET name = ?, icon = ?, color = ?, description = ?, glow = ? WHERE id = ?").run(b.name, b.icon, b.color, b.description, b.glow, old.id);
    if (req.body.move === "up" || req.body.move === "down") {
      const all = db.prepare("SELECT id FROM badges ORDER BY sort, id").all().map(r => r.id);
      const i = all.indexOf(old.id), j = req.body.move === "up" ? i - 1 : i + 1;
      if (j >= 0 && j < all.length) [all[i], all[j]] = [all[j], all[i]];
      all.forEach((id, k) => db.prepare("UPDATE badges SET sort = ? WHERE id = ?").run(k, id));
    }
    log(req, "edit badge", b.name);
    res.json({ badges: badgeList() });
  });

  app.delete("/api/admin/badges/:id", admin, (req, res) => {
    const b = db.prepare("SELECT * FROM badges WHERE id = ?").get(Number(req.params.id));
    if (!b) return res.status(404).json({ error: "Badge not found" });
    db.prepare("DELETE FROM badges WHERE id = ?").run(b.id);
    removeBadgeImage(b.image);
    for (const u of db.prepare("SELECT id, badges FROM users").all()) {
      const ids = userIds(u.badges);
      if (ids.includes(b.id)) db.prepare("UPDATE users SET badges = ? WHERE id = ?").run(JSON.stringify(ids.filter(i => i !== b.id)), u.id);
    }
    log(req, "delete badge", b.name);
    res.json({ badges: badgeList() });
  });

  // Upload / remove a badge's own icon picture
  const badgeUpload = multer({
    storage: multer.diskStorage({
      destination: (_r, _f, cb) => cb(null, BADGE_DIR),
      filename: (_r, file, cb) => cb(null, crypto.randomBytes(12).toString("hex") + path.extname(file.originalname).toLowerCase())
    }),
    limits: { fileSize: 256 * 1024, files: 1 },
    fileFilter: (_r, file, cb) => BADGE_EXTS.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(Object.assign(new Error("Badge icons can be PNG, SVG or ICO"), { status: 400 }))
  }).single("file");
  const uploadLimiter = auth.rateLimit({ windowMs: 10 * 60e3, max: 40, message: "Too many uploads. Wait a few minutes." });

  app.post("/api/admin/badges/:id/icon", admin, uploadLimiter, (req, res, next) => {
    const b = db.prepare("SELECT * FROM badges WHERE id = ?").get(Number(req.params.id));
    if (!b) return res.status(404).json({ error: "Badge not found" });
    badgeUpload(req, res, err => {
      if (err) return next(err);
      if (!req.file) return res.status(400).json({ error: "No file received" });
      const ext = path.extname(req.file.filename);
      const drop = msg => { fs.promises.unlink(req.file.path).catch(() => {}); res.status(400).json({ error: msg }); };
      if (!d.realTypeMatches(req.file.path, ext)) return drop("That file isn't really the type its name says.");
      if (ext === ".svg") {
        const clean = d.cleanSvg(fs.readFileSync(req.file.path, "utf8"));
        if (!clean) return drop("That SVG has scripts, links or styles in it. Use a plain SVG drawing, or a PNG.");
        fs.writeFileSync(req.file.path, clean);
      }
      removeBadgeImage(b.image);
      db.prepare("UPDATE badges SET image = ? WHERE id = ?").run(`/uploads/badges/${req.file.filename}`, b.id);
      log(req, "badge icon", b.name);
      res.json({ badges: badgeList() });
    });
  });

  app.delete("/api/admin/badges/:id/icon", admin, (req, res) => {
    const b = db.prepare("SELECT * FROM badges WHERE id = ?").get(Number(req.params.id));
    if (!b) return res.status(404).json({ error: "Badge not found" });
    removeBadgeImage(b.image);
    db.prepare("UPDATE badges SET image = '' WHERE id = ?").run(b.id);
    log(req, "badge icon removed", b.name);
    res.json({ badges: badgeList() });
  });

  // Who has a badge, and give / take it
  app.get("/api/admin/badges/:id/users", admin, (req, res) => {
    const rows = db.prepare("SELECT u.id, u.username FROM users u, json_each(u.badges) j WHERE j.value = ? ORDER BY u.username LIMIT 500").all(Number(req.params.id));
    res.json({ users: rows });
  });
  app.post("/api/admin/badges/:id/users", admin, (req, res) => {
    const b = db.prepare("SELECT * FROM badges WHERE id = ?").get(Number(req.params.id));
    const u = userRow((req.body || {}).userId);
    if (!b || !u) return res.status(404).json({ error: "Not found" });
    const ids = userIds(u.badges).filter(i => i !== b.id);
    if (req.body.give) ids.push(b.id);
    db.prepare("UPDATE users SET badges = ? WHERE id = ?").run(JSON.stringify(ids), u.id);
    log(req, req.body.give ? "give badge" : "take badge", u.username, b.name);
    res.json({ ok: true });
  });

  // ---------- Blocked usernames ----------
  const blockedList = () => db.prepare("SELECT name, created_at FROM blocked_usernames ORDER BY name").all();
  app.get("/api/admin/blocked", admin, (_req, res) => res.json({ blocked: blockedList() }));
  app.post("/api/admin/blocked", admin, (req, res) => {
    const name = String(req.body.name || "").trim().toLowerCase();
    if (!d.USERNAME_RE.test(name)) return res.status(400).json({ error: "2–20 characters: letters, numbers, _ and . only" });
    db.prepare("INSERT OR IGNORE INTO blocked_usernames (name, created_at) VALUES (?, ?)").run(name, Date.now());
    log(req, "block username", name);
    res.json({ blocked: blockedList() });
  });
  app.delete("/api/admin/blocked/:name", admin, (req, res) => {
    db.prepare("DELETE FROM blocked_usernames WHERE name = ?").run(String(req.params.name).toLowerCase());
    log(req, "unblock username", req.params.name);
    res.json({ blocked: blockedList() });
  });

  // ---------- Pending sign-ups ----------
  app.get("/api/admin/pending", admin, (_req, res) => {
    res.json({ pending: db.prepare("SELECT id, username, email, attempts, created_at, expires_at FROM pending_signups ORDER BY created_at DESC LIMIT 200").all() });
  });
  app.delete("/api/admin/pending/:id", admin, (req, res) => {
    const p = db.prepare("SELECT username FROM pending_signups WHERE id = ?").get(req.params.id);
    db.prepare("DELETE FROM pending_signups WHERE id = ?").run(req.params.id);
    if (p) log(req, "clear pending sign-up", p.username);
    res.json({ ok: true });
  });
  app.delete("/api/admin/pending", admin, (req, res) => {
    const n = db.prepare("DELETE FROM pending_signups").run().changes;
    log(req, "clear all pending sign-ups", "", `${n} removed`);
    res.json({ ok: true });
  });

  // ---------- Admin log ----------
  app.get("/api/admin/log", admin, (_req, res) => {
    res.json({ log: db.prepare("SELECT * FROM admin_log ORDER BY id DESC LIMIT 300").all() });
  });
};
