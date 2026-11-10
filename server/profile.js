/* =========================================================
   Profile settings: defaults, upgrade of old saved data, and
   validation of everything a user can save.

   Version 2 split "background" (what's behind the page: colour,
   gradient, image, video) from "effects" (animated layer on top:
   particles, stars, matrix, snow, rain). Old pages are upgraded by
   upgradeProfile() so they look exactly the same as before.
   ========================================================= */

const SOCIAL_ICONS = ["discord", "github", "youtube", "tiktok", "instagram", "x", "spotify", "steam", "twitch", "link"];
const LINK_ICONS = ["link", "heart", "star", "bolt", "fire", "code", "crown"];
const BADGE_ICONS = ["verified", "crown", "shield", "code", "star", "bolt", "fire", "heart", "gem", "hammer", "sparkles"];
const BG_TYPES = ["color", "gradient", "image", "video"];
const BG_EFFECTS = ["none", "particles", "stars", "matrix", "snow", "rain"];
const ENTRANCES = ["fade", "slide", "zoom", "none"];
const STATUSES = ["online", "idle", "dnd", "offline"];
const NAME_FX = ["rainbow", "gradient", "glow", "sparkle", "glitch", "none"];
const TRAILS = ["sparkle", "dots", "glow", "bubbles", "rainbow", "ghost", "fairy", "hearts", "snowflakes", "none"];
const FONTS = ["inter", "poppins", "outfit", "space-grotesk", "jetbrains-mono", "press-start", "playfair", "comfortaa"];
const AVATAR_SHAPES = ["circle", "rounded", "square"];
const ICON_COLORS = ["white", "accent", "accent2"];
const ICON_STYLES = ["plain", "circle", "square"];
const BUTTON_STYLES = ["glass", "solid", "outline"];
const LAYOUTS = ["card", "bare"];
const ALIGNS = ["center", "left"];
const COLOR_MODES = ["theme", "custom"];
const PLAYERS = ["full", "compact", "hidden"];

function defaultProfile(username) {
  return {
    v: 2,
    template: "classic",
    displayName: username,
    bio: ["welcome to my page"],
    location: "",
    status: "online",
    avatar: "",
    banner: "",
    socials: [],
    links: [],
    presence: { enabled: false, name: "", activity: "" },
    music: { enabled: true, volume: 0.4, autoplay: true, shuffle: false, loop: false, player: "full", tracks: [] },
    theme: {
      accent: "#a855f7", accent2: "#ec4899", textColor: "#f4f4f5",
      font: "inter", nameFont: "same", nameSize: 2, usernameEffect: "rainbow",
      layout: "card", align: "center",
      cardWidth: 520, cardOpacity: 0.35, blur: 14, radius: 22, glow: 0.18, cardBorder: 1, cardBorderOpacity: 0.1,
      tilt: true, tiltStrength: 10,
      avatarShape: "circle", avatarSize: 110,
      iconColor: "white", iconSize: 26, iconStyle: "plain",
      buttonStyle: "glass", buttonRadius: 12,
      typewriter: true, typeSpeed: 1,
      showViews: true, showBadges: true
    },
    background: { type: "color", color: "#06060a", color2: "#1e1b4b", angle: 135, url: "", dim: 0, blur: 0, vignette: true },
    effects: { bg: "particles", speed: 1, density: 1, color: "#a855f7", entrance: "fade" },
    cursor: { trail: "sparkle", size: 1, length: 1, colorMode: "theme", color: "#a855f7", touch: true, image: "" },
    splash: { enabled: true, text: "click to enter...", blur: 20 },
    animatedTitle: true,
    footer: "",
    discord: { enabled: false, userId: "", useName: true, useAvatar: true }
  };
}

