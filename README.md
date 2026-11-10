# bio-site

A bio link platform. People sign up, claim a username, and build their own page at
`<your domain>/<username>`.

- `/`: homepage
- `/login`, `/signup`: email + password, emailed code / one-click link, Google, Discord, forgot password
- `/dashboard`: edit your page with an instant live preview
- `/<username>`: anyone's public page
- `/admin`: admin panel (admin accounts + admin code only)

Built with Node.js + Express. The database is SQLite (built into Node 22.13+; argon2 password
hashing needs Node 24.7+). The domain is never hardcoded: pages use whatever domain they're
served on, and emails and Google/Discord sign-in use the `SITE_URL` setting.

## Run it locally

```powershell
npm install        # first time only
npm run dev        # http://localhost:3000 (restarts when server files change)
```

Without `RESEND_API_KEY`, emails (sign-up, reset and sign-in codes) are printed in the terminal instead of sent.
Set `ADMIN_CODE` (and `ADMIN_USERNAMES`) locally to try the admin panel.

## Project layout

```
server/
  index.js        routes: pages, sign-up/in, emailed sign-in, profile, uploads, analytics, click tracking
  oauth.js        Sign in with Google / Discord (+ linking them to an account)
  profile.js      page settings: defaults, upgrade of old saved pages, validation
  files.js        upload checks: real file type, SVG safety check
  features.js     premium switch (everything is free unless PREMIUM_ENABLED=true)
  auth.js         password hashing (argon2id), sessions, rate limits
  db.js           SQLite tables + automatic upgrades
  mail.js         emails through Resend
  admin-panel.js  /admin and its API (users, badges, blocked names, pending sign-ups, log)
  admin.js        command-line admin tools
public/
  index.html      homepage (js/home.js, css/home.css)
  login.html      log in / sign up (js/login.js, css/login.css)
  dashboard.html  dashboard; js/dashboard.js (engine), js/dash-schema.js (every setting + templates)
  profile.html    the public page; js/loader.js, profile.js, background.js, cursor.js, trails.js, discord.js
  admin.html      admin panel (css/admin.css)
  css/app.css     the site's design system (monochrome)
  js/ui-icons.js  the site's icon set;  js/icons.js  icons used on profile pages and badges
  js/trails.js    cursor trail engine (profile pages + the homepage demo)
  cursors/        preset cursors users can pick
```

### Adding a new page setting
1. Add its default to `defaultProfile()` and validation to `sanitizeProfile()` in `server/profile.js`.
2. Add one entry to `SETTINGS` in `public/js/dash-schema.js` (section, label, type, `adv: true` for Advanced).
   The dashboard control, search, "Reset section" and premium tag come from that entry automatically.
3. Use it on the page in `public/js/profile.js` / `background.js` / `css/profile.css`.

## Railway settings

| Variable | Needed | What it does |
|---|---|---|
| `SITE_URL` | yes | e.g. `https://yourdomain.com` (no slash at the end). Used in emails and for Google/Discord sign-in |
| `RESEND_API_KEY` | yes | sends sign-up, password-reset and sign-in emails |
| `MAIL_FROM` | yes | e.g. `yourdomain.com <no-reply@yourdomain.com>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | see below |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | for Discord sign-in | see below |
| `ADMIN_CODE` | for admin | the code that unlocks `/admin` |
| `ADMIN_USERNAMES` | for admin | comma-separated admin accounts (default `lock`) |
| `DATA_DIR`, `UPLOAD_DIR` | yes on Railway | folders on the storage volume (`/data/db`, `/data/uploads`) |
| `VIEW_SECRET` | recommended | fixed random string so view counting and codes stay stable across restarts |
| `PREMIUM_ENABLED`, `PREMIUM_FEATURES` | optional | see Premium below |
| `PORT` | set by Railway | |

Google and Discord buttons show "not set up" until both of their variables exist.
After changing variables, Railway redeploys by itself.

### Google sign-in (Google Cloud Console)
1. Go to https://console.cloud.google.com and create a project (top bar → project picker → **New project**).
2. **APIs & Services → OAuth consent screen** (called **Google Auth Platform** in newer consoles):
   choose **External**, fill in the app name, support email and developer email, save.
   Under **Audience**, press **Publish app** so anyone can sign in (only the basic `email`/`profile`
   scopes are used, so Google doesn't need to review it).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Authorised redirect URIs: `https://yourdomain.com/auth/google/callback`
     (add `http://localhost:3000/auth/google/callback` too if you want to test locally)
4. Copy the **Client ID** and **Client secret** into Railway as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Discord sign-in (Discord Developer Portal)
1. Go to https://discord.com/developers/applications → **New Application**, give it your site's name.
2. Open **OAuth2** in the left menu.
3. Copy the **Client ID**. Press **Reset Secret** and copy the **Client Secret** (it's only shown once).
4. Under **Redirects** press **Add Redirect**: `https://yourdomain.com/auth/discord/callback`
   (and `http://localhost:3000/auth/discord/callback` for local testing). Save changes.
5. Put them in Railway as `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

How accounts match up: if someone signs in with Google/Discord and an account already uses that
(verified) email, it's linked to that account. Otherwise they pick a username first.
People can also connect or disconnect Google/Discord from **Dashboard → Account**.

## Premium (later)

Everything is free now. To make a setting premium without rewriting anything:
1. Set `PREMIUM_ENABLED=true` on Railway.
2. List setting paths in `PREMIUM_PATHS` in `server/features.js`, or in the
   `PREMIUM_FEATURES` Railway setting, e.g. `effects.bg,cursor.style,theme.nameFont`.
3. A user's `plan` column set to `premium` unlocks them.
Free users keep the default value for premium settings; the dashboard shows a "PRO" tag.

## Admin commands

```powershell
npm run admin -- list
npm run admin -- badges lock "Owner,Staff"
npm run admin -- delete someuser
```

## Backups

Everything lives in `data/` (database) and `uploads/` (files, including badge icons in `uploads/badges/`). Copy both to back up.
