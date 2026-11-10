/* Page background + animated effect layer.
   Background: color | gradient | image (incl. GIF) | video   (+ dim, blur, vignette via CSS)
   Effect on top: none | particles | stars | fireflies | snow | rain | matrix   (speed, density, colour)
   effects.interactive: the effect reacts to the mouse (particles push away and connect to it,
   stars shift with it, fireflies drift toward it, snow and rain part around it).
   "Reduce motion": one still frame, no animation.
   Animations are time-based, so they run the same speed on 60 Hz and 120 Hz screens. */
(function () {
  const C = window.CONFIG;
  const bg = C.background;
  const fx = C.effects || { bg: "none" };
  const speed = fx.speed || 1;
  const density = fx.density || 1;
  const fxColor = fx.color || C.theme.accent;
  const base = bg.color || "#06060a";
  const interactive = fx.interactive !== false && !matchMedia("(hover: none)").matches;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  const video = document.getElementById("bg-video");
  const image = document.getElementById("bg-image");
  let w, h, dpr = 1, items = [];
  const mouse = { x: -9999, y: -9999, sx: 0, sy: 0, on: false };

  // ---------- Background layer ----------
  document.body.style.background = base;
  const blur = bg.blur ? `blur(${bg.blur}px)` : "";
  if (bg.type === "gradient") {
    document.body.style.background = `linear-gradient(${bg.angle ?? 135}deg, ${base}, ${bg.color2 || base}) fixed`;
  } else if (bg.type === "video" && bg.video) {
    video.src = encodeURI(bg.video);
    video.hidden = false;
    if (blur) { video.style.filter = blur; video.style.transform = "scale(1.06)"; }
    if (still) video.removeAttribute("autoplay");
  } else if (bg.type === "image" && bg.image) {
    image.style.backgroundImage = `url("${encodeURI(bg.image)}")`;
    image.hidden = false;
    if (blur) { image.style.filter = blur; image.style.transform = "scale(1.06)"; }
  }

  function rgba(hex, a) {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // Fade what's already drawn toward transparent (keeps trails without painting over the background)
  function fade(amount) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0,0,0,${amount})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    init();
  }
  if (interactive) {
    addEventListener("pointermove", e => { mouse.x = e.clientX * dpr; mouse.y = e.clientY * dpr; mouse.on = true; }, { passive: true });
    document.addEventListener("pointerleave", () => { mouse.on = false; mouse.x = mouse.y = -9999; });
  }
  // Push a point away from the mouse (r = reach in css px)
  function repel(p, r, force) {
    if (!mouse.on) return;
    const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy), R = r * dpr;
    if (d < R && d > 0) { const k = (1 - d / R) * force * dpr; p.x += (dx / d) * k; p.y += (dy / d) * k; }
  }

  // ---------- Particles (connected network) ----------
  function initParticles() {
    const count = Math.round(Math.min(160, (innerWidth * innerHeight) / 12000) * density);
    items = Array.from({ length: Math.max(8, count) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6 * dpr, vy: (Math.random() - 0.5) * 0.6 * dpr,
      r: (Math.random() * 1.8 + 0.6) * dpr
    }));
  }
  function drawParticles(dt) {
    ctx.clearRect(0, 0, w, h);
    const maxDist = 140 * dpr, move = dt * speed;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (const p of items) {
      p.x += p.vx * move; p.y += p.vy * move;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      repel(p, 120, 2.2);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineWidth = dpr;
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < maxDist) {
          ctx.strokeStyle = rgba(fxColor, (1 - d / maxDist) * 0.4);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      // Lines to the cursor
      if (mouse.on) {
        const d = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (d < maxDist * 1.3) {
          ctx.strokeStyle = rgba(fxColor, (1 - d / (maxDist * 1.3)) * 0.5);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
    }
  }

  // ---------- Stars (warp; the centre drifts toward the mouse) ----------
  function initStars() {
    items = Array.from({ length: Math.round(400 * density) }, () => ({
      x: (Math.random() - 0.5) * w, y: (Math.random() - 0.5) * h, z: Math.random() * w
    }));
  }
  function drawStars(dt) {
    fade(0.35);
    // Ease the vanishing point toward the cursor
    const tx = mouse.on ? (mouse.x - w / 2) * -0.15 : 0, ty = mouse.on ? (mouse.y - h / 2) * -0.15 : 0;
    mouse.sx += (tx - mouse.sx) * 0.04 * dt; mouse.sy += (ty - mouse.sy) * 0.04 * dt;
    for (const s of items) {
      s.z -= 4 * dt * speed;
      if (s.z <= 0) { s.z = w; s.x = (Math.random() - 0.5) * w; s.y = (Math.random() - 0.5) * h; }
      const k = 128 / s.z;
      const px = s.x * k + w / 2 + mouse.sx * (1 - s.z / w), py = s.y * k + h / 2 + mouse.sy * (1 - s.z / w);
      const near = 1 - s.z / w;
      const size = near * 3 * dpr;
      ctx.fillStyle = Math.random() < 0.15 ? rgba(fxColor, near) : `rgba(255,255,255,${near})`;
      ctx.fillRect(px, py, size, size);
    }
  }

  // ---------- Fireflies (soft glowing dots that drift toward the mouse) ----------
  let glow = null;
  function initFireflies() {
    glow = document.createElement("canvas");
    glow.width = glow.height = 64;
    const g = glow.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(fxColor, 1)); grad.addColorStop(.2, rgba(fxColor, .6)); grad.addColorStop(1, rgba(fxColor, 0));
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    items = Array.from({ length: Math.round(46 * density) }, () => ({
      x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, a: Math.random() * 6, r: (Math.random() * 10 + 8) * dpr, t: Math.random() * 100
    }));
  }
  function drawFireflies(dt) {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const f of items) {
      f.t += 0.01 * dt * speed;
      f.vx += Math.cos(f.t * 1.3 + f.a) * 0.03 * dpr * speed;
      f.vy += Math.sin(f.t * 1.7 + f.a) * 0.03 * dpr * speed;
      if (mouse.on) {
        const dx = mouse.x - f.x, dy = mouse.y - f.y, d = Math.hypot(dx, dy);
        if (d < 260 * dpr && d > 30 * dpr) { f.vx += (dx / d) * 0.04 * dpr; f.vy += (dy / d) * 0.04 * dpr; }
      }
      f.vx *= 0.96; f.vy *= 0.96;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.x < -40) f.x = w + 40; if (f.x > w + 40) f.x = -40;
      if (f.y < -40) f.y = h + 40; if (f.y > h + 40) f.y = -40;
      ctx.globalAlpha = 0.35 + Math.sin(f.t * 4 + f.a) * 0.3;
      ctx.drawImage(glow, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  // ---------- Matrix rain ----------
  const glyphs = "アカサタナハマヤラワ0123456789ABCDEF<>/*+".split("");
  const ROWS_PER_SEC = 18;   // at speed 1
  let fontSize = 16, colW = 16, acc = 0;
  function initMatrix() {
    fontSize = 16 * dpr;
    colW = Math.max(fontSize * 0.6, fontSize / density);
    items = Array(Math.ceil(w / colW)).fill(0).map(() => Math.random() * -60);
  }
  function drawMatrix(dt) {
    acc += (dt * 16.67) / 1000;
    const step = 1 / (ROWS_PER_SEC * speed);
    let n = 0;
    while (acc >= step && n < 4) {
      acc -= step; n++;
      fade(0.1);
      ctx.fillStyle = fxColor;
      ctx.font = fontSize + "px JetBrains Mono, monospace";
      items.forEach((y, i) => {
        const ch = glyphs[(Math.random() * glyphs.length) | 0];
        ctx.fillText(ch, i * colW, y * fontSize);
        items[i] = y * fontSize > h && Math.random() > 0.975 ? 0 : y + 1;
      });
    }
    if (acc > step) acc = 0;
  }

  // ---------- Snow ----------
  function initSnow() {
    items = Array.from({ length: Math.round(140 * density) }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: (Math.random() * 2.2 + 0.8) * dpr,
      vy: (Math.random() * 0.6 + 0.4) * dpr, sway: Math.random() * Math.PI * 2
    }));
  }
  function drawSnow(dt) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const f of items) {
      f.y += f.vy * dt * speed;
      f.sway += 0.02 * dt * speed;
      f.x += Math.sin(f.sway) * 0.4 * dpr;
      repel(f, 110, 3);
      if (f.y > h + 5) { f.y = -5; f.x = Math.random() * w; }
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- Rain ----------
  function initRain() {
    items = Array.from({ length: Math.round(180 * density) }, () => ({
      x: Math.random() * w, y: Math.random() * h, len: (Math.random() * 14 + 10) * dpr, vy: (Math.random() * 6 + 9) * dpr
    }));
  }
  function drawRain(dt) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = rgba(fxColor, 0.55);
    ctx.lineWidth = dpr;
    ctx.beginPath();
    for (const d of items) {
      d.y += d.vy * dt * speed;
      repel(d, 90, 4);
      if (d.y > h) { d.y = -d.len; d.x = Math.random() * w; }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 1.5 * dpr, d.y + d.len);
    }
    ctx.stroke();
  }

  const modes = {
    particles: [initParticles, drawParticles],
    stars: [initStars, drawStars],
    fireflies: [initFireflies, drawFireflies],
    matrix: [initMatrix, drawMatrix],
    snow: [initSnow, drawSnow],
    rain: [initRain, drawRain]
  };
  function init() { if (modes[fx.bg]) modes[fx.bg][0](); }

  let prev = performance.now(), running = true;
  function loop(now) {
    const dt = Math.min((now - prev) / 16.67, 3) || 1;  // 1 = one 60 Hz frame
    prev = now;
    if (running) modes[fx.bg][1](dt);
    requestAnimationFrame(loop);
  }

  if (modes[fx.bg]) {
    addEventListener("resize", () => { resize(); if (still) stillFrame(); });
    resize();
    if (still) stillFrame();
    else {
      // Pause while the tab is hidden (saves battery)
      document.addEventListener("visibilitychange", () => { running = !document.hidden; prev = performance.now(); });
      requestAnimationFrame(loop);
    }
  } else {
    canvas.hidden = true;
  }
  // Reduce motion: draw the effect once (a few steps so trail-style effects have something to show)
  function stillFrame() { for (let i = 0; i < (fx.bg === "matrix" ? 40 : 1); i++) modes[fx.bg][1](fx.bg === "matrix" ? 3 : 0); }

  window.BG = { video };
})();
