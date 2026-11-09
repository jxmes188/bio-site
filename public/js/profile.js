/* Main app logic: renders profile from CONFIG and wires up interactions */
(function () {
  const C = window.CONFIG;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  // Everything here is written by users, so escape before it touches innerHTML
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => (/^https?:\/\//i.test(u || "") ? u : "#");

  // ---------- Theme variables ----------
  const T = C.theme;
  const rgba = (hex, a) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const FONTS = {
    "inter":          ['"Inter", system-ui, sans-serif', "Inter:wght@400;500;600;700;800"],
    "poppins":        ['"Poppins", system-ui, sans-serif', "Poppins:wght@400;500;600;700;800"],
    "outfit":         ['"Outfit", system-ui, sans-serif', "Outfit:wght@400;500;600;700;800"],
    "space-grotesk":  ['"Space Grotesk", system-ui, sans-serif', "Space+Grotesk:wght@400;500;600;700"],
    "jetbrains-mono": ['"JetBrains Mono", ui-monospace, monospace', "JetBrains+Mono:wght@400;600;800"],
    "press-start":    ['"Press Start 2P", ui-monospace, monospace', "Press+Start+2P"]
  };
  const font = FONTS[T.font] || FONTS.inter;
  if (T.font && T.font !== "inter") {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${font[1]}&display=swap`;
    document.head.appendChild(link);
  }
  const ICON_COLORS = { white: "#e4e4e7", accent: T.accent, accent2: T.accent2 };
  const vars = {
    "--accent": T.accent,
    "--accent2": T.accent2,
    "--card-bg": `rgba(12,12,18,${T.cardOpacity})`,
    "--blur": T.blur + "px",
    "--font": font[0],
    "--text": T.textColor,
    "--card-width": T.cardWidth + "px",
    "--radius": T.radius + "px",
    "--card-glow": rgba(T.accent, T.glow),
    "--avatar-size": T.avatarSize + "px",
    "--avatar-radius": { circle: "50%", rounded: "22%", square: "6px" }[T.avatarShape] || "50%",
    "--name-size": T.nameSize + "rem",
    "--icon-size": T.iconSize + "px",
    "--icon-color": ICON_COLORS[T.iconColor] || ICON_COLORS.white,
    "--bg-dim": C.background.dim || 0
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);

  // ---------- Profile ----------
  $("avatar").src = C.avatar;
  $("username").textContent = C.username;
  $("username").dataset.text = C.username;
  $("username").classList.add("fx-" + C.theme.usernameEffect);
  $("location").textContent = C.location;
  if (!C.location) $("location-wrap").hidden = true;
  $("status-dot").className = "status-dot " + C.status;
  $("status-dot").title = C.status;
  $("footer-text").textContent = C.footer;
  if (C.banner) $("banner").style.backgroundImage = `url("${encodeURI(C.banner)}")`;
  else $("banner").hidden = true;

  // Badges
  if (C.badges.length) {
    $("badges").innerHTML = C.badges.map(b =>
      `<span class="badge" data-tip="${esc(b.label)}"${/^#[0-9a-f]{6}$/i.test(b.color || "") ? ` style="color:${b.color}"` : ""}>${ICONS[b.icon] || ""}</span>`
    ).join("");
  } else $("badges").hidden = true;

  // Socials
  if (!C.socials.length) $("socials").hidden = true;
  // Each icon opens its link in a new tab
  $("socials").innerHTML = C.socials.map(s =>
    `<a class="social" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener nofollow"
        data-tip="${esc(s.label)}" aria-label="${esc(s.label)}">${ICONS[s.icon] || ICONS.link}</a>`
  ).join("");

  // Links
  if (C.links.length) {
    $("links").innerHTML = C.links.map(l =>
      `<a class="link-btn" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener nofollow">
         <span class="link-ico">${ICONS[l.icon] || ICONS.link}</span>
         <span>${esc(l.title)}</span>
         <svg class="arrow" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
       </a>`
    ).join("");
  } else $("links").hidden = true;

  // Presence
  const discordOn = C.discord && C.discord.enabled && C.discord.userId;
  if (discordOn) {
    // discord.js fills the presence card live; hide it until data arrives
    $("presence").hidden = true;
  } else if (C.presence.enabled) {
    $("presence-label").textContent = "Activity";
    $("presence-img").src = C.presence.image;
    $("presence-name").textContent = C.presence.name;
    $("presence-activity").textContent = C.presence.activity;
    const start = Date.now();
    setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      $("presence-time").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")} elapsed`;
    }, 1000);
  } else $("presence").hidden = true;

  // ---------- View counter (real, counted by the server) ----------
  if (T.showViews === false) $("views-wrap").hidden = true;
  else animateCount($("views"), C.views || 0);

  function animateCount(el, target) {
    const dur = 1500, t0 = performance.now();
    (function step(t) {
      const p = Math.min((t - t0) / dur, 1);
      el.textContent = Math.floor(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  // ---------- Typewriter bio ----------
  function typewriter(el, lines) {
    // No bio: hide the whole line, blinking caret included
    if (!lines.some(l => l.trim())) {
      el.closest(".bio").hidden = true;
      return;
    }
    // Typewriter off: show the lines as plain text, no blinking caret
    if (T.typewriter === false) {
      el.textContent = lines.join(" · ");
      document.querySelector(".caret").hidden = true;
      return;
    }
    const sp = T.typeSpeed || 1;   // 2 = twice as fast, 0.5 = half speed
    let li = 0, ci = 0, deleting = false;
    (function tick() {
      const line = lines[li];
      el.textContent = line.slice(0, ci);
      if (!deleting && ci < line.length) { ci++; setTimeout(tick, 70 / sp); }
      else if (!deleting) { deleting = true; setTimeout(tick, 1800); }
      else if (ci > 0) { ci--; setTimeout(tick, 35 / sp); }
      else { deleting = false; li = (li + 1) % lines.length; setTimeout(tick, 400); }
    })();
  }

  // ---------- Animated tab title ----------
  function animateTitle() {
    let i = 0;
    document.title = C.tabTitle;
    if (!C.animatedTitle) return;
    setInterval(() => {
      const base = C.tabTitle + " ✦ ";   // re-read so the Discord name shows once loaded
      i = i % base.length;
      document.title = (base.slice(i) + base.slice(0, i)).trim() || C.tabTitle;
      i++;
    }, 300);
  }

  // ---------- 3D tilt ----------
  const card = $("card");
  if (C.theme.tilt && !matchMedia("(pointer: coarse)").matches) {
    addEventListener("mousemove", e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / r.width;
      const y = (e.clientY - (r.top + r.height / 2)) / r.height;
      const cx = Math.max(-1, Math.min(1, x)), cy = Math.max(-1, Math.min(1, y));
      const deg = T.tiltStrength || 10;
      card.style.transform = `perspective(1000px) rotateY(${cx * deg}deg) rotateX(${-cy * deg}deg)`;
      card.style.setProperty("--gx", (cx + 1) * 50 + "%");
      card.style.setProperty("--gy", (cy + 1) * 50 + "%");
    });
    document.addEventListener("mouseleave", () => card.style.transform = "");
  }

  // ---------- Music player ----------
  const audio = $("audio");
  const M = C.music;
  let track = 0;
  audio.volume = M.volume;
  $("volume").value = M.volume;

  let started = false;   // only show "PAUSED" once the song has actually played

  function loadTrack(i) {
    if (!M.tracks.length) return;
    track = (i + M.tracks.length) % M.tracks.length;
    audio.src = encodeURI(M.tracks[track].src);
    $("track-title").textContent = M.tracks[track].title;
  }
  function nextIndex() {
    if (M.shuffle && M.tracks.length > 1) {
      let n;
      do { n = Math.floor(Math.random() * M.tracks.length); } while (n === track);
      return n;
    }
    return track + 1;
  }
  // If the browser blocks autoplay, just stay paused and keep the song title
  function play() { audio.play().catch(() => setPaused()); }
  function setPlaying() {
    started = true;
    $("icon-play").hidden = true; $("icon-pause").hidden = false;
    $("player").classList.remove("is-paused"); $("paused-tag").hidden = true;
  }
  function setPaused() {
    $("icon-play").hidden = false; $("icon-pause").hidden = true;
    $("player").classList.toggle("is-paused", started); $("paused-tag").hidden = !started;
  }

  if (!M.enabled || !M.tracks.length) $("player").hidden = true;
  else loadTrack(0);

  audio.addEventListener("play", setPlaying);
  audio.addEventListener("pause", setPaused);
  $("play-btn").onclick = () => (audio.paused ? play() : audio.pause());
  $("next-btn").onclick = () => { loadTrack(nextIndex()); play(); };
  audio.onended = () => {
    if (M.loop) { audio.currentTime = 0; play(); }
    else { loadTrack(nextIndex()); play(); }
  };
  audio.onerror = () => { $("track-title").textContent = "Track not found"; setPaused(); };
  audio.ontimeupdate = () => {
    const d = audio.duration || 0;
    $("progress-fill").style.width = d ? (audio.currentTime / d) * 100 + "%" : "0";
    $("t-cur").textContent = fmt(audio.currentTime);
    $("t-dur").textContent = fmt(d);
  };
  $("progress").onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    if (audio.duration) audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
  };
  $("volume").oninput = e => {
    audio.volume = +e.target.value;
    audio.muted = false;
    updateMuteIcon();
  };
  // Phones: tap the speaker to show/hide the slider. Computers: hover shows it, click mutes.
  const touch = matchMedia("(hover: none)").matches;
  $("mute-btn").onclick = e => {
    e.stopPropagation();
    if (touch) $("volume-wrap").classList.toggle("open");
    else { audio.muted = !audio.muted; updateMuteIcon(); }
  };
  if (touch) document.addEventListener("click", e => {
    if (!$("volume-wrap").contains(e.target)) $("volume-wrap").classList.remove("open");
  });
  function updateMuteIcon() {
    const m = audio.muted || audio.volume === 0;
    $("icon-vol").hidden = m; $("icon-mute").hidden = !m;
  }
  function fmt(s) {
    if (!isFinite(s)) return "0:00";
    return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.hidden = true, 300); }, 2200);
  }

  // ---------- Enter ----------
  function enter() {
    const splash = $("splash");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 800);
    }
    $("app").classList.add("show");
    $("app").setAttribute("aria-hidden", "false");
    typewriter($("bio-text"), C.bio);
    animateTitle();
    if (M.enabled && M.autoplay) play();
    if (window.BG.video && !window.BG.video.hidden) window.BG.video.play().catch(() => {});
  }

  if (C.splash.enabled) {
    $("splash-text").textContent = C.splash.text;
    $("splash").addEventListener("click", enter, { once: true });
    addEventListener("keydown", function k(e) {
      if (e.key === "Enter" || e.key === " ") { removeEventListener("keydown", k); enter(); }
    });
  } else {
    $("splash").remove();
    enter();
  }
})();
