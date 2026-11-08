# bio-site

A bio link platform. People sign up, claim a username, and build their own page
at `yoursite.com/<username>`, with animated or uploaded backgrounds, their own music,
social links, link buttons and live Discord status.

- `/`: sign up / sign in (you claim your username on sign up)
- `/dashboard`: edit your page with a live preview
- `/<username>`: anyone's public page, e.g. `/lock`

Built with Node.js + Express. The database is SQLite, which is built into Node,
so nothing else needs installing.

## Run it locally (VS Code)

Needs **Node.js 22.13 or newer** (`node --version`).

```powershell
npm install        # first time only
npm run dev        # starts the server and restarts it when you edit server files
```

Open http://localhost:3000, sign up, and you're taken to your dashboard.
Your page is at http://localhost:3000/yourname.

Stop the server with `Ctrl + C` in the terminal.

## Project layout

```
server/
  index.js      routes: pages, sign up/in, profile API, uploads
  db.js         SQLite tables (users, sessions, files, view_log)
  auth.js       password hashing, login sessions, rate limiting
  profile.js    profile defaults + validation of everything users save
  admin.js      command-line admin tools (badges, delete user)
public/
  index.html    homepage: sign up / sign in
  dashboard.html, js/dashboard.js, css/dashboard.css
  profile.html  the public profile page template
  js/loader.js  loads a user's settings, then the page scripts
  js/profile.js, background.js, cursor.js, discord.js, icons.js
  css/app.css (homepage + dashboard), css/profile.css (profile pages)
data/           the database (created automatically, NOT in git)
uploads/        everything users upload (created automatically, NOT in git)
```

## What users can customise

Display name, bio lines, location, status, avatar, banner, background
(particles / warp stars / matrix / uploaded image / uploaded video / solid colour),
music (up to 10 songs, reorder, rename), social icons, link buttons, live Discord
presence (via [Lanyard](https://github.com/Phineas/lanyard)), accent colours,
username effect, card opacity and blur, cursor trail, 3D tilt and the click-to-enter screen.

Limits: avatar 5 MB, banner 8 MB, background 30 MB, songs 20 MB each,
150 MB total per user. SVG and HTML uploads are blocked for security.

## Admin commands

```powershell
npm run admin -- list                         # all users
npm run admin -- badges lock verified,crown   # give badges (none = clear)
npm run admin -- delete someuser              # delete a user and their files
```

Badges: `verified`, `crown` (Owner), `code` (Developer), `star` (Early Supporter),
`bolt`, `fire`, `heart`. Only admins can give badges; users can't set their own.

## Putting it online at your domain

GitHub Pages **can't** run this, because it only hosts static files and this needs a server.
You need a host that runs Node.js **and keeps files on disk** (for the database and uploads):

- **A VPS** (Hetzner, DigitalOcean, Vultr…): most control, about $4–6/month.
  Run it with `pm2` or a systemd service behind Caddy/Nginx for HTTPS.
- **Railway / Render / Fly.io**: easier. Attach a persistent volume and set
  `DATA_DIR` and `UPLOAD_DIR` to folders on that volume, or every redeploy wipes your users.

Then point your domain's DNS at the host.

### Environment variables

| Variable      | Default        | What it does                                        |
|---------------|----------------|-----------------------------------------------------|
| `PORT`        | `3000`         | Port to listen on                                   |
| `DATA_DIR`    | `./data`       | Where the SQLite database is stored                 |
| `UPLOAD_DIR`  | `./uploads`    | Where uploaded files are stored                     |
| `VIEW_SECRET` | random per run | Set a fixed random string so view counting stays stable across restarts |

## Backups

Everything lives in two folders: `data/` and `uploads/`. Copy both to back up the site.
