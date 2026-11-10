/* Page background + animated effect layer.
   Background: color | gradient | image (incl. GIF) | video   (+ dim, blur, vignette via CSS)
   Effect on top: none | particles | stars | matrix | snow | rain   (speed, density, colour)
   The effect canvas is transparent, so it works over any background.
   Animations are time-based, so they run the same speed on 60 Hz and 120 Hz screens. */
(function () {
  const C = window.CONFIG;
  const bg = C.background;
  const fx = C.effects || { bg: "none" };
  const speed = fx.speed || 1;
  const density = fx.density || 1;
  const fxColor = fx.color || C.theme.accent;
  const base = bg.color || "#06060a";
  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  const video = document.getElementById("bg-video");
  const image = document.getElementById("bg-image");
  let w, h, dpr = 1, items = [], mouse = { x: -9999, y: -9999 };

  // ---------- Background layer ----------
  document.body.style.background = base;
  const blur = bg.blur ? `blur(${bg.blur}px)` : "";
  if (bg.type === "gradient") {
    document.body.style.background = `linear-gradient(${bg.angle ?? 135}deg, ${base}, ${bg.color2 || base}) fixed`;
  } else if (bg.type === "video" && bg.video) {
    video.src = encodeURI(bg.video);
    video.hidden = false;
    if (blur) { video.style.filter = blur; video.style.transform = "scale(1.06)"; }
  } else if (bg.type === "image" && bg.image) {
    image.style.backgroundImage = `url("${encodeURI(bg.image)}")`;
    image.hidden = false;
    if (blur) { image.style.filter = blur; image.style.transform = "scale(1.06)"; }
  }

  function hexToRgba(hex, a) {
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
  addEventListener("mousemove", e => { mouse.x = e.clientX * dpr; mouse.y = e.clientY * dpr; });

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
    for (const p of items) {
      p.x += p.vx * move; p.y += p.vy * move;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < 120 * dpr && d > 0) { p.x += (dx / d) * dpr; p.y += (dy / d) * dpr; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fill();
    }
    ctx.lineWidth = dpr;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < maxDist) {
          ctx.strokeStyle = hexToRgba(fxColor, (1 - d / maxDist) * 0.4);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
  }

  // ---------- Stars (warp) ----------
  function initStars() {
    items = Array.from({ length: Math.round(400 * density) }, () => ({
      x: (Math.random() - 0.5) * w, y: (Math.random() - 0.5) * h, z: Math.random() * w
    }));
  }
  function drawStars(dt) {
    fade(0.35);
    for (const s of items) {
      s.z -= 4 * dt * speed;
      if (s.z <= 0) { s.z = w; s.x = (Math.random() - 0.5) * w; s.y = (Math.random() - 0.5) * h; }
      const k = 128 / s.z;
      const px = s.x * k + w / 2, py = s.y * k + h / 2;
      const near = 1 - s.z / w;
      const size = near * 3 * dpr;
      ctx.fillStyle = Math.random() < 0.15 ? hexToRgba(fxColor, near) : `rgba(255,255,255,${near})`;
      ctx.fillRect(px, py, size, size);
    }
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
    ctx.strokeStyle = hexToRgba(fxColor, 0.55);
    ctx.lineWidth = dpr;
    ctx.beginPath();
    for (const d of items) {
      d.y += d.vy * dt * speed;
      if (d.y > h) { d.y = -d.len; d.x = Math.random() * w; }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 1.5 * dpr, d.y + d.len);
    }
    ctx.stroke();
  }

  const modes = {
    particles: [initParticles, drawParticles],
    stars: [initStars, drawStars],
    matrix: [initMatrix, drawMatrix],
    snow: [initSnow, drawSnow],
    rain: [initRain, drawRain]
  };
  function init() { if (modes[fx.bg]) modes[fx.bg][0](); }

  let prev = performance.now();
  function loop(now) {
    const dt = Math.min((now - prev) / 16.67, 3) || 1;  // 1 = one 60 Hz frame
    prev = now;
    modes[fx.bg][1](dt);
    requestAnimationFrame(loop);
  }

  if (modes[fx.bg]) {
    addEventListener("resize", resize);
    resize();
    requestAnimationFrame(loop);
  } else {
    canvas.hidden = true;
  }

  window.BG = { video };
})();