/** Turn a version-1 profile into version 2 without changing how it looks. */
function upgradeProfile(p) {
  if (!p || typeof p !== "object" || p.v === 2) return p;
  const out = { ...p, v: 2, template: p.template || "classic" };
  const bg = p.background || {};
  const oldType = bg.type;
  out.effects = {
    bg: ["particles", "stars", "matrix"].includes(oldType) ? oldType : "none",
    speed: bg.speed, density: bg.density, color: bg.effectColor, entrance: "fade"
  };
  out.background = {
    type: oldType === "image" || oldType === "video" ? oldType : "color",
    color: bg.color, url: bg.url, dim: bg.dim, blur: bg.blur, vignette: true
  };
  return out;
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
 * Validate a profile coming from the dashboard (or the database).
 * ownFiles: Set of "/uploads/<userId>/<file>" URLs this user really owns, so
 * nobody can point their page at somebody else's uploads or an outside file.
 */
function sanitizeProfile(input, username, ownFiles) {
  const d = defaultProfile(username);
  const p = upgradeProfile(input && typeof input === "object" ? input : {}) || {};
  const own = v => (typeof v === "string" && ownFiles.has(v) ? v : "");

  const theme = p.theme || {}, bg = p.background || {}, fx = p.effects || {}, music = p.music || {};
  const presence = p.presence || {}, splash = p.splash || {}, discord = p.discord || {};
  const cursor = p.cursor || {};
  const T = d.theme;
  const accent = color(theme.accent, T.accent);

  return {
    v: 2,
    template: str(p.template, 30) || "classic",
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
      player: oneOf(music.player, PLAYERS, "full"),
      tracks: (Array.isArray(music.tracks) ? music.tracks : [])
        .map(t => ({ id: str(t && t.id, 40), title: str(t && t.title, 80) || "Untitled", src: own(t && t.src) }))
        .filter(t => t.src)
        .slice(0, 10)
    },

    theme: {
      accent,
      accent2: color(theme.accent2, T.accent2),
      textColor: color(theme.textColor, T.textColor),
      font: oneOf(theme.font, FONTS, T.font),
      nameFont: theme.nameFont === "same" ? "same" : oneOf(theme.nameFont, FONTS, "same"),
      nameSize: num(theme.nameSize, 1.2, 3.2, T.nameSize),
      usernameEffect: oneOf(theme.usernameEffect, NAME_FX, T.usernameEffect),
      layout: oneOf(theme.layout, LAYOUTS, T.layout),
      align: oneOf(theme.align, ALIGNS, T.align),
      cardWidth: num(theme.cardWidth, 360, 680, T.cardWidth),
      cardOpacity: num(theme.cardOpacity, 0, 1, T.cardOpacity),
      blur: num(theme.blur, 0, 40, T.blur),
      radius: num(theme.radius, 0, 36, T.radius),
      glow: num(theme.glow, 0, 0.6, T.glow),
      cardBorder: num(theme.cardBorder, 0, 4, T.cardBorder),
      cardBorderOpacity: num(theme.cardBorderOpacity, 0, 1, T.cardBorderOpacity),
      tilt: bool(theme.tilt, true),
      tiltStrength: num(theme.tiltStrength, 2, 30, T.tiltStrength),
      avatarShape: oneOf(theme.avatarShape, AVATAR_SHAPES, T.avatarShape),
      avatarSize: num(theme.avatarSize, 64, 160, T.avatarSize),
      iconColor: oneOf(theme.iconColor, ICON_COLORS, T.iconColor),
      iconSize: num(theme.iconSize, 18, 40, T.iconSize),
      iconStyle: oneOf(theme.iconStyle, ICON_STYLES, T.iconStyle),
      buttonStyle: oneOf(theme.buttonStyle, BUTTON_STYLES, T.buttonStyle),
      buttonRadius: num(theme.buttonRadius, 0, 30, T.buttonRadius),
      typewriter: bool(theme.typewriter, true),
      typeSpeed: num(theme.typeSpeed, 0.25, 3, T.typeSpeed),
      showViews: bool(theme.showViews, true),
      showBadges: bool(theme.showBadges, true)
    },

    background: {
      type: oneOf(bg.type, BG_TYPES, d.background.type),
      color: color(bg.color, d.background.color),
      color2: color(bg.color2, d.background.color2),
      angle: num(bg.angle, 0, 360, 135),
      url: own(bg.url),
      dim: num(bg.dim, 0, 0.9, 0),
      blur: num(bg.blur, 0, 20, 0),
      vignette: bool(bg.vignette, true)
    },

    effects: {
      bg: oneOf(fx.bg, BG_EFFECTS, d.effects.bg),
      speed: num(fx.speed, 0.1, 3, 1),
      density: num(fx.density, 0.25, 2, 1),
      color: color(fx.color, accent),
      entrance: oneOf(fx.entrance, ENTRANCES, "fade")
    },

    cursor: {
      trail: oneOf(cursor.trail, TRAILS, "sparkle"),
      size: num(cursor.size, 0.5, 3, 1),
      length: num(cursor.length, 0.3, 3, 1),
      colorMode: oneOf(cursor.colorMode, COLOR_MODES, "theme"),
      color: color(cursor.color, accent),
      touch: bool(cursor.touch, true),
      image: own(cursor.image)
    },
    splash: {
      enabled: bool(splash.enabled, true),
      text: str(splash.text, 60) || "click to enter...",
      blur: num(splash.blur, 0, 40, 20)
    },
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

module.exports = { defaultProfile, sanitizeProfile, upgradeProfile, BADGE_ICONS };
