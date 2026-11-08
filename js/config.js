/* =========================================================
   CONFIG — edit everything about your page here.
   No other file needs to change to personalise the site.
   ========================================================= */
window.CONFIG = {
  // ---------- Discord (live name, avatar & status) ----------
  // 1. Join the Lanyard server: https://discord.gg/lanyard  (required, it's how your status is read)
  // 2. Discord → Settings → Advanced → turn on Developer Mode
  // 3. Right-click your own name → "Copy User ID" and paste it below
  discord: {
    enabled: true,
    userId: "1324568559610757130",
    useName: true,     // replace "username" below with your Discord display name
    useAvatar: true    // replace "avatar" below with your Discord profile picture
  },

  // ---------- Profile ----------
  // (these are used as fallbacks until Discord loads, or if discord.enabled is false)
  username: "yourname",
  avatar: "assets/avatar.svg",      // put your own image in /assets and change this
  banner: "",                        // optional banner image, e.g. "assets/banner.jpg"
  status: "online",                  // online | idle | dnd | offline
  location: "Earth",
  bio: [                             // typewriter cycles through these lines
    "welcome to my page",
    "developer • gamer • creator",
    "thanks for stopping by ✦"
  ],

  // ---------- Badges (shown under the name) ----------
  // icon = key from js/icons.js
  badges: [
    { icon: "verified", label: "Verified" },
    { icon: "crown",    label: "Premium" },
    { icon: "code",     label: "Developer" },
    { icon: "star",     label: "Early Supporter" }
  ],

  // ---------- Social icons ----------
  // copy: true  -> clicking copies the value instead of opening a link
  socials: [
    { icon: "discord",   url: "yourname",                         copy: true, label: "Discord" },
    { icon: "github",    url: "https://github.com/",              label: "GitHub" },
    { icon: "youtube",   url: "https://youtube.com/",             label: "YouTube" },
    { icon: "tiktok",    url: "https://tiktok.com/",              label: "TikTok" },
    { icon: "instagram", url: "https://instagram.com/",           label: "Instagram" },
    { icon: "x",         url: "https://x.com/",                   label: "X" },
    { icon: "spotify",   url: "https://open.spotify.com/",        label: "Spotify" },
    { icon: "steam",     url: "https://steamcommunity.com/",      label: "Steam" }
  ],

  // ---------- Big link buttons (leave [] to hide) ----------
  links: [
    { title: "My Website",   url: "https://example.com", icon: "link" },
    { title: "Support me",   url: "https://example.com", icon: "heart" }
  ],

  // ---------- Presence card (Discord-style activity) ----------
  presence: {
    enabled: true,
    name: "Playing a game",
    activity: "In a match — ranked",
    image: "assets/avatar.svg"
  },

  // ---------- Music ----------
  // Put .mp3 files in /assets/music and list them here.
  music: {
    enabled: true,
    volume: 0.4,
    autoplay: true,   // starts after "click to enter"
    tracks: [
      { title: "Coone - 4 BY 4 BEATS (I Don't Care)", src: "assets/music/Coone - 4 BY 4 BEATS (I Don't Care) (Official Hardstyle Video).mp3" }
    ]
  },

  // ---------- Look & feel ----------
  theme: {
    accent: "#a855f7",          // main glow colour
    accent2: "#ec4899",         // gradient second colour
    cardOpacity: 0.35,          // 0 = invisible card, 1 = solid
    blur: 14,                   // card glass blur in px
    usernameEffect: "rainbow",  // rainbow | glow | gradient | none
    tilt: true                  // 3D tilt on mouse move
  },

  // ---------- Background ----------
  background: {
    type: "particles",  // particles | stars | matrix | video | none
    video: "assets/background.mp4", // used only when type is "video"
    color: "#06060a"
  },

  // ---------- Cursor ----------
  cursor: {
    trail: "sparkle"    // sparkle | dots | none
  },

  // ---------- Splash ----------
  splash: {
    enabled: true,
    text: "click to enter..."
  },

  // ---------- Misc ----------
  tabTitle: "yourname",
  animatedTitle: true,   // scrolls the browser tab title
  footer: "made with ♥",
  viewCounterStart: 1337 // starting number for the local view counter
};
