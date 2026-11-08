/* Profile defaults + validation of everything a user can save */

const SOCIAL_ICONS = ["discord", "github", "youtube", "tiktok", "instagram", "x", "spotify", "steam", "twitch", "link"];
const LINK_ICONS = ["link", "heart", "star", "bolt", "fire", "code", "crown"];
const BADGE_ICONS = ["verified", "crown", "code", "star", "bolt", "fire", "heart"];
const BG_TYPES = ["particles", "stars", "matrix", "image", "video", "none"];
const STATUSES = ["online", "idle", "dnd", "offline"];
const NAME_FX = ["rainbow", "glow", "gradient", "none"];
const TRAILS = ["sparkle", "dots", "none"];

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
    music: { enabled: true, volume: 0.4, autoplay: true, tracks: [] },
    theme: { accent: "#a855f7", accent2: "#ec4899", cardOpacity: 0.35, blur: 14, usernameEffect: "rainbow", tilt: true },
    background: { type: "particles", url: "", color: "#06060a" },
    cursor: { trail: "sparkle" },
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

function httpUrl(v) {
  if (typeof v !== "string") return "";
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href.slice(0, 500) : "";
  } catch { return ""; }
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

  return {
    displayName: str(p.displayName, 32) || username,
    bio: (Array.isArray(p.bio) ? p.bio : []).map(l => str(l, 120)).filter(Boolean).slice(0, 8),
    location: str(p.location, 40),
    status: oneOf(p.status, STATUSES, d.status),
    avatar: own(p.avatar),
    banner: own(p.banner),

    socials: (Array.isArray(p.socials) ? p.socials : []).slice(0, 12).map(s => {
      const icon = oneOf(s && s.icon, SOCIAL_ICONS, "link");
      const copy = !!(s && s.copy);
      const url = copy ? str(s.url, 100) : httpUrl(s && s.url);
      return { icon, url, copy, label: str(s && s.label, 30) || icon };
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
      tracks: (Array.isArray(music.tracks) ? music.tracks : [])
        .map(t => ({ id: str(t && t.id, 40), title: str(t && t.title, 80) || "Untitled", src: own(t && t.src) }))
        .filter(t => t.src)
        .slice(0, 10)
    },

    theme: {
      accent: color(theme.accent, d.theme.accent),
      accent2: color(theme.accent2, d.theme.accent2),
      cardOpacity: num(theme.cardOpacity, 0, 1, d.theme.cardOpacity),
      blur: num(theme.blur, 0, 40, d.theme.blur),
      usernameEffect: oneOf(theme.usernameEffect, NAME_FX, d.theme.usernameEffect),
      tilt: bool(theme.tilt, true)
    },

    background: {
      type: oneOf(bg.type, BG_TYPES, d.background.type),
      url: own(bg.url),
      color: color(bg.color, d.background.color)
    },

    cursor: { trail: oneOf(p.cursor && p.cursor.trail, TRAILS, "sparkle") },
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
