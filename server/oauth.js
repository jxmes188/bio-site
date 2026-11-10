/* =========================================================
   Sign in with Google / Discord

   Railway variables (a provider stays switched off until both are set):
     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
     DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
   Redirect URLs to register with each provider:
     <SITE_URL>/auth/google/callback
     <SITE_URL>/auth/discord/callback

   Flow
     /auth/<provider>              → provider's consent screen
     /auth/<provider>/callback     → back here with a one-time code
       - already linked            → signed in
       - same verified email       → linked to that account, signed in
       - new person                → /login?claim=<id> to pick a username
     /auth/<provider>?link=1       → (signed in) link it to your account
   ========================================================= */
const crypto = require("crypto");

const STATE_COOKIE = "oas";
const STATE_MINUTES = 10;

const PROVIDERS = {
  google: {
    name: "Google",
    column: "google_id",
    id: () => process.env.GOOGLE_CLIENT_ID,
    secret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    extra: { prompt: "select_account" },
    async profile(accessToken) {
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) throw new Error("Google profile request failed: " + r.status);
      const u = await r.json();
      return { id: String(u.sub), email: String(u.email || "").toLowerCase(), emailVerified: u.email_verified === true, name: u.given_name || u.name || "" };
    }
  },
  discord: {
    name: "Discord",
    column: "discord_id",
    id: () => process.env.DISCORD_CLIENT_ID,
    secret: () => process.env.DISCORD_CLIENT_SECRET,
    authorize: "https://discord.com/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
    scope: "identify email",
    extra: {},
    async profile(accessToken) {
      const r = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) throw new Error("Discord profile request failed: " + r.status);
      const u = await r.json();
      return { id: String(u.id), email: String(u.email || "").toLowerCase(), emailVerified: u.verified === true, name: u.username || "" };
    }
  }
};

const enabled = key => !!(PROVIDERS[key].id() && PROVIDERS[key].secret());
const providerStatus = () => Object.fromEntries(Object.keys(PROVIDERS).map(k => [k, enabled(k)]));

