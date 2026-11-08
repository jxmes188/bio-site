# Bio Link Profile Page

A personal "link in bio" page with a click-to-enter splash, animated background,
glassy profile card that tilts in 3D, typewriter bio, badges, social icons,
Discord-style presence card, music player, view counter and cursor sparkles.

Plain HTML, CSS and JavaScript. No build step, no frameworks.

## Files

```
new 1/
├── index.html          page structure
├── css/style.css       all styling
├── js/config.js        ← EDIT THIS to personalise everything
├── js/icons.js         SVG icons (discord, github, youtube, ...)
├── js/background.js    particles / stars / matrix / video backgrounds
├── js/cursor.js        cursor trail effect
├── js/main.js          app logic (renders config, music, tilt, etc.)
└── assets/
    ├── avatar.svg      placeholder avatar (replace with your own)
    ├── favicon.svg
    └── music/          drop your .mp3 files here
```

## Run it in VS Code

1. Open the `new 1` folder in VS Code (File → Open Folder).
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click `index.html` → **Open with Live Server**.

You can also just double-click `index.html`, but music works more reliably through Live Server.

## Connect your Discord

Your name, avatar, status (online / idle / dnd / offline), custom status and
current game or Spotify song are pulled live from Discord using Lanyard.

1. Join the Lanyard Discord server: https://discord.gg/lanyard
   (this is required; it's how your status gets read. You can mute it.)
2. In Discord: Settings → Advanced → turn on **Developer Mode**.
3. Right-click your own name → **Copy User ID**.
4. Paste it into `js/config.js` → `discord.userId`.

Set `discord.enabled: false` to use the manual `username` / `avatar` / `presence` instead.

## Customise

Open `js/config.js` and change:

- `username`, `bio`, `location`, `status`
- `avatar`: put your picture in `assets/` and set e.g. `"assets/me.png"`
- `socials`: add, remove or reorder icons. `copy: true` copies the text instead of opening a link (good for a Discord username)
- `links`: big buttons under the socials (set to `[]` to hide)
- `music.tracks`: your mp3 files in `assets/music/`
- `theme.accent` / `theme.accent2`: glow and gradient colours
- `theme.usernameEffect`: `rainbow`, `glow`, `gradient` or `none`
- `background.type`: `particles`, `stars`, `matrix`, `video` or `none`
  (for video, put `background.mp4` in `assets/`)
- `cursor.trail`: `sparkle`, `dots` or `none`

Available icon names: discord, github, youtube, tiktok, instagram, x, spotify,
steam, twitch, link, heart, verified, crown, code, star, bolt, fire.

## Notes

- The view counter is stored in your browser only (localStorage). A real
  global counter needs a backend or a free counter API.
- To put it online for free, upload the folder to GitHub Pages, Netlify or Vercel.
