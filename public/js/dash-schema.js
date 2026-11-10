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

  const SECTIONS = [
    { id: "profile", label: "Profile", icon: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z" },
    { id: "appearance", label: "Appearance", icon: "M12 3a9 9 0 0 0 0 18c1 0 1.6-.8 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.5 17 3 12 3zM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" },
    { id: "effects", label: "Effects", icon: "M10 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zm9 12 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" },
    { id: "links", label: "Links", icon: "M10.6 13.4a1 1 0 0 0 1.4 0l4-4a1 1 0 1 0-1.4-1.4l-4 4a1 1 0 0 0 0 1.4zM13 16.5l-1.8 1.8a3 3 0 0 1-4.2-4.2L8.8 12a1 1 0 0 0-1.4-1.4l-1.8 1.8a5 5 0 0 0 7 7l1.8-1.8a1 1 0 0 0-1.4-1.1zm5.4-11a5 5 0 0 0-7 0L9.6 7.3A1 1 0 1 0 11 8.7l1.8-1.8a3 3 0 0 1 4.2 4.2L15.2 13a1 1 0 0 0 1.4 1.4l1.8-1.8a5 5 0 0 0 0-7.1z" },
    { id: "audio", label: "Audio", icon: "M12 3v10.6A4 4 0 1 0 14 17V7h4V3h-6z" },
    { id: "discord", label: "Discord & Badges", short: "Discord", icon: "M19.6 5.3A17 17 0 0 0 15.4 4l-.5 1a15.6 15.6 0 0 0-5.8 0L8.6 4a17 17 0 0 0-4.2 1.3C1.7 9.3 1 13.2 1.3 17a17 17 0 0 0 5.2 2.6l1.1-1.8c-.6-.2-1.2-.5-1.8-.9l.4-.3a12 12 0 0 0 11.6 0l.4.3c-.6.4-1.2.7-1.8.9l1.1 1.8a17 17 0 0 0 5.2-2.6c.4-4.4-.7-8.3-3.1-11.7zM8.5 14.7c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1zm7 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1z" },
    { id: "analytics", label: "Analytics", icon: "M4 20V10h3v10H4zm6.5 0V4h3v16h-3zM17 20v-7h3v7h-3z", noAdvanced: true },
    { id: "account", label: "Account", icon: "M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.4-2.2-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z", noAdvanced: true }
  ];

  // Settings, grouped by section and sub-heading ("group")
  const S = [
    // ---------- Profile ----------
    { section: "profile", group: "Picture", type: "block", block: "avatar", label: "Avatar & banner", keywords: "photo picture image pfp" },
    { section: "profile", group: "About you", path: "displayName", label: "Display name", type: "text", max: 32, content: true },
    { section: "profile", group: "About you", path: "bio", label: "Bio", type: "lines", hint: "One line per message. Each line types out in turn.", content: true },
    { section: "profile", group: "About you", path: "location", label: "Location", type: "text", max: 40, placeholder: "optional", content: true },
    { section: "profile", group: "Name style", path: "theme.usernameEffect", label: "Username effect", type: "segmented",
      options: [["rainbow", "Rainbow"], ["gradient", "Gradient"], ["glow", "Glow"], ["sparkle", "Sparkle"], ["glitch", "Glitch"], ["none", "None"]] },
    { section: "profile", group: "Name style", path: "theme.typewriter", label: "Typewriter effect on bio", type: "toggle" },
    { section: "profile", group: "Name style", path: "theme.typeSpeed", label: "Typing speed", type: "range", min: 0.25, max: 3, step: 0.25, fmt: "x", adv: true, show: p => p.theme.typewriter },
    { section: "profile", group: "Name style", path: "theme.nameSize", label: "Name size", type: "range", min: 1.2, max: 3.2, step: 0.1, fmt: "x", adv: true },
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
    { section: "appearance", group: "Card", path: "theme.cardOpacity", label: "Card opacity", type: "range", min: 0, max: 1, step: 0.05, fmt: "%", show: p => p.theme.layout === "card" },
    { section: "appearance", group: "Card", path: "theme.radius", label: "Corner roundness", type: "range", min: 0, max: 36, step: 1, fmt: "px", show: p => p.theme.layout === "card" },
    { section: "appearance", group: "Card", path: "theme.blur", label: "Card blur", type: "range", min: 0, max: 40, step: 1, fmt: "px", adv: true, show: p => p.theme.layout === "card" },
    { section: "appearance", group: "Card", path: "theme.glow", label: "Card glow", type: "range", min: 0, max: 0.6, step: 0.02, fmt: "%", adv: true, show: p => p.theme.layout === "card" },
    { section: "appearance", group: "Card", path: "theme.cardBorder", label: "Border width", type: "range", min: 0, max: 4, step: 1, fmt: "px", adv: true, show: p => p.theme.layout === "card" },
    { section: "appearance", group: "Card", path: "theme.cardBorderOpacity", label: "Border brightness", type: "range", min: 0, max: 1, step: 0.05, fmt: "%", adv: true, show: p => p.theme.layout === "card" && p.theme.cardBorder > 0 },
    { section: "appearance", group: "Card", path: "theme.cardWidth", label: "Width", type: "range", min: 360, max: 680, step: 10, fmt: "px", adv: true },
    { section: "appearance", group: "Card", path: "theme.align", label: "Alignment", type: "segmented", adv: true, options: [["center", "Centre"], ["left", "Left"]] },
    { section: "appearance", group: "Avatar", path: "theme.avatarShape", label: "Avatar shape", type: "segmented", options: [["circle", "Circle"], ["rounded", "Rounded"], ["square", "Square"]] },
    { section: "appearance", group: "Avatar", path: "theme.avatarSize", label: "Avatar size", type: "range", min: 64, max: 160, step: 2, fmt: "px", adv: true },
    { section: "appearance", group: "Cursor", type: "block", block: "cursorUpload", label: "Custom cursor", adv: true, keywords: "mouse pointer image" },

    // ---------- Effects ----------
    { section: "effects", group: "Background effect", path: "effects.bg", label: "Effect", type: "segmented",
      options: [["none", "None"], ["particles", "Particles"], ["stars", "Stars"], ["matrix", "Matrix"], ["snow", "Snow"], ["rain", "Rain"]] },
    { section: "effects", group: "Background effect", path: "effects.speed", label: "Speed", type: "range", min: 0.1, max: 3, step: 0.1, fmt: "x", show: p => p.effects.bg !== "none", hint: "Slide left to slow it down." },
    { section: "effects", group: "Background effect", path: "effects.density", label: "Amount", type: "range", min: 0.25, max: 2, step: 0.05, fmt: "x", adv: true, show: p => p.effects.bg !== "none" },
    { section: "effects", group: "Background effect", path: "effects.color", label: "Effect colour", type: "color", adv: true, show: p => p.effects.bg !== "none" },
    { section: "effects", group: "Cursor trail", path: "cursor.trail", label: "Trail", type: "segmented",
      options: [["sparkle", "Sparkles"], ["rainbow", "Rainbow"], ["ghost", "Ghost"], ["fairy", "Fairy dust"], ["hearts", "Hearts"], ["snowflakes", "Snowflakes"], ["dots", "Dots"], ["glow", "Glow"], ["bubbles", "Bubbles"], ["none", "None"]] },
    { section: "effects", group: "Cursor trail", path: "cursor.size", label: "Trail size", type: "range", min: 0.5, max: 3, step: 0.1, fmt: "x", adv: true, show: p => p.cursor.trail !== "none" },
    { section: "effects", group: "Cursor trail", path: "cursor.length", label: "Trail length", type: "range", min: 0.3, max: 3, step: 0.1, fmt: "x", adv: true, show: p => p.cursor.trail !== "none" },
    { section: "effects", group: "Cursor trail", path: "cursor.colorMode", label: "Trail colour", type: "segmented", adv: true, options: [["theme", "Theme colours"], ["custom", "Custom"]], show: p => p.cursor.trail !== "none" },
    { section: "effects", group: "Cursor trail", path: "cursor.color", label: "Custom trail colour", type: "color", adv: true, show: p => p.cursor.trail !== "none" && p.cursor.colorMode === "custom" },
    { section: "effects", group: "Cursor trail", path: "cursor.touch", label: "Show trail when dragging a finger on phones", type: "toggle", adv: true, show: p => p.cursor.trail !== "none" },
    { section: "effects", group: "Animation", path: "effects.entrance", label: "Page entrance", type: "segmented", options: [["fade", "Fade"], ["slide", "Slide up"], ["zoom", "Zoom"], ["none", "None"]] },
    { section: "effects", group: "Animation", path: "theme.tilt", label: "3D tilt when the mouse moves", type: "toggle" },
    { section: "effects", group: "Animation", path: "theme.tiltStrength", label: "Tilt strength", type: "range", min: 2, max: 30, step: 1, fmt: "deg", adv: true, show: p => p.theme.tilt },
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
    { section: "account", group: "Dashboard look", type: "block", block: "dashTheme", label: "Dashboard theme", keywords: "light dark mode accent" },
    { section: "account", group: "Password", type: "block", block: "password", label: "Change password" },
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
        "theme.glow": 0, "cursor.trail": "none", "effects.entrance": "fade", "theme.avatarShape": "circle", "theme.tilt": false } },
    { id: "neon", name: "Neon", note: "Glowing outlines",
      swatch: ["#020617", "#1e1b4b", "#22d3ee", "#f0abfc"],
      set: { "background.type": "gradient", "background.color": "#020617", "background.color2": "#1e1b4b", "background.angle": 160,
        "effects.bg": "stars", "effects.color": "#22d3ee", "theme.layout": "card", "theme.accent": "#22d3ee", "theme.accent2": "#f0abfc",
        "theme.usernameEffect": "glow", "theme.buttonStyle": "outline", "theme.iconColor": "accent", "theme.iconStyle": "circle",
        "theme.glow": 0.45, "theme.cardOpacity": 0.3, "theme.cardBorder": 1, "theme.cardBorderOpacity": 0.25, "cursor.trail": "glow", "theme.font": "outfit", "theme.nameFont": "same" } },
    { id: "glass", name: "Glass", note: "Frosted and soft",
      swatch: ["#312e81", "#0f172a", "#818cf8", "#f472b6"],
      set: { "background.type": "gradient", "background.color": "#312e81", "background.color2": "#0f172a", "background.angle": 160,
        "effects.bg": "particles", "effects.color": "#818cf8", "theme.layout": "card", "theme.accent": "#818cf8", "theme.accent2": "#f472b6",
        "theme.cardOpacity": 0.15, "theme.blur": 24, "theme.radius": 28, "theme.glow": 0.2, "theme.usernameEffect": "gradient",
        "theme.buttonStyle": "glass", "theme.iconStyle": "circle", "theme.iconColor": "white", "cursor.trail": "bubbles", "theme.font": "poppins", "theme.nameFont": "same" } },
    { id: "terminal", name: "Terminal", note: "Hacker green",
      swatch: ["#000000", "#000000", "#22c55e", "#4ade80"],
      set: { "background.type": "color", "background.color": "#000000", "effects.bg": "matrix", "effects.color": "#22c55e", "effects.speed": 0.5,
        "theme.layout": "card", "theme.accent": "#22c55e", "theme.accent2": "#4ade80", "theme.font": "jetbrains-mono", "theme.nameFont": "same",
        "theme.usernameEffect": "glitch", "theme.radius": 4, "theme.cardOpacity": 0.6, "theme.buttonStyle": "outline", "theme.buttonRadius": 2,
        "theme.iconColor": "accent", "theme.iconStyle": "square", "theme.avatarShape": "square", "cursor.trail": "dots", "theme.glow": 0.15 } },
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
        "theme.iconStyle": "square", "theme.buttonStyle": "solid", "cursor.trail": "dots" } }
  ];
  // What "Classic" (and any template) is allowed to change: look settings only
  const LOOK_PATHS = S.filter(s => s.path && !s.content && /^(theme|background|effects|cursor)\./.test(s.path) &&
    !["theme.showViews", "theme.showBadges", "theme.typewriter", "theme.typeSpeed", "cursor.touch"].includes(s.path)).map(s => s.path)
    .concat(["splash.blur"]);

  window.DASH_SCHEMA = { SECTIONS, SETTINGS: S, TEMPLATES, LOOK_PATHS };
})();
