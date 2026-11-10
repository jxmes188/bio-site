# bio-site

A bio link platform. People sign up with an email code, claim a username, and build
their own page at `<your domain>/<username>`.

- `/`: sign up / sign in (with "forgot password")
- `/dashboard`: edit your page with an instant live preview
- `/<username>`: anyone's public page
- `/admin`: admin panel (admin accounts + admin code only)

Built with Node.js + Express. The database is SQLite (built into Node 22.13+).
The domain is never hardcoded: pages use whatever domain they're served on, and
emails use the `SITE_URL` setting.

## Run it locally

```powershell
npm install        # first time only
npm run dev        # http://localhost:3000 (restarts when server files change)
```

Without `RESEND_API_KEY`, emails (sign-up / reset codes) are printed in the terminal instead of sent.
Set `ADMIN_CODE` (and `ADMIN_USERNAMES`) locally to try the admin panel.

## Project layout

```
server/
  index.js        routes: pages, sign-up/in, profile, uploads, analytics, click tracking
  profile.js      page settings: defaults, upgrade of old saved pages (v1 → v2), validation
  features.js     premium switch (everything is free unless PREMIUM_ENABLED=true)
  auth.js         password hashing, sessions, rate limits
  db.js           SQLite tables + automatic upgrades
  mail.js         emails through Resend
  admin-panel.js  /admin and its API
  admin.js        command-line admin tools
public/
  index.html      homepage (sign up / sign in)
  dashboard.html  dashboard; js/dashboard.js (engine), js/dash-schema.js (every setting + templates)
  profile.html    the public page; js/loader.js, profile.js, background.js, cursor.js, discord.js
  admin.html      admin panel (styles: css/panel.css + css/admin.css)
```

### Adding a new page setting
1. Add its default to `defaultProfile()` and validation to `sanitizeProfile()` in `server/profile.js`.
2. Add one entry to `SETTINGS` in `public/js/dash-schema.js` (section, label, type, `adv: true` for Advanced).
   The dashboard control, search, "Reset section" and premium tag come from that entry automatically.
3. Use it on the page in `public/js/profile.js` / `background.js` / `css/profile.css`.

## Premium (later)

Everything is free now. To make a setting premium without rewriting anything:
1. Set `PREMIUM_ENABLED=true` on Railway.
2. List setting paths in `PREMIUM_PATHS` in `server/features.js`, or in the
   `PREMIUM_FEATURES` Railway setting, e.g. `effects.bg,cursor.image,theme.nameFont`.
3. A user's `plan` column set to `premium` unlocks them.
Free users keep the default value for premium settings; the dashboard shows a "PRO" tag.

## Railway settings

| Variable | Needed | What it does |
|---|---|---|
| `SITE_URL` | yes | e.g. `https://yourdomain.com`, used in emails |
| `RESEND_API_KEY` | yes | sends sign-up and password-reset codes |
| `MAIL_FROM` | yes | e.g. `yourdomain.com <no-reply@yourdomain.com>` |
| `ADMIN_CODE` | for admin | the code that unlocks `/admin` |
| `ADMIN_USERNAMES` | for admin | comma-separated admin accounts (default `lock`) |
| `DATA_DIR`, `UPLOAD_DIR` | yes on Railway | folders on the storage volume (`/data/db`, `/data/uploads`) |
| `VIEW_SECRET` | recommended | fixed random string so view counting stays stable across restarts |
| `PREMIUM_ENABLED`, `PREMIUM_FEATURES` | optional | see Premium above |
| `PORT` | set by Railway | |

## Admin commands

```powershell
npm run admin -- list
npm run admin -- badges lock "Owner,Staff"
npm run admin -- delete someuser
```

## Backups

Everything lives in `data/` (database) and `uploads/` (files). Copy both to back up.
