/* =========================================================
   Dashboard settings list. The dashboard is built from this:
   each setting appears once here and gets its control, search
   entry, "reset section" and premium tag automatically.

   Fields:
     path     where it's stored in the profile (e.g. "theme.accent")
     label    what the user sees
     type     text | textarea | lines | color | range | select | segmented | toggle | block
     adv      true = only shown when "Advanced" is on
     content  true = the user's own words; "Reset section" leaves it alone
     show     (profile) => boolean, hide when it doesn't apply
     block    name of a custom panel (uploads, lists, analytics...) for type "block"
   ========================================================= */
(function () {
  const FONT_OPTS = [
    ["inter", "Inter"], ["poppins", "Poppins"], ["outfit", "Outfit"], ["space-grotesk", "Space Grotesk"],
    ["playfair", "Playfair"], ["comfortaa", "Comfortaa"], ["jetbrains-mono", "JetBrains Mono"], ["press-start", "Pixel"]
  ];
  const isMedia = p => p.background.type === "image" || p.background.type === "video";
  const isCard = p => p.theme.layout === "card";
  const trailOn = p => p.cursor.trailOn;

  // icon = a name from ui-icons.js
  const SECTIONS = [
    { id: "profile", label: "Profile", icon: "user" },
    { id: "appearance", label: "Appearance", icon: "palette" },
    { id: "effects", label: "Effects", icon: "sparkles" },
    { id: "links", label: "Links", icon: "link" },
    { id: "audio", label: "Audio", icon: "music" },
    { id: "discord", label: "Discord & Badges", short: "Discord", icon: "chat" },
    { id: "analytics", label: "Analytics", icon: "chart", noAdvanced: true },
    { id: "account", label: "Account", icon: "settings", noAdvanced: true }
  ];

  // Settings, grouped by section and sub-heading ("group")
  const S = [
    // ---------- Profile ----------
    { section: "profile", group: "Picture", type: "block", block: "avatar", label: "Avatar & banner", keywords: "photo picture image pfp" },
    { section: "profile", group: "About you", path: "displayName", label: "Display name", type: "text", max: 32, content: true },
    { section: "profile", group: "About you", path: "bio", label: "Bio", type: "lines", hint: "One line per message. Each line types out in turn.", content: true },
    { section: "profile", group: "About you", path: "location", label: "Location", type: "text", max: 40, placeholder: "optional", content: true },
    { section: "profile", group: "Text effects", path: "theme.usernameEffect", label: "Name effect", type: "segmented",
      options: [["rainbow", "Rainbow"], ["gradient", "Gradient"], ["shimmer", "Shimmer"], ["glow", "Glow"], ["sparkle", "Sparkle"], ["glitch", "Glitch"], ["none", "None"]] },
    { section: "profile", group: "Text effects", path: "theme.typewriter", label: "Typewriter bio", type: "toggle" },
    { section: "profile", group: "Text effects", path: "theme.typeSpeed", label: "Typing speed", type: "range", min: 0.25, max: 3, step: 0.25, fmt: "x", adv: true, show: p => p.theme.typewriter },
    { section: "profile", group: "Text effects", path: "theme.bioEffect", label: "Bio effect", type: "segmented", adv: true,
      options: [["none", "None"], ["glow", "Glow"], ["shimmer", "Shimmer"]] },
    { section: "profile", group: "Text effects", path: "theme.nameSize", label: "Name size", type: "range", min: 1.2, max: 3.2, step: 0.1, fmt: "x", adv: true },
    { section: "profile", group: "More", path: "status", label: "Status dot", type: "select", adv: true, hint: "Replaced by your live Discord status when connected.",
      options: [["online", "Online"], ["idle", "Idle"], ["dnd", "Do Not Disturb"], ["offline", "Offline"]] },
    { section: "profile", group: "More", path: "footer", label: "Footer text", type: "text", max: 80, placeholder: "optional", adv: true, content: true },
    { section: "profile", group: "More", path: "animatedTitle", label: "Scrolling browser-tab title", type: "toggle", adv: true },

    // ---------- Appearance ----------
    { section: "appearance", group: "Templates", type: "block", block: "templates", label: "Templates", keywords: "theme preset style classic" },
    { section: "appearance", group: "Background", path: "background.type", label: "Background", type: "segmented",
      options: [["color", "Colour"], ["gradient", "Gradient"], ["image", "Image / GIF"], ["video", "Video"]] },
    { section: "appearance", group: "Background", path: "background.color", label: "Colour", type: "color", show: p => !isMedia(p) },
    { section: "appearance", group: "Background", path: "background.color2", label: "Second colour", type: "color", show: p => p.background.type === "gradient" },
    { section: "appearance", group: "Background", path: "background.angle", label: "Gradient angle", type: "range", min: 0, max: 360, step: 5, fmt: "deg", adv: true, show: p => p.background.type === "gradient" },
    { section: "appearance", group: "Background", type: "block", block: "bgUpload", label: "Background file", show: isMedia, keywords: "upload image gif video wallpaper" },
    { section: "appearance", group: "Background", path: "background.dim", label: "Darken", type: "range", min: 0, max: 0.9, step: 0.05, fmt: "%" },
    { section: "appearance", group: "Background", path: "background.blur", label: "Blur", type: "range", min: 0, max: 20, step: 1, fmt: "px", show: isMedia },
    { section: "appearance", group: "Background", path: "background.vignette", label: "Dark edges (vignette)", type: "toggle", adv: true },
    { section: "appearance", group: "Colours & text", path: "theme.accent", label: "Accent colour", type: "color" },
    { section: "appearance", group: "Colours & text", path: "theme.accent2", label: "Second colour", type: "color" },
    { section: "appearance", group: "Colours & text", path: "theme.textColor", label: "Text colour", type: "color", adv: true },
    { section: "appearance", group: "Colours & text", path: "theme.font", label: "Font", type: "select", options: FONT_OPTS },
    { section: "appearance", group: "Colours & text", path: "theme.nameFont", label: "Name font", type: "select", adv: true, options: [["same", "Same as text"], ...FONT_OPTS] },
    { section: "appearance", group: "Card", path: "theme.layout", label: "Layout", type: "segmented", options: [["card", "Card"], ["bare", "No card"]] },
    { section: "appearance", group: "Card", path: "theme.cardWidth", label: "Width", type: "range", min: 360, max: 680, step: 10, fmt: "px" },
    { section: "appearance", group: "Card", path: "theme.cardOpacity", label: "Card opacity", type: "range", min: 0, max: 1, step: 0.05, fmt: "%", show: isCard },
    { section: "appearance", group: "Card", path: "theme.radius", label: "Corner roundness", type: "range", min: 0, max: 36, step: 1, fmt: "px", show: isCard },
    { section: "appearance", group: "Card", path: "theme.blur", label: "Card blur", type: "range", min: 0, max: 40, step: 1, fmt: "px", show: isCard },
    { section: "appearance", group: "Card", path: "theme.glow", label: "Card glow", type: "range", min: 0, max: 0.6, step: 0.02, fmt: "%", show: isCard },
    { section: "appearance", group: "Card", path: "theme.cardColor", label: "Card colour", type: "color", adv: true, show: isCard },
    { section: "appearance", group: "Card", path: "theme.cardPadding", label: "Inner spacing", type: "range", min: 12, max: 48, step: 1, fmt: "px", adv: true },
    { section: "appearance", group: "Card", path: "theme.cardBorder", label: "Border width", type: "range", min: 0, max: 4, step: 1, fmt: "px", adv: true, show: isCard },
    { section: "appearance", group: "Card", path: "theme.borderColor", label: "Border colour", type: "color", adv: true, show: p => isCard(p) && p.theme.cardBorder > 0 },
    { section: "appearance", group: "Card", path: "theme.cardBorderOpacity", label: "Border brightness", type: "range", min: 0, max: 1, step: 0.05, fmt: "%", adv: true, show: p => isCard(p) && p.theme.cardBorder > 0 },
    { section: "appearance", group: "Layout", path: "theme.align", label: "Alignment", type: "segmented", options: [["center", "Centre"], ["left", "Left"]] },
    { section: "appearance", group: "Layout", path: "theme.position", label: "Position on the page", type: "segmented", adv: true, options: [["center", "Middle"], ["top", "Top"]] },
    { section: "appearance", group: "Layout", type: "block", block: "order", label: "Order of sections", keywords: "reorder move position socials links player activity", adv: true },
    { section: "appearance", group: "Layout", path: "theme.showAvatar", label: "Show avatar", type: "toggle", adv: true },
    { section: "appearance", group: "Layout", path: "theme.showStatus", label: "Show status dot", type: "toggle", adv: true, show: p => p.theme.showAvatar },
    { section: "appearance", group: "Avatar", path: "theme.avatarShape", label: "Avatar shape", type: "segmented", options: [["circle", "Circle"], ["rounded", "Rounded"], ["square", "Square"]], show: p => p.theme.showAvatar },
    { section: "appearance", group: "Avatar", path: "theme.avatarSize", label: "Avatar size", type: "range", min: 64, max: 160, step: 2, fmt: "px", adv: true, show: p => p.theme.showAvatar },

    // ---------- Effects ----------
    { section: "effects", group: "Cursor", type: "block", block: "cursorPicker", label: "Cursor", keywords: "mouse pointer custom cursor image upload preset" },
    { section: "effects", group: "Cursor", path: "cursor.hotspot", label: "Click point", type: "segmented", adv: true, options: [["tip", "Top-left tip"], ["center", "Centre"]],
      show: p => p.cursor.style === "upload", hint: "Where the click happens on your cursor picture." },
    { section: "effects", group: "Cursor trail", path: "cursor.trailOn", label: "Cursor trail", type: "toggle", keywords: "mouse trail sparkle" },
    { section: "effects", group: "Cursor trail", path: "cursor.trail", label: "Style", type: "segmented", show: trailOn,
      options: [["sparkle", "Sparkle"], ["glow", "Soft glow"], ["ghost", "Ghost"], ["particles", "Particles"], ["ribbon", "Ribbon"], ["hearts", "Hearts"], ["snowflakes", "Snowflakes"]] },
    { section: "effects", group: "Cursor trail", path: "cursor.colorMode", label: "Colour", type: "segmented", options: [["theme", "Theme colours"], ["custom", "Custom"]], show: trailOn },
    { section: "effects", group: "Cursor trail", path: "cursor.color", label: "Trail colour", type: "color", show: p => trailOn(p) && p.cursor.colorMode === "custom" },
    { section: "effects", group: "Cursor trail", path: "cursor.size", label: "Size", type: "range", min: 0.5, max: 3, step: 0.1, fmt: "x", show: trailOn },
    { section: "effects", group: "Cursor trail", path: "cursor.length", label: "Length", type: "range", min: 0.3, max: 3, step: 0.1, fmt: "x", adv: true, show: trailOn },
    { section: "effects", group: "Cursor trail", path: "cursor.density", label: "Density", type: "range", min: 0.25, max: 2, step: 0.05, fmt: "x", adv: true, show: trailOn },
    { section: "effects", group: "Background effect", path: "effects.bg", label: "Effect", type: "segmented",
      options: [["none", "None"], ["particles", "Particles"], ["stars", "Stars"], ["fireflies", "Fireflies"], ["snow", "Snow"], ["rain", "Rain"], ["matrix", "Matrix"]] },
    { section: "effects", group: "Background effect", path: "effects.interactive", label: "Reacts to the mouse", type: "toggle", show: p => p.effects.bg !== "none" && p.effects.bg !== "matrix" },
    { section: "effects", group: "Background effect", path: "effects.speed", label: "Speed", type: "range", min: 0.1, max: 3, step: 0.1, fmt: "x", show: p => p.effects.bg !== "none", hint: "Slide left to slow it down." },
    { section: "effects", group: "Background effect", path: "effects.density", label: "Amount", type: "range", min: 0.25, max: 2, step: 0.05, fmt: "x", adv: true, show: p => p.effects.bg !== "none" },
    { section: "effects", group: "Background effect", path: "effects.color", label: "Effect colour", type: "color", adv: true, show: p => p.effects.bg !== "none" },
    { section: "effects", group: "Card motion", path: "theme.tilt", label: "3D tilt that follows the mouse", type: "toggle" },
    { section: "effects", group: "Card motion", path: "theme.shine", label: "Shine on the card", type: "toggle", show: isCard },
    { section: "effects", group: "Card motion", path: "theme.tiltStrength", label: "Tilt strength", type: "range", min: 2, max: 30, step: 1, fmt: "deg", adv: true, show: p => p.theme.tilt },
    { section: "effects", group: "Card motion", path: "effects.entrance", label: "Page entrance", type: "segmented", options: [["fade", "Fade"], ["slide", "Slide up"], ["zoom", "Zoom"], ["none", "None"]] },
    { section: "effects", group: "Enter screen", path: "splash.enabled", label: '"Click to enter" screen', type: "toggle", hint: "Needed for music to autoplay; browsers block sound until the visitor clicks." },
    { section: "effects", group: "Enter screen", path: "splash.text", label: "Enter screen text", type: "text", max: 60, show: p => p.splash.enabled, content: true },
    { section: "effects", group: "Enter screen", path: "splash.blur", label: "Enter screen blur", type: "range", min: 0, max: 40, step: 1, fmt: "px", adv: true, show: p => p.splash.enabled },

    // ---------- Links ----------
    { section: "links", group: "Social icons", type: "block", block: "socials", label: "Social icons", keywords: "instagram tiktok youtube github discord x twitter spotify steam twitch" },
    { section: "links", group: "Social icons", path: "theme.iconStyle", label: "Icon style", type: "segmented", options: [["plain", "Plain"], ["circle", "Circle"], ["square", "Square"]] },
    { section: "links", group: "Social icons", path: "theme.iconColor", label: "Icon colour", type: "segmented", options: [["white", "White"], ["accent", "Accent"], ["accent2", "Second"]] },
    { section: "links", group: "Social icons", path: "theme.iconSize", label: "Icon size", type: "range", min: 18, max: 40, step: 1, fmt: "px", adv: true },
    { section: "links", group: "Link buttons", type: "block", block: "links", label: "Link buttons", keywords: "button website url" },
    { section: "links", group: "Link buttons", path: "theme.buttonStyle", label: "Button style", type: "segmented", options: [["glass", "Glass"], ["solid", "Solid"], ["outline", "Outline"]] },
    { section: "links", group: "Link buttons", path: "theme.buttonRadius", label: "Button roundness", type: "range", min: 0, max: 30, step: 1, fmt: "px", adv: true },
    { section: "links", group: "Hover", path: "theme.hover", label: "Hover animation", type: "segmented", keywords: "lift glow animation",
      options: [["classic", "Classic"], ["lift", "Lift"], ["glow", "Glow"], ["none", "None"]], hint: "What links and icons do when the mouse is over them." },

    // ---------- Audio ----------
    { section: "audio", group: "Music", path: "music.enabled", label: "Play music on my page", type: "toggle" },
    { section: "audio", group: "Music", type: "block", block: "tracks", label: "Songs", keywords: "mp3 song upload track", show: p => p.music.enabled },
    { section: "audio", group: "Playback", path: "music.autoplay", label: "Start after the enter screen", type: "toggle", show: p => p.music.enabled },
    { section: "audio", group: "Playback", path: "music.volume", label: "Starting volume", type: "range", min: 0, max: 1, step: 0.05, fmt: "%", show: p => p.music.enabled },
    { section: "audio", group: "Playback", path: "music.player", label: "Player", type: "segmented", options: [["full", "Full"], ["compact", "Compact"], ["hidden", "Hidden"]], show: p => p.music.enabled, hint: "Hidden still plays the music." },
    { section: "audio", group: "Playback", path: "music.shuffle", label: "Shuffle", type: "toggle", adv: true, show: p => p.music.enabled },
    { section: "audio", group: "Playback", path: "music.loop", label: "Repeat the same song", type: "toggle", adv: true, show: p => p.music.enabled },

    // ---------- Discord & Badges ----------
    { section: "discord", group: "Discord", path: "discord.enabled", label: "Show my live Discord status", type: "toggle" },
    { section: "discord", group: "Discord", path: "discord.userId", label: "Discord user ID", type: "text", max: 21, placeholder: "e.g. 123456789012345678", inputmode: "numeric", show: p => p.discord.enabled, content: true },
    { section: "discord", group: "Discord", type: "block", block: "discordCheck", label: "Connection check", show: p => p.discord.enabled },
    { section: "discord", group: "Discord", path: "discord.useName", label: "Use my Discord name", type: "toggle", adv: true, show: p => p.discord.enabled },
    { section: "discord", group: "Discord", path: "discord.useAvatar", label: "Use my Discord avatar", type: "toggle", adv: true, show: p => p.discord.enabled },
    { section: "discord", group: "Custom activity", path: "presence.enabled", label: "Show a custom activity card", type: "toggle", adv: true, show: p => !p.discord.enabled },
    { section: "discord", group: "Custom activity", path: "presence.name", label: "Activity title", type: "text", max: 60, adv: true, placeholder: "Playing a game", content: true, show: p => !p.discord.enabled && p.presence.enabled },
    { section: "discord", group: "Custom activity", path: "presence.activity", label: "Activity detail", type: "text", max: 80, adv: true, placeholder: "In a ranked match", content: true, show: p => !p.discord.enabled && p.presence.enabled },
    { section: "discord", group: "Badges & views", type: "block", block: "badges", label: "My badges" },
    { section: "discord", group: "Badges & views", path: "theme.showBadges", label: "Show badges on my page", type: "toggle" },
    { section: "discord", group: "Badges & views", path: "theme.showViews", label: "Show view counter", type: "toggle" },

    // ---------- Analytics / Account (custom panels) ----------
    { section: "analytics", group: "", type: "block", block: "analytics", label: "Views, clicks & referrers", keywords: "stats statistics visitors traffic" },
    { section: "account", group: "Your page", type: "block", block: "pageLink", label: "Page link" },
    { section: "account", group: "Sign-in methods", type: "block", block: "signin", label: "Google & Discord sign-in", keywords: "connect link google discord oauth login" },
    { section: "account", group: "Password", type: "block", block: "password", label: "Change password" },
    { section: "account", group: "Dashboard", type: "block", block: "dashTheme", label: "Dashboard theme", keywords: "light dark mode" },
    { section: "account", group: "Danger zone", type: "block", block: "deleteAccount", label: "Delete account" }
  ];

  // ---------- Templates (look only; never touch the user's words, links or uploads) ----------
  const TEMPLATES = [
    { id: "classic", name: "Classic", note: "The original look", fromDefaults: true,
      swatch: ["#06060a", "#06060a", "#a855f7", "#ec4899"] },
    { id: "minimal", name: "Minimal", note: "Clean, no card",
      swatch: ["#0b0b0f", "#0b0b0f", "#e4e4e7", "#a1a1aa"],
      set: { "background.type": "color", "background.color": "#0b0b0f", "background.vignette": false, "effects.bg": "none",
        "theme.layout": "bare", "theme.usernameEffect": "none", "theme.accent": "#e4e4e7", "theme.accent2": "#a1a1aa",
        "theme.font": "inter", "theme.nameFont": "same", "theme.buttonStyle": "outline", "theme.iconStyle": "plain", "theme.iconColor": "white",
        "theme.glow": 0, "cursor.trailOn": false, "effects.entrance": "fade", "theme.avatarShape": "circle", "theme.tilt": false, "theme.hover": "lift" } },
    { id: "mono", name: "Mono", note: "Black, white, glow",
      swatch: ["#000000", "#0a0a0a", "#fafafa", "#a3a3a3"],
      set: { "background.type": "gradient", "background.color": "#000000", "background.color2": "#141414", "background.angle": 180,
        "effects.bg": "fireflies", "effects.color": "#ffffff", "effects.density": 0.7, "theme.layout": "card", "theme.accent": "#fafafa", "theme.accent2": "#a3a3a3",
        "theme.usernameEffect": "shimmer", "theme.cardColor": "#0a0a0a", "theme.cardOpacity": 0.4, "theme.blur": 20, "theme.glow": 0.12,
        "theme.cardBorderOpacity": 0.14, "theme.buttonStyle": "glass", "theme.iconStyle": "circle", "theme.hover": "lift",
        "cursor.trail": "glow", "theme.font": "space-grotesk", "theme.nameFont": "same" } },
    { id: "neon", name: "Neon", note: "Glowing outlines",
      swatch: ["#020617", "#1e1b4b", "#22d3ee", "#f0abfc"],
      set: { "background.type": "gradient", "background.color": "#020617", "background.color2": "#1e1b4b", "background.angle": 160,
        "effects.bg": "stars", "effects.color": "#22d3ee", "theme.layout": "card", "theme.accent": "#22d3ee", "theme.accent2": "#f0abfc",
        "theme.usernameEffect": "glow", "theme.buttonStyle": "outline", "theme.iconColor": "accent", "theme.iconStyle": "circle",
        "theme.glow": 0.45, "theme.cardOpacity": 0.3, "theme.cardBorder": 1, "theme.cardBorderOpacity": 0.25, "cursor.trail": "glow", "theme.font": "outfit", "theme.nameFont": "same", "theme.hover": "glow" } },
    { id: "glass", name: "Glass", note: "Frosted and soft",
      swatch: ["#312e81", "#0f172a", "#818cf8", "#f472b6"],
      set: { "background.type": "gradient", "background.color": "#312e81", "background.color2": "#0f172a", "background.angle": 160,
        "effects.bg": "particles", "effects.color": "#818cf8", "theme.layout": "card", "theme.accent": "#818cf8", "theme.accent2": "#f472b6",
        "theme.cardOpacity": 0.15, "theme.blur": 24, "theme.radius": 28, "theme.glow": 0.2, "theme.usernameEffect": "gradient",
        "theme.buttonStyle": "glass", "theme.iconStyle": "circle", "theme.iconColor": "white", "cursor.trail": "particles", "theme.font": "poppins", "theme.nameFont": "same" } },
    { id: "terminal", name: "Terminal", note: "Hacker green",
      swatch: ["#000000", "#000000", "#22c55e", "#4ade80"],
      set: { "background.type": "color", "background.color": "#000000", "effects.bg": "matrix", "effects.color": "#22c55e", "effects.speed": 0.5,
        "theme.layout": "card", "theme.accent": "#22c55e", "theme.accent2": "#4ade80", "theme.font": "jetbrains-mono", "theme.nameFont": "same",
        "theme.usernameEffect": "glitch", "theme.radius": 4, "theme.cardOpacity": 0.6, "theme.buttonStyle": "outline", "theme.buttonRadius": 2,
        "theme.iconColor": "accent", "theme.iconStyle": "square", "theme.avatarShape": "square", "cursor.trail": "particles", "theme.glow": 0.15 } },
    { id: "sunset", name: "Sunset", note: "Warm gradient",
      swatch: ["#f97316", "#7c3aed", "#fde68a", "#f472b6"],
      set: { "background.type": "gradient", "background.color": "#f97316", "background.color2": "#7c3aed", "background.angle": 160, "background.dim": 0.15,
        "effects.bg": "none", "theme.layout": "card", "theme.accent": "#fde68a", "theme.accent2": "#f472b6", "theme.usernameEffect": "sparkle",
        "theme.font": "poppins", "theme.nameFont": "same", "theme.cardOpacity": 0.25, "theme.radius": 26, "theme.buttonStyle": "solid",
        "theme.iconColor": "white", "theme.iconStyle": "plain", "cursor.trail": "sparkle" } },
    { id: "pixel", name: "Pixel", note: "Retro arcade",
      swatch: ["#111827", "#111827", "#facc15", "#fb7185"],
      set: { "background.type": "color", "background.color": "#111827", "effects.bg": "stars", "effects.color": "#facc15",
        "theme.layout": "card", "theme.accent": "#facc15", "theme.accent2": "#fb7185", "theme.font": "press-start", "theme.nameFont": "same",
        "theme.nameSize": 1.4, "theme.usernameEffect": "none", "theme.radius": 0, "theme.buttonRadius": 0, "theme.avatarShape": "square",
        "theme.iconStyle": "square", "theme.buttonStyle": "solid", "cursor.trail": "particles" } }
  ];
  // What "Classic" (and any template) is allowed to change: look settings only
  const LOOK_PATHS = S.filter(s => s.path && !s.content && /^(theme|background|effects|cursor)\./.test(s.path) &&
    !["theme.showViews", "theme.showBadges", "theme.showAvatar", "theme.showStatus", "theme.typewriter", "theme.typeSpeed", "cursor.hotspot"].includes(s.path)).map(s => s.path)
    .concat(["splash.blur"]);

  window.DASH_SCHEMA = { SECTIONS, SETTINGS: S, TEMPLATES, LOOK_PATHS };
})();