module.exports = function mountOAuth(app, d) {
  const { db, auth, SITE_URL, VIEW_SECRET } = d;

  const baseUrl = req => SITE_URL || `${req.protocol}://${req.get("host")}`;
  const redirectUri = (req, key) => `${baseUrl(req)}/auth/${key}/callback`;
  const fail = (res, code) => res.redirect("/login?error=" + encodeURIComponent(code));
  const startLimiter = auth.rateLimit({ windowMs: 15 * 60e3, max: 30 });

  // ---------- Start ----------
  app.get("/auth/:provider", startLimiter, (req, res, next) => {
    const key = req.params.provider;
    const P = PROVIDERS[key];
    if (!P) return next();
    if (!enabled(key)) return fail(res, "not_configured_" + key);
    const mode = req.query.link === "1" && req.user ? "link" : "login";
    const state = crypto.randomBytes(24).toString("hex");
    res.cookie(STATE_COOKIE, `${key}.${state}.${mode}`, {
      httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: STATE_MINUTES * 60e3, path: "/auth"
    });
    const q = new URLSearchParams({
      client_id: P.id(), redirect_uri: redirectUri(req, key), response_type: "code", scope: P.scope, state, ...P.extra
    });
    res.redirect(`${P.authorize}?${q}`);
  });

  // ---------- Callback ----------
  app.get("/auth/:provider/callback", async (req, res, next) => {
    const key = req.params.provider;
    const P = PROVIDERS[key];
    if (!P) return next();
    const cookie = auth.readCookie(req, STATE_COOKIE) || "";
    res.clearCookie(STATE_COOKIE, { path: "/auth" });
    const [ck, cstate, mode] = cookie.split(".");
    const state = String(req.query.state || "");
    const sameState = ck === key && cstate && state.length === cstate.length &&
      crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cstate));
    if (req.query.error) return fail(res, "cancelled");
    if (!sameState || !req.query.code) return fail(res, "expired");
    if (!enabled(key)) return fail(res, "not_configured_" + key);

    let person;
    try {
      const tr = await fetch(P.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          client_id: P.id(), client_secret: P.secret(), grant_type: "authorization_code",
          code: String(req.query.code), redirect_uri: redirectUri(req, key)
        })
      });
      if (!tr.ok) throw new Error(`${P.name} token request failed: ${tr.status} ${await tr.text()}`);
      const tok = await tr.json();
      person = await P.profile(tok.access_token);
    } catch (err) {
      console.error("[oauth]", err.message);
      return fail(res, "provider_error");
    }

    const byProvider = db.prepare(`SELECT * FROM users WHERE ${P.column} = ?`).get(person.id);

    // Linking to the signed-in account (from the dashboard)
    if (mode === "link") {
      if (!req.user) return fail(res, "expired");
      if (byProvider && byProvider.id !== req.user.id) return res.redirect(`/dashboard?link_error=${key}_taken#account`);
      db.prepare(`UPDATE users SET ${P.column} = ? WHERE id = ?`).run(person.id, req.user.id);
      return res.redirect(`/dashboard?linked=${key}#account`);
    }

    let user = byProvider;
    // Same email as an existing account: link it (only if the provider has checked the email)
    if (!user && person.email && person.emailVerified) {
      user = db.prepare("SELECT * FROM users WHERE email = ? AND email_verified = 1").get(person.email);
      if (user) db.prepare(`UPDATE users SET ${P.column} = ? WHERE id = ?`).run(person.id, user.id);
    }
    if (user) {
      if (!user.email_verified) return fail(res, "expired");
      if (user.banned) return fail(res, "banned");
      auth.createSession(res, user.id, req.secure);
      return res.redirect("/dashboard");
    }

    // New person: they need a verified email, then they pick a username
    if (!person.email || !person.emailVerified) return fail(res, "email_unverified_" + key);
    const id = crypto.randomBytes(18).toString("hex");
    db.prepare("DELETE FROM oauth_pending WHERE provider = ? AND provider_id = ?").run(key, person.id);
    db.prepare("INSERT INTO oauth_pending (id, provider, provider_id, email, name, ip_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, key, person.id, person.email, String(person.name).slice(0, 40), auth.sha256(`${req.ip}|${VIEW_SECRET}`), Date.now() + 30 * 60e3);
    res.redirect("/login?claim=" + id);
  });

  // ---------- Pick a username (first sign-in with Google / Discord) ----------
  const pendingRow = id => db.prepare("SELECT * FROM oauth_pending WHERE id = ? AND expires_at > ?").get(String(id || ""), Date.now());

  app.get("/api/oauth/pending/:id", (req, res) => {
    const p = pendingRow(req.params.id);
    if (!p) return res.status(404).json({ error: "This sign-in has expired. Try again." });
    const suggestion = String(p.name || p.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_.]/g, "").replace(/^\.+|\.+$/g, "").slice(0, 20);
    res.json({ provider: p.provider, providerName: PROVIDERS[p.provider].name, email: p.email, suggestion });
  });

  const claimLimiter = auth.rateLimit({ windowMs: 15 * 60e3, max: 20 });
  app.post("/api/oauth/claim", claimLimiter, (req, res) => {
    const p = pendingRow(req.body.id);
    if (!p) return res.status(400).json({ error: "This sign-in has expired. Try again.", restart: true });
    const P = PROVIDERS[p.provider];
    const username = String(req.body.username || "").trim().toLowerCase();
    const problem = d.usernameProblem(username);
    if (problem) return res.status(400).json({ error: problem, field: "username" });

    // Someone may have made an account with this email in the meantime: link instead
    const existing = db.prepare("SELECT * FROM users WHERE email = ? AND email_verified = 1").get(p.email);
    if (existing) {
      if (existing.banned) return res.status(403).json({ error: "This account has been suspended." });
      db.prepare(`UPDATE users SET ${P.column} = ? WHERE id = ?`).run(p.provider_id, existing.id);
      db.prepare("DELETE FROM oauth_pending WHERE id = ?").run(p.id);
      auth.createSession(res, existing.id, req.secure);
      return res.json({ ok: true, username: existing.username });
    }
    if (db.prepare(`SELECT 1 FROM users WHERE ${P.column} = ?`).get(p.provider_id))
      return res.status(400).json({ error: "That account is already linked. Sign in instead.", restart: true });

    const made = db.prepare("SELECT COUNT(*) n FROM signup_log WHERE ip_hash = ? AND created_at > ?").get(p.ip_hash, Date.now() - 864e5).n;
    if (made >= d.SIGNUPS_PER_IP_PER_DAY)
      return res.status(429).json({ error: "Too many accounts created from this connection today. Try again tomorrow." });

    // Clear any leftover unconfirmed account holding this name or email
    for (const old of db.prepare("SELECT id FROM users WHERE email_verified = 0 AND (username = ? OR email = ?)").all(username, p.email)) d.deleteUserCompletely(old);

    const info = db.prepare(`INSERT INTO users (username, email, pass_hash, profile, created_at, email_verified, ${P.column}) VALUES (?, ?, '', ?, ?, 1, ?)`)
      .run(username, p.email, JSON.stringify(d.defaultProfile(username)), Date.now(), p.provider_id);
    db.prepare("DELETE FROM oauth_pending WHERE id = ?").run(p.id);
    db.prepare("DELETE FROM pending_signups WHERE username = ? OR email = ?").run(username, p.email);
    db.prepare("INSERT INTO signup_log (ip_hash, created_at) VALUES (?, ?)").run(p.ip_hash, Date.now());
    auth.createSession(res, Number(info.lastInsertRowid), req.secure);
    res.json({ ok: true, username });
  });

  // ---------- Unlink (dashboard → Account) ----------
  app.post("/api/me/unlink", auth.requireUser, (req, res) => {
    const key = String((req.body || {}).provider || "");
    const P = PROVIDERS[key];
    if (!P) return res.status(400).json({ error: "Unknown provider" });
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const others = Object.entries(PROVIDERS).filter(([k]) => k !== key && u[PROVIDERS[k].column]).length;
    if (!u.pass_hash && !others) return res.status(400).json({ error: `Set a password first, or you won't be able to sign in without ${P.name}.` });
    db.prepare(`UPDATE users SET ${P.column} = NULL WHERE id = ?`).run(u.id);
    res.json({ ok: true });
  });
};

module.exports.providerStatus = providerStatus;
