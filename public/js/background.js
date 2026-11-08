/* Animated backgrounds: particles | stars | matrix | video | none */
(function () {
  const cfg = window.CONFIG.background;
  const accent = window.CONFIG.theme.accent;
  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  const video = document.getElementById("bg-video");
  let w, h, items = [], mouse = { x: -9999, y: -9999 };

  document.body.style.background = cfg.color;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    init();
  }

  addEventListener("mousemove", e => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    mouse.x = e.clientX * dpr;
    mouse.y = e.clientY * dpr;
  });

  // ---------- Particles (connected network) ----------
  function initParticles() {
    const count = Math.min(110, Math.floor((w * h) / 18000));
    items = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 1.8 + 0.6
    }));
  }
  function drawParticles() {
    ctx.clearRect(0, 0, w, h);
    const maxDist = 140 * (w / innerWidth);
    for (const p of items) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < 120) { p.x += dx / d; p.y += dy / d; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fill();
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < maxDist) {
          ctx.strokeStyle = hexToRgba(accent, (1 - d / maxDist) * 0.35);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
  }

  // ---------- Stars (warp) ----------
  function initStars() {
    items = Array.from({ length: 400 }, () => ({
      x: (Math.random() - 0.5) * w, y: (Math.random() - 0.5) * h, z: Math.random() * w
    }));
  }
  function drawStars() {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, w, h);
    for (const s of items) {
      s.z -= 4;
      if (s.z <= 0) { s.z = w; s.x = (Math.random() - 0.5) * w; s.y = (Math.random() - 0.5) * h; }
      const k = 128 / s.z;
      const px = s.x * k + w / 2, py = s.y * k + h / 2;
      const size = (1 - s.z / w) * 3;
      ctx.fillStyle = `rgba(255,255,255,${1 - s.z / w})`;
      ctx.fillRect(px, py, size, size);
    }
  }

  // ---------- Matrix rain ----------
  const glyphs = "アカサタナハマヤラワ0123456789ABCDEF<>/*+".split("");
  let fontSize = 16;
  function initMatrix() {
    fontSize = 16 * Math.min(window.devicePixelRatio || 1, 2);
    items = Array(Math.ceil(w / fontSize)).fill(0).map(() => Math.random() * -100);
  }
  function drawMatrix() {
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.font = fontSize + "px JetBrains Mono, monospace";
    items.forEach((y, i) => {
      const ch = glyphs[(Math.random() * glyphs.length) | 0];
      ctx.fillText(ch, i * fontSize, y * fontSize);
      items[i] = y * fontSize > h && Math.random() > 0.975 ? 0 : y + 1;
    });
  }

  const modes = {
    particles: [initParticles, drawParticles],
    stars: [initStars, drawStars],
    matrix: [initMatrix, drawMatrix]
  };

  function init() { if (modes[cfg.type]) modes[cfg.type][0](); }

  function loop() {
    modes[cfg.type][1]();
    requestAnimationFrame(loop);
  }

  function hexToRgba(hex, a) {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  if (cfg.type === "video" && cfg.video) {
    canvas.hidden = true;
    video.src = encodeURI(cfg.video);
    video.hidden = false;
  } else if (cfg.type === "image" && cfg.image) {
    canvas.hidden = true;
    document.body.style.background = `${cfg.color} url("${encodeURI(cfg.image)}") center / cover no-repeat fixed`;
  } else if (modes[cfg.type]) {
    addEventListener("resize", resize);
    resize();
    loop();
  } else {
    canvas.hidden = true;
  }

  window.BG = { video };
})();
