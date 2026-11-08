/* Cursor trail effects: sparkle | dots | none */
(function () {
  const mode = window.CONFIG.cursor.trail;
  const canvas = document.getElementById("cursor-canvas");
  if (mode === "none" || matchMedia("(pointer: coarse)").matches) { canvas.hidden = true; return; }

  const ctx = canvas.getContext("2d");
  const { accent, accent2 } = window.CONFIG.theme;
  let parts = [];

  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener("resize", resize);
  resize();

  addEventListener("mousemove", e => {
    const n = mode === "sparkle" ? 2 : 1;
    for (let i = 0; i < n; i++) {
      parts.push({
        x: e.clientX, y: e.clientY,
        vx: (Math.random() - 0.5) * (mode === "sparkle" ? 2 : 0.3),
        vy: (Math.random() - 0.5) * (mode === "sparkle" ? 2 : 0.3) + (mode === "sparkle" ? 0.6 : 0),
        life: 1,
        size: mode === "sparkle" ? Math.random() * 3 + 1.5 : 4,
        color: Math.random() > 0.5 ? accent : accent2
      });
    }
  });

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

  (function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.025;
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      if (mode === "sparkle") star(p.x, p.y, p.size * 1.6);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  })();
})();
