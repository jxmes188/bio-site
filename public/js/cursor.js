/* Cursor / finger trail
   sparkle | dots | glow | bubbles | rainbow | ghost | fairy | hearts | snowflakes | none
   Options (from the dashboard): size, length, colour, show on phones */
(function () {
  const C = window.CONFIG;
  const opt = C.cursor || {};

  // Custom cursor picture (the user's own upload)
  if (opt.image && /^\/uploads\/\d+\/[a-f0-9]+\.(png|gif|webp)$/.test(opt.image)) {
    const st = document.createElement("style");
    st.textContent = `html, body, a, button, input, .splash { cursor: url("${opt.image}") 4 4, auto !important; }`;
    document.head.appendChild(st);
  }
  const mode = opt.trail || "sparkle";
  const canvas = document.getElementById("cursor-canvas");
  const isTouch = matchMedia("(hover: none)").matches;
  if (mode === "none" || (isTouch && opt.touch === false)) { canvas.hidden = true; return; }

  const ctx = canvas.getContext("2d");
  const size = opt.size || 1;                 // 0.5 – 3
  const length = opt.length || 1;             // 0.3 – 3
  const decay = 0.025 / length;               // longer length = slower fade
  const custom = opt.colorMode === "custom";
  const colors = custom ? [opt.color] : [C.theme.accent, C.theme.accent2];
  const pick = () => colors[(Math.random() * colors.length) | 0];
  const rainbowPick = () => `hsl(${(Math.random() * 360) | 0}, 95%, 70%)`;
  let parts = [];
  let path = [];        // recent pointer positions (rainbow + ghost)
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  let last = null, lastGhost = 0;
  function spawn(x, y) {
    const now = performance.now();
    // Fill in the gap between fast moves so the trail stays smooth
    const steps = last ? Math.min(6, Math.max(1, Math.floor(Math.hypot(x - last.x, y - last.y) / 12))) : 1;
    for (let s = 1; s <= steps; s++) {
      const px = last ? last.x + ((x - last.x) * s) / steps : x;
      const py = last ? last.y + ((y - last.y) * s) / steps : y;
      if (mode === "sparkle") {
        for (let i = 0; i < 2; i++) parts.push({ x: px, y: py, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2 + .6, life: 1, r: (Math.random() * 3 + 1.5) * size, c: pick() });
      } else if (mode === "dots") {
        parts.push({ x: px, y: py, vx: 0, vy: 0, life: 1, r: 5 * size, c: pick() });
      } else if (mode === "glow") {
        parts.push({ x: px, y: py, vx: 0, vy: 0, life: 1, r: 9 * size, c: pick() });
      } else if (mode === "bubbles") {
        if (Math.random() < .5) parts.push({ x: px, y: py, vx: (Math.random() - .5) * .6, vy: -(Math.random() * 1 + .4), life: 1, r: (Math.random() * 5 + 3) * size, c: pick() });
      } else if (mode === "rainbow") {
        path.push({ x: px, y: py, t: now });
      } else if (mode === "fairy") {
        // multicolour dust that drifts out and falls
        parts.push({ x: px, y: py, vx: (Math.random() - .5) * 2.4, vy: (Math.random() - .8) * 1.6, g: .07, life: 1, r: (Math.random() * 2.5 + 1.5) * size, c: custom ? opt.color : rainbowPick(), spin: Math.random() * 6 });
      } else if (mode === "hearts") {
        if (Math.random() < .35) parts.push({ x: px, y: py, vx: (Math.random() - .5) * .8, vy: -(Math.random() * .8 + .5), life: 1, r: (Math.random() * 5 + 6) * size, c: pick(), sway: Math.random() * 6 });
      } else if (mode === "snowflakes") {
        if (Math.random() < .3) parts.push({ x: px, y: py, vx: (Math.random() - .5) * .6, vy: Math.random() * .8 + .6, life: 1, r: (Math.random() * 8 + 10) * size, c: custom ? opt.color : "#ffffff", spin: Math.random() * 6, sway: Math.random() * 6 });
      }
    }
    // Ghost: a copy of the arrow every few pixels
    if (mode === "ghost" && (!path.length || now - lastGhost > 16)) { path.push({ x, y, t: now }); lastGhost = now; }
    last = { x, y };
  }

  addEventListener("mousemove", e => spawn(e.clientX, e.clientY));
  addEventListener("mouseleave", () => (last = null));
  addEventListener("touchstart", e => { last = null; const t = e.touches[0]; spawn(t.clientX, t.clientY); }, { passive: true });
  addEventListener("touchmove", e => { const t = e.touches[0]; spawn(t.clientX, t.clientY); }, { passive: true });
  addEventListener("touchend", () => (last = null), { passive: true });

  // ---------- shapes ----------
  function star(x, y, r, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + rot;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a + Math.PI / 4) * r * 0.35, y + Math.sin(a + Math.PI / 4) * r * 0.35);
    }
    ctx.closePath();
    ctx.fill();
  }
  function heart(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * .3);
    ctx.bezierCurveTo(x, y, x - s * .5, y, x - s * .5, y + s * .3);
    ctx.bezierCurveTo(x - s * .5, y + s * .6, x, y + s * .75, x, y + s);
    ctx.bezierCurveTo(x, y + s * .75, x + s * .5, y + s * .6, x + s * .5, y + s * .3);
    ctx.bezierCurveTo(x + s * .5, y, x, y, x, y + s * .3);
    ctx.fill();
  }
  // A classic arrow pointer, tip at (x, y)
  function arrow(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 17 * s);
    ctx.lineTo(x + 4.2 * s, y + 13 * s);
    ctx.lineTo(x + 7.2 * s, y + 19.5 * s);
    ctx.lineTo(x + 9.8 * s, y + 18.3 * s);
    ctx.lineTo(x + 6.9 * s, y + 12 * s);
    ctx.lineTo(x + 12 * s, y + 12 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ---------- path-based trails ----------
  let hue = 0;
  function drawRainbow(now, dt) {
    const maxAge = 280 * length;
    path = path.filter(p => now - p.t < maxAge);
    if (path.length < 2) return;
    hue = (hue + 4 * dt) % 360;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const k = i / path.length;                       // 0 = tail, 1 = head
      ctx.globalAlpha = k;
      ctx.lineWidth = Math.max(1, 7 * size * k);
      ctx.strokeStyle = custom ? opt.color : `hsl(${(hue + i * 9) % 360}, 95%, 62%)`;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  function drawGhost(now) {
    const maxAge = 320 * length;
    path = path.filter(p => now - p.t < maxAge);
    const fill = custom ? opt.color : "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.fillStyle = fill;
    // skip the newest copy (that's where the real cursor is)
    for (let i = 0; i < path.length - 1; i++) {
      const p = path[i];
      ctx.globalAlpha = (1 - (now - p.t) / maxAge) * .55;
      arrow(p.x, p.y, size);
    }
  }

  let prev = performance.now();
  (function loop(now) {
    const dt = Math.min((now - prev) / 16.67, 3) || 1;  // same speed on 60 Hz and 120 Hz screens
    prev = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    if (mode === "rainbow") drawRainbow(now, dt);
    else if (mode === "ghost") drawGhost(now);

    if (parts.length > 600) parts.splice(0, parts.length - 600);
    parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);

    for (const p of parts) {
      if (p.g) p.vy += p.g * dt;                          // gravity (fairy dust)
      if (p.sway !== undefined) { p.sway += .06 * dt; p.x += Math.sin(p.sway) * .5 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= decay * dt;
      const a = Math.max(p.life, 0);
      ctx.globalAlpha = a;
      ctx.fillStyle = ctx.strokeStyle = p.c;
      ctx.shadowColor = p.c;

      if (mode === "sparkle") {
        ctx.shadowBlur = 8;
        star(p.x, p.y, p.r * 1.6);
      } else if (mode === "dots") {
        ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(p.r * a, .5), 0, Math.PI * 2); ctx.fill();
      } else if (mode === "glow") {
        ctx.shadowBlur = 18 * size;
        ctx.globalAlpha = a * .5;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(p.r * a, .5), 0, Math.PI * 2); ctx.fill();
      } else if (mode === "bubbles") {
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.4 - a * .4), 0, Math.PI * 2); ctx.stroke();
      } else if (mode === "fairy") {
        ctx.shadowBlur = 6;
        p.spin += .1 * dt;
        star(p.x, p.y, p.r * (0.6 + a * 0.8), p.spin);
      } else if (mode === "hearts") {
        ctx.shadowBlur = 8;
        heart(p.x - 0, p.y - p.r / 2, p.r * (0.7 + a * 0.3));
      } else if (mode === "snowflakes") {
        ctx.shadowBlur = 6;
        p.spin += .02 * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.font = `${p.r}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("❄", 0, 0);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    requestAnimationFrame(loop);
  })(prev);
})();
