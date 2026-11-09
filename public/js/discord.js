/* =========================================================
   Discord live presence via Lanyard (https://github.com/Phineas/lanyard)
   Shows your Discord name, avatar, status, custom status and activity.
   Requires: your Discord user ID in config.js + you must be in the
   Lanyard Discord server (discord.gg/lanyard) so it can see you.
   ========================================================= */
(function () {
  const C = window.CONFIG;
  const D = C.discord || {};
  if (!D.enabled || !/^\d{15,21}$/.test(D.userId || "")) return;

  const $ = id => document.getElementById(id);
  const STATUS_TEXT = { online: "Online", idle: "Idle", dnd: "Do Not Disturb", offline: "Offline" };
  let activityStart = null;
  let activityEnd = null;

  // ---------- Helpers ----------
  function avatarUrl(user) {
    if (!user.avatar) {
      const idx = Number((BigInt(user.id) >> 22n) % 6n);
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    }
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }

  function activityImage(act) {
    const img = act.assets && act.assets.large_image;
    if (img) {
      if (img.startsWith("mp:external/")) return "https://media.discordapp.net/external/" + img.slice(12);
      if (img.startsWith("spotify:")) return "https://i.scdn.co/image/" + img.slice(8);
      return `https://cdn.discordapp.com/app-assets/${act.application_id}/${img}.png`;
    }
    if (act.application_id) return `https://dcdn.dstn.to/app-icons/${act.application_id}`;
    return null;
  }

  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = String(m).padStart(2, "0"), ss = String(sec).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // ---------- Render ----------
  function render(data) {
    const user = data.discord_user;
    const name = user.global_name || user.display_name || user.username;
    const status = data.discord_status || "offline";

    // Name
    if (D.useName) {
      $("username").textContent = name;
      $("username").dataset.text = name;
      $("username").title = "@" + user.username;
      C.tabTitle = name;
      if (!C.animatedTitle) document.title = name;
    }

    // Avatar
    if (D.useAvatar) $("avatar").src = avatarUrl(user);

    // Status dot
    $("status-dot").className = "status-dot " + status;
    $("status-dot").title = STATUS_TEXT[status] || status;

    // Discord social icon -> copy your real username
    const dc = C.socials.find(s => s.icon === "discord");
    if (dc) dc.url = user.username;

    // Custom status (activity type 4)
    const custom = data.activities.find(a => a.type === 4);
    const csEl = $("custom-status");
    if (custom && (custom.state || custom.emoji)) {
      let emoji = "";
      if (custom.emoji) {
        emoji = custom.emoji.id
          ? `<img class="cs-emoji" src="https://cdn.discordapp.com/emojis/${custom.emoji.id}.${custom.emoji.animated ? "gif" : "png"}" alt="">`
          : `<span>${escapeHtml(custom.emoji.name || "")}</span>`;
      }
      csEl.innerHTML = emoji + `<span>${escapeHtml(custom.state || "")}</span>`;
      csEl.hidden = false;
    } else csEl.hidden = true;

    // Presence card: Spotify > game/app > status
    const p = $("presence");
    p.hidden = false;
    $("presence-status").textContent = STATUS_TEXT[status];
    $("presence-status").className = "presence-status " + status;

    if (data.listening_to_spotify && data.spotify) {
      const sp = data.spotify;
      $("presence-label").textContent = "Listening to Spotify";
      $("presence-img").src = sp.album_art_url;
      $("presence-name").textContent = sp.song;
      $("presence-activity").textContent = "by " + sp.artist.replace(/;/g, ",");
      activityStart = sp.timestamps.start;
      activityEnd = sp.timestamps.end;
      p.classList.add("spotify");
      return;
    }
    p.classList.remove("spotify");

    const act = data.activities.find(a => a.type !== 4);
    if (act) {
      const verbs = { 0: "Playing", 1: "Streaming", 2: "Listening to", 3: "Watching", 5: "Competing in" };
      $("presence-label").textContent = (verbs[act.type] || "Playing") + " " + act.name;
      $("presence-img").src = activityImage(act) || avatarUrl(user);
      $("presence-name").textContent = act.details || act.name;
      $("presence-activity").textContent = act.state || "";
      activityStart = act.timestamps && act.timestamps.start || null;
      activityEnd = act.timestamps && act.timestamps.end || null;
    } else {
      $("presence-label").textContent = "Discord";
      $("presence-img").src = avatarUrl(user);
      $("presence-name").textContent = name;
      $("presence-activity").textContent = "@" + user.username;
      activityStart = activityEnd = null;
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Elapsed / remaining timer
  setInterval(() => {
    const el = $("presence-time");
    if (!activityStart) { el.textContent = ""; return; }
    const now = Date.now();
    el.textContent = activityEnd
      ? `${fmt(now - activityStart)} / ${fmt(activityEnd - activityStart)}`
      : `${fmt(now - activityStart)} elapsed`;
  }, 1000);

  // ---------- Connection (WebSocket with REST fallback) ----------
  function showError(msg) {
    $("presence").hidden = false;
    $("presence-label").textContent = "Discord";
    $("presence-name").textContent = "Couldn't load Discord status";
    $("presence-activity").textContent = msg;
  }

  function fetchOnce() {
    return fetch(`https://api.lanyard.rest/v1/users/${D.userId}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) render(j.data);
        else showError("Join discord.gg/lanyard so your status can be shown");
      })
      .catch(() => showError("Network error"));
  }

  let heartbeat;
  function connect() {
    let ws;
    try { ws = new WebSocket("wss://api.lanyard.rest/socket"); }
    catch (_) { setInterval(fetchOnce, 15000); return; }

    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.op === 1) {
        clearInterval(heartbeat);
        heartbeat = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ op: 3 })), msg.d.heartbeat_interval);
        ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: D.userId } }));
      } else if (msg.op === 0 && (msg.t === "INIT_STATE" || msg.t === "PRESENCE_UPDATE")) {
        if (msg.d && msg.d.discord_user) render(msg.d);
      }
    };
    ws.onclose = () => { clearInterval(heartbeat); setTimeout(connect, 5000); };
  }

  window.DISCORD_ACTIVE = true;
  fetchOnce();
  connect();
})();
