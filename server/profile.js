/* Profile defaults + validation of everything a user can save */

const SOCIAL_ICONS = ["discord", "github", "youtube", "tiktok", "instagram", "x", "spotify", "steam", "twitch", "link"];
const LINK_ICONS = ["link", "heart", "star", "bolt", "fire", "code", "crown"];
const BADGE_ICONS = ["verified", "crown", "shield", "code", "star", "bolt", "fire", "heart", "gem", "hammer", "sparkles"];
const BG_TYPES = ["particles", "stars", "matrix", "image", "video", "none"];
const STATUSES = ["online", "idle", "dnd", "offline"];
const NAME_FX = ["rainbow", "glow", "gradient", "none"];
const TRAILS = ["sparkle", "dots", "glow", "bubbles", "none"];
const FONTS = ["inter", "poppins", "outfit", "space-grotesk", "jetbrains-mono", "press-start"];
const AVATAR_SHAPES = ["circle", "rounded", "square"];
const ICON_COLORS = ["white", "accent", "accent2"];
const COLOR_MODES = ["theme", "custom"];

function defaultProfile(username) {
  return {
    displayName: username,
    bio: ["welcome to my page"],
    location: "",
    status: "online",
    avatar: "",
    banner: "",
    socials: [],
    links: [],
    presence: { enabled: false, name: "", activity: "" },
    music: { enabled: true, volume: 0.4, autoplay: true, shuffle: false, loop: false, tracks: [] },
    theme: {
      accent: "#a855f7", accent2: "#ec4899", cardOpacity: 0.35, blur: 14, usernameEffect: "rainbow",
      tilt: true, tiltStrength: 10,
      cardWidth: 520, radius: 22, glow: 0.18,
      font: "inter", textColor: "#f4f4f5", nameSize: 2,
      avatarShape: "circle", avatarSize: 110,
      iconColor: "white", iconSize: 26,
      typewriter: true, typeSpeed: 1,
      showViews: true
    },
    background: { type: "particles", url: "", color: "#06060a", speed: 1, density: 1, effectColor: "#a855f7", dim: 0, blur: 0 },
    cursor: { trail: "sparkle", size: 1, length: 1, colorMode: "theme", color: "#a855f7", touch: true },
    splash: { enabled: true, text: "click to enter..." },
    animatedTitle: true,
    footer: "",
    discord: { enabled: false, userId: "", useName: true, useAvatar: true }
  };
}

// ---------- small validators ----------
const str = (v, max, def = "") => (typeof v === "string" ? v.trim().slice(0, max) : def);
const bool = (v, def) => (typeof v === "boolean" ? v : def);
const num = (v, min, max, def) => (typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const color = (v, def) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : def);

/** Only https:// links are kept. http:// is upgraded to https://, and a bare
 *  "example.com/me" gets https:// added. Anything else is dropped. */
function httpUrl(v) {
  if (typeof v !== "string" || !v.trim()) return "";
  let s = v.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try {
    const u = new URL(s);
    if (u.protocol === "http:") u.protocol = "https:";
    return u.protocol === "https:" && u.hostname.includes(".") ? u.href.slice(0, 500) : "";
  } catch { return ""; }
}

/** Discord icon must be a server invite. Accepts a full invite link
 *  (discord.gg/abc, discord.com/invite/abc) or just the code "abc". */
function discordInvite(v) {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (/^[A-Za-z0-9-]{2,32}$/.test(s)) return "https://discord.gg/" + s;
  const url = httpUrl(s);
  if (!url) return "";
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  if (host === "discord.gg" && /^\/[A-Za-z0-9-]{2,32}\/?$/.test(u.pathname)) return url;
  if (["discord.com", "discordapp.com"].includes(host) && /^\/invite\/[A-Za-z0-9-]{2,32}\/?$/.test(u.pathname)) return url;
  return "";
}

/**
 * Validate a profile coming from the dashboard.
 * ownFiles: Set of "/uploads/<userId>/<file>" URLs this user really owns, so
 * nobody can point their page at somebody else's uploads or an outside file.
 */
