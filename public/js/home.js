/* Homepage */
(function () {
  const $ = id => document.getElementById(id);
  const host = location.host;
  const name = host.split(":")[0];

  // The real domain everywhere (never hardcoded)
  document.querySelectorAll(".site-prefix").forEach(el => (el.textContent = host + "/"));
  document.querySelectorAll(".site-name").forEach(el => (el.textContent = name));
  document.title = name + " · your page, your way";
  $("year").textContent = new Date().getFullYear();

  // Old links to "/#signin" now go to the sign-in page
  if (location.hash === "#signin") location.replace("/login");

  // ---------- Signed in? ----------
  fetch("/api/session").then(r => r.json()).then(s => {
    const me = s.user;
    if (!me) return;
    $("nav-guest").hidden = true;
    $("nav-user").hidden = false;
    $("nav-who").textContent = "@" + me.username;
  }).catch(() => {});

  // ---------- Nav background once scrolled ----------
  const nav = $("nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---------- Claim a name ----------
  const clean = v => v.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
  let checkTimer;
  $("claim-input").addEventListener("input", e => {
    e.target.value = clean(e.target.value);
    clearTimeout(checkTimer);
    const v = e.target.value, note = $("claim-note");
    if (!v) { note.textContent = "Free. Takes about a minute."; note.className = "claim-note"; return; }
    checkTimer = setTimeout(async () => {
      try {
        const r = await (await fetch("/api/check/" + encodeURIComponent(v))).json();
        if ($("claim-input").value !== v) return;
        note.textContent = r.available ? `${host}/${v} is available` : r.reason;
        note.className = "claim-note " + (r.available ? "ok" : "bad");
      } catch (_) {}
    }, 300);
  });
  $("claim-form").addEventListener("submit", e => {
    e.preventDefault();
    const v = clean($("claim-input").value);
    location.href = "/signup" + (v ? "?u=" + encodeURIComponent(v) : "");
  });

  // ---------- Reveal on scroll ----------
  const io = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }, { rootMargin: "0px 0px -8% 0px" }) : null;
  document.querySelectorAll(".reveal").forEach(el => (io ? io.observe(el) : el.classList.add("in")));

  // ---------- Angled stage follows the mouse a little ----------
  const stage = $("stage");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!still && matchMedia("(hover: hover)").matches) {
    addEventListener("pointermove", e => {
      const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
      stage.style.setProperty("--ry", (-10 + x * 6).toFixed(2) + "deg");
      stage.style.setProperty("--rx", (22 - y * 5).toFixed(2) + "deg");
    }, { passive: true });
  }

  // ---------- Customization demo ----------
  const card = $("cd-card");
  const bind = (id, prop, fmt, toCss) => {
    const input = $(id), out = $(id + "-v");
    const apply = () => { out.textContent = fmt(input.value); card.style.setProperty(prop, toCss(input.value)); };
    input.addEventListener("input", apply);
    apply();
  };
  bind("cd-r", "--r", v => v + "px", v => v + "px");
  bind("cd-b", "--b", v => v + "px", v => v + "px");
  bind("cd-g", "--g", v => v + "%", v => String(v / 100));
  bind("cd-w", "--w", v => v + "px", v => v + "px");

  // ---------- Cursor & trail demo ----------
  const demo = $("trail-demo");
  let trail = null;
  if (window.Trails && Trails.canRun()) {
    trail = Trails.create($("trail-canvas"), { area: demo, type: "sparkle", colors: ["#ffffff", "#d4d4d4"], size: 1.1, length: 1.1, density: 1.1 });
    demo.addEventListener("pointermove", () => demo.classList.add("used"), { once: true });
  } else $("trail-hint").textContent = matchMedia("(hover: none), (pointer: coarse)").matches
    ? "Trails and custom cursors show on computers, not touch screens."
    : "Trails are paused because your device asks for reduced motion.";
  const choose = (wrap, attr, fn) => wrap.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    wrap.querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); });
    fn(b.dataset[attr]);
  });
  choose($("trail-chips"), "trail", t => trail && trail.set({ type: t }));
  const HOT = { arrow: "4 3", soft: "5 4", dot: "16 16", ring: "16 16", crosshair: "16 16" };
  const setCursor = c => { demo.style.cursor = `url("/cursors/${c}.svg") ${HOT[c]}, auto`; };
  choose($("cursor-chips"), "cursor", setCursor);
  if (trail) setCursor("arrow");

  // ---------- Mini chart ----------
  const values = [22, 30, 26, 38, 34, 46, 41, 52, 49, 61, 58, 72, 66, 80, 76, 88];
  $("mini-chart").replaceChildren(...values.map((v, i) => {
    const b = document.createElement("i");
    b.style.height = v + "%";
    b.style.transitionDelay = i * 35 + "ms";
    return b;
  }));
})();
