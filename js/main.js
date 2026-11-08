/* Main app logic: renders profile from CONFIG and wires up interactions */
(function () {
  const C = window.CONFIG;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;

  // ---------- Theme variables ----------
  root.style.setProperty("--accent", C.theme.accent);
  root.style.setProperty("--accent2", C.theme.accent2);
  root.style.setProperty("--card-bg", `rgba(12,12,18,${C.theme.cardOpacity})`);
  root.style.setProperty("--blur", C.theme.blur + "px");

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
  if (C.banner) $("banner").style.backgroundImage = `url("${C.banner}")`;
  else $("banner").hidden = true;

  // Badges
  $("badges").innerHTML = C.badges.map(b =>
    `<span class="badge" data-tip="${b.label}">${ICONS[b.icon] || ""}</span>`
  ).join("");

  // Socials
  $("socials").innerHTML = C.socials.map((s, i) =>
    `<a class="social" href="${s.copy ? "#" : s.url}" ${s.copy ? "" : 'target="_blank" rel="noopener"'}
        data-i="${i}" data-tip="${s.label}" aria-label="${s.label}">${ICONS[s.icon] || ICONS.link}</a>`
  ).join("");
  $("socials").addEventListener("click", e => {
    const a = e.target.closest(".social");
    if (!a) return;
    const s = C.socials[a.dataset.i];
    if (s.copy) {
      e.preventDefault();
      navigator.clipboard?.writeText(s.url).then(
        () => toast(`Copied ${s.label}: ${s.url}`),
        () => toast(`${s.label}: ${s.url}`)
      );
    }
  });

  // Links
  if (C.links.length) {
    $("links").innerHTML = C.links.map(l =>
      `<a class="link-btn" href="${l.url}" target="_blank" rel="noopener">
         <span class="link-ico">${ICONS[l.icon] || ICONS.link}</span>
         <span>${l.title}</span>
         <svg class="arrow" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
       </a>`
    ).join("");
  } else $("links").hidden = true;

  // Presence
  const discordOn = C.discord && C.discord.enabled && C.discord.userId && C.discord.userId !== "PASTE_YOUR_DISCORD_USER_ID";
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

  // ---------- View counter (local to this browser) ----------
  let views = C.viewCounterStart;
  try {
    views = parseInt(localStorage.getItem("bio_views") || C.viewCounterStart, 10) + 1;
    localStorage.setItem("bio_views", views);
  } catch (_) {}
  animateCount($("views"), views);

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
    let li = 0, ci = 0, deleting = false;
    (function tick() {
      const line = lines[li];
      el.textContent = line.slice(0, ci);
      if (!deleting && ci < line.length) { ci++; setTimeout(tick, 70); }
      else if (!deleting) { deleting = true; setTimeout(tick, 1800); }
      else if (ci > 0) { ci--; setTimeout(tick, 35); }
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
      card.style.transform = `perspective(1000px) rotateY(${cx * 10}deg) rotateX(${-cy * 10}deg)`;
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

  function loadTrack(i) {
    if (!M.tracks.length) return;
    track = (i + M.tracks.length) % M.tracks.length;
    audio.src = encodeURI(M.tracks[track].src);
    $("track-title").textContent = M.tracks[track].title;
  }
  function play() {
    audio.play().then(setPlaying, () => {
      $("track-title").textContent = "Add mp3s to assets/music";
      setPaused();
    });
  }
  function setPlaying() { $("icon-play").hidden = true; $("icon-pause").hidden = false; }
  function setPaused() { $("icon-play").hidden = false; $("icon-pause").hidden = true; }

  if (!M.enabled) $("player").hidden = true;
  else loadTrack(0);

  $("play-btn").onclick = () => (audio.paused ? play() : (audio.pause(), setPaused()));
  $("next-btn").onclick = () => { loadTrack(track + 1); play(); };
  audio.onended = () => { loadTrack(track + 1); play(); };
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
  $("mute-btn").onclick = () => { audio.muted = !audio.muted; updateMuteIcon(); };
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
    $("splash").classList.add("hide");
    setTimeout(() => $("splash").remove(), 800);
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
