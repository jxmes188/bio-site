/* Loads a user's settings, turns them into window.CONFIG, then loads the page scripts in order.

   Modes:
     /name             normal visit (counts a view, records where the visitor came from)
     /name?preview=1   saved version, no view counted (older previews)
     /name?live=1      dashboard live preview: waits for the dashboard to send the
                       unsaved settings with postMessage, so changes show instantly */
(async function () {
  const username = decodeURIComponent(location.pathname.split("/")[1] || "");
  const qs = new URLSearchParams(location.search);
  const live = qs.get("live") === "1";
  const preview = live || qs.get("preview") === "1";

  let data;
  try {
    if (live && window.parent !== window) {
      data = await new Promise(resolve => {
        addEventListener("message", function onMsg(e) {
          if (e.origin !== location.origin || !e.data || e.data.type !== "bio-preview") return;
          removeEventListener("message", onMsg);
          resolve(e.data.data);
        });
        window.parent.postMessage({ type: "bio-ready" }, location.origin);
      });
    } else {
      let ref = "";
      try { if (document.referrer) ref = new URL(document.referrer).hostname; } catch (_) {}
      const q = preview ? "?preview=1" : ref ? "?ref=" + encodeURIComponent(ref) : "";
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}${q}`);
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    }
  } catch (_) {
    document.body.innerHTML = '<p style="color:#fff;font-family:sans-serif;text-align:center;margin-top:40vh">Profile not found. <a style="color:#fff" href="/">Go home</a></p>';
    return;
  }

  const p = data.profile;
  window.CONFIG = {
    preview,
    username: p.displayName || data.username,
    handle: data.username,
    avatar: p.avatar || "/img/avatar.svg",
    banner: p.banner,
    status: p.status,
    location: p.location,
    bio: p.bio.length ? p.bio : [" "],
    badges: data.badges || [],
    socials: p.socials,
    links: p.links,
    presence: { ...p.presence, image: p.avatar || "/img/avatar.svg" },
    music: { ...p.music, autoplay: p.music.autoplay && !preview },
    theme: p.theme,
    background: { ...p.background, video: p.background.url, image: p.background.url },
    effects: p.effects || { bg: "none" },
    cursor: p.cursor,
    splash: { ...p.splash, enabled: p.splash.enabled && !preview },
    tabTitle: p.displayName || data.username,
    animatedTitle: p.animatedTitle,
    footer: p.footer,
    views: data.views,
    discord: p.discord
  };

  if (preview) document.getElementById("claim-btn").hidden = true;

  for (const src of ["/js/background.js", "/js/trails.js", "/js/cursor.js", "/js/profile.js", "/js/discord.js"]) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }
  if (live) window.parent.postMessage({ type: "bio-rendered" }, location.origin);
})();
