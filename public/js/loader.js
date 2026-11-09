/* Fetches /api/profile/<username>, turns it into window.CONFIG,
   then loads the page scripts in order. */
(async function () {
  const username = decodeURIComponent(location.pathname.split("/")[1] || "");
  const preview = new URLSearchParams(location.search).get("preview") === "1";

  let data;
  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(username)}${preview ? "?preview=1" : ""}`);
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (_) {
    document.body.innerHTML = '<p style="color:#fff;font-family:sans-serif;text-align:center;margin-top:40vh">Profile not found. <a style="color:#a855f7" href="/">Go home</a></p>';
    return;
  }

  const p = data.profile;
  window.CONFIG = {
    username: p.displayName || data.username,
    handle: data.username,
    avatar: p.avatar || "/img/avatar.svg",
    banner: p.banner,
    status: p.status,
    location: p.location,
    bio: p.bio.length ? p.bio : [" "],
    badges: data.badges,
    socials: p.socials,
    links: p.links,
    presence: { ...p.presence, image: p.avatar || "/img/avatar.svg" },
    music: { ...p.music, autoplay: p.music.autoplay && !preview },
    theme: p.theme,
    background: { ...p.background, video: p.background.url, image: p.background.url },
    cursor: p.cursor,
    splash: { ...p.splash, enabled: p.splash.enabled && !preview },
    tabTitle: p.displayName || data.username,
    animatedTitle: p.animatedTitle,
    footer: p.footer,
    views: data.views,
    discord: p.discord
  };

  if (preview) document.getElementById("claim-btn").hidden = true;

  for (const src of ["/js/background.js", "/js/cursor.js", "/js/profile.js", "/js/discord.js"]) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }
})();