function sanitizeProfile(input, username, ownFiles) {
  const d = defaultProfile(username);
  const p = input && typeof input === "object" ? input : {};
  const own = v => (typeof v === "string" && ownFiles.has(v) ? v : "");

  const theme = p.theme || {}, bg = p.background || {}, music = p.music || {};
  const presence = p.presence || {}, splash = p.splash || {}, discord = p.discord || {};
  const cursor = p.cursor || {};
  const accent = color(theme.accent, d.theme.accent);

  return {
    displayName: str(p.displayName, 32) || username,
    bio: (Array.isArray(p.bio) ? p.bio : []).map(l => str(l, 120)).filter(Boolean).slice(0, 8),
    location: str(p.location, 40),
    status: oneOf(p.status, STATUSES, d.status),
    avatar: own(p.avatar),
    banner: own(p.banner),

    // Every social icon is a link that opens when clicked.
    // Old "copy username" entries are dropped (they held a username, not a link).
    socials: (Array.isArray(p.socials) ? p.socials : []).filter(s => s && !s.copy).slice(0, 12).map(s => {
      const icon = oneOf(s.icon, SOCIAL_ICONS, "link");
      const url = icon === "discord" ? discordInvite(s.url) : httpUrl(s.url);
      return { icon, url, label: str(s.label, 30) || icon };
    }).filter(s => s.url),

    links: (Array.isArray(p.links) ? p.links : []).slice(0, 10).map(l => ({
      title: str(l && l.title, 50),
      url: httpUrl(l && l.url),
      icon: oneOf(l && l.icon, LINK_ICONS, "link")
    })).filter(l => l.title && l.url),

    presence: {
      enabled: bool(presence.enabled, false),
      name: str(presence.name, 60),
      activity: str(presence.activity, 80)
    },

    music: {
      enabled: bool(music.enabled, true),
      volume: num(music.volume, 0, 1, 0.4),
      autoplay: bool(music.autoplay, true),
      shuffle: bool(music.shuffle, false),
      loop: bool(music.loop, false),
      tracks: (Array.isArray(music.tracks) ? music.tracks : [])
        .map(t => ({ id: str(t && t.id, 40), title: str(t && t.title, 80) || "Untitled", src: own(t && t.src) }))
        .filter(t => t.src)
        .slice(0, 10)
    },

    theme: {
      accent,
      accent2: color(theme.accent2, d.theme.accent2),
      cardOpacity: num(theme.cardOpacity, 0, 1, d.theme.cardOpacity),
      blur: num(theme.blur, 0, 40, d.theme.blur),
      usernameEffect: oneOf(theme.usernameEffect, NAME_FX, d.theme.usernameEffect),
      tilt: bool(theme.tilt, true),
      tiltStrength: num(theme.tiltStrength, 2, 30, d.theme.tiltStrength),
      cardWidth: num(theme.cardWidth, 360, 680, d.theme.cardWidth),
      radius: num(theme.radius, 0, 36, d.theme.radius),
      glow: num(theme.glow, 0, 0.6, d.theme.glow),
      font: oneOf(theme.font, FONTS, d.theme.font),
      textColor: color(theme.textColor, d.theme.textColor),
      nameSize: num(theme.nameSize, 1.2, 3.2, d.theme.nameSize),
      avatarShape: oneOf(theme.avatarShape, AVATAR_SHAPES, d.theme.avatarShape),
      avatarSize: num(theme.avatarSize, 64, 160, d.theme.avatarSize),
      iconColor: oneOf(theme.iconColor, ICON_COLORS, d.theme.iconColor),
      iconSize: num(theme.iconSize, 18, 40, d.theme.iconSize),
      typewriter: bool(theme.typewriter, true),
      typeSpeed: num(theme.typeSpeed, 0.25, 3, d.theme.typeSpeed),
      showViews: bool(theme.showViews, true)
    },

    background: {
      type: oneOf(bg.type, BG_TYPES, d.background.type),
      url: own(bg.url),
      color: color(bg.color, d.background.color),
      speed: num(bg.speed, 0.1, 3, 1),
      density: num(bg.density, 0.25, 2, 1),
      effectColor: color(bg.effectColor, accent),
      dim: num(bg.dim, 0, 0.9, 0),
      blur: num(bg.blur, 0, 20, 0)
    },

    cursor: {
      trail: oneOf(cursor.trail, TRAILS, "sparkle"),
      size: num(cursor.size, 0.5, 3, 1),
      length: num(cursor.length, 0.3, 3, 1),
      colorMode: oneOf(cursor.colorMode, COLOR_MODES, "theme"),
      color: color(cursor.color, accent),
      touch: bool(cursor.touch, true)
    },
    splash: { enabled: bool(splash.enabled, true), text: str(splash.text, 60) || "click to enter..." },
    animatedTitle: bool(p.animatedTitle, true),
    footer: str(p.footer, 80),

    discord: {
      enabled: bool(discord.enabled, false),
      userId: /^\d{15,21}$/.test(str(discord.userId, 25)) ? str(discord.userId, 25) : "",
      useName: bool(discord.useName, true),
      useAvatar: bool(discord.useAvatar, true)
    }
  };
}

module.exports = { defaultProfile, sanitizeProfile, BADGE_ICONS };
