/* Cursor / finger trail: sparkle | dots | glow | bubbles | none
   Options (from the dashboard): size, length, colour, show on phones */
(function () {
  const C = window.CONFIG;
  const opt = C.cursor || {};
  const mode = opt.trail || "sparkle";
  const canvas = document.getElementById("cursor-canvas");
  const isTouch = matchMedia("(hover: none)").matches;
  if (mode === "none" || (isTouch && opt.touch === false)) { canvas.hidden = true; return; }

  const ctx = canvas.getContext("2d");
  const size = opt.size || 1;                 // 0.5 – 3
  const decay = 0.025 / (opt.length || 1);    // longer length = slower fade
  const colors = opt.colorMode === "custom" ? [opt.color] : [C.theme.accent, C.theme.accent2];
  const pick = () => colors[(Math.random() * colors.length) | 0];
  let parts = [];
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  let last = null;
  function spawn(x, y) {
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
      }
    }
    last = { x, y };
  }

  addEventListener("mousemove", e => spawn(e.clientX, e.clientY));
  addEventListener("mouseleave", () => (last = null));
  addEventListener("touchstart", e => { last = null; const t = e.touches[0]; spawn(t.clientX, t.clientY); }, { passive: true });
  addEventListener("touchmove", e => { const t = e.touches[0]; spawn(t.clientX, t.clientY); }, { passive: true });
  addEventListener("touchend", () => (last = null), { passive: true });

  function star(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a + Math.PI / 4) * r * 0.35, y + Math.sin(a + Math.PI / 4) * r * 0.35);
    }
    ctx.closePath();
    ctx.fill();
  }

  let prev = performance.now();
  (function loop(now) {
    const dt = Math.min((now - prev) / 16.67, 3) || 1;  // same speed on 60 Hz and 120 Hz screens
    prev = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (parts.length > 600) parts.splice(0, parts.length - 600);
    parts = parts.filter(p => p.life > 0);

    for (const p of parts) {
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
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    requestAnimationFrame(loop);
  })(prev);
})();
