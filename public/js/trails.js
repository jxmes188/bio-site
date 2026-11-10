/* =========================================================
   Cursor trail engine (used by profile pages and the homepage demo)

   const t = Trails.create(canvas, { type, colors, size, length, density, area, ghostImage });
   t.set({ type: "glow" });   t.destroy();

   type:    sparkle | glow | ghost | particles | ribbon | hearts | snowflakes
   colors:  ["#fff", "#aaa"]   (picked at random per particle)
   size:    0.5 – 3            length: 0.3 – 3 (how long it lasts)    density: 0.25 – 2
   area:    element to listen on (default: window). The canvas is sized to it.

   Lightweight: one canvas, requestAnimationFrame only while something is
   visible, a hard cap on particles, pre-rendered glow sprites.
   Callers decide whether to run it (touch devices / reduced motion: don't).
   ========================================================= */
(function () {
  const MAX_PARTS = 220;

  function create(canvas, options) {
    const ctx = canvas.getContext("2d");
    const area = options.area || window;
    const fixed = area === window;
    let o = {};
    let parts = [], path = [], dpr = 1, W = 0, H = 0, raf = 0, last = null, prev = 0, alive = true, spawnAcc = 0;
    let ghostImg = null;
    const sprites = new Map();

    function set(next) {
      o = { type: "sparkle", colors: ["#ffffff"], size: 1, length: 1, density: 1, ...o, ...next };
      if (!o.colors || !o.colors.length) o.colors = ["#ffffff"];
      if (next.type) { parts = []; path = []; }
      if (next.ghostImage !== undefined) {
        ghostImg = null;
        if (o.ghostImage) { const im = new Image(); im.onload = () => (ghostImg = im); im.src = o.ghostImage; }
      }
    }
    set(options);

    // ---------- sizing ----------
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = fixed ? { width: innerWidth, height: innerHeight } : area.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = !fixed && "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(area); else addEventListener("resize", resize);

    // ---------- helpers ----------
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = () => o.colors[(Math.random() * o.colors.length) | 0];
    function glowSprite(color) {
      if (sprites.has(color)) return sprites.get(color);
      const s = document.createElement("canvas");
      s.width = s.height = 64;
      const g = s.getContext("2d");
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color);
      grad.addColorStop(0.25, color + "aa");
      grad.addColorStop(1, color + "00");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      sprites.set(color, s);
      return s;
    }
    function toLocal(e) {
      if (fixed) return { x: e.clientX, y: e.clientY };
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    // ---------- spawning ----------
    function add(p) {
      parts.push(p);
      if (parts.length > MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS);
    }
    function spawnAt(x, y, speed) {
      const s = o.size, life = 1;
      switch (o.type) {
        case "sparkle":
          add({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-.4, .4), vy: rand(-.2, .5), life, r: rand(3, 6.5) * s, c: pick(), rot: rand(0, Math.PI), tw: rand(0, 6) });
          break;
        case "glow":
          add({ x, y, vx: 0, vy: 0, life, r: (14 + Math.min(speed, 30) * .25) * s, c: pick() });
          break;
        case "particles":
          add({ x, y, vx: rand(-1, 1) * (.6 + speed * .03), vy: rand(-1, 1) * (.6 + speed * .03), life, r: rand(1, 2.2) * s, c: pick(), f: .94 });
          break;
        case "hearts":
          add({ x: x + rand(-3, 3), y, vx: rand(-.25, .25), vy: rand(-.9, -.5), life, r: rand(7, 11) * s, c: pick(), sway: rand(0, 6), rot: rand(-.3, .3) });
          break;
        case "snowflakes":
          add({ x: x + rand(-4, 4), y, vx: rand(-.3, .3), vy: rand(.35, .8), life, r: rand(4, 7) * s, c: pick(), rot: rand(0, 6), spin: rand(-.02, .02), sway: rand(0, 6) });
          break;
      }
    }
    // How many particles per pixel moved, per type (scaled by density)
    const RATE = { sparkle: 1 / 14, glow: 1 / 9, particles: 1 / 5, hearts: 1 / 34, snowflakes: 1 / 30 };

    function onMove(e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const p = toLocal(e);
      const now = performance.now();
      if (o.type === "ribbon" || o.type === "ghost") {
        const lastP = path[path.length - 1];
        if (!lastP || Math.hypot(p.x - lastP.x, p.y - lastP.y) > (o.type === "ghost" ? 14 / o.density : 2)) path.push({ x: p.x, y: p.y, t: now });
        if (path.length > 80) path.shift();
      } else if (last) {
        const dist = Math.hypot(p.x - last.x, p.y - last.y);
        spawnAcc += dist * RATE[o.type] * o.density;
        let n = Math.min(Math.floor(spawnAcc), 12);
        spawnAcc -= Math.floor(spawnAcc);
        for (let i = 1; i <= n; i++) spawnAt(last.x + (p.x - last.x) * (i / n), last.y + (p.y - last.y) * (i / n), dist);
      }
      last = p;
      wake();
    }
    function onLeave() { last = null; }
    area.addEventListener("pointermove", onMove, { passive: true });
    (fixed ? document : area).addEventListener("pointerleave", onLeave);

    // ---------- shapes ----------
    function star(x, y, r, rot) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(a + Math.PI / 4) * r * .28, y + Math.sin(a + Math.PI / 4) * r * .28);
      }
      ctx.closePath(); ctx.fill();
    }
    function heart(x, y, s) {
      ctx.beginPath();
      ctx.moveTo(x, y + s * .35);
      ctx.bezierCurveTo(x, y + s * .05, x - s * .5, y - s * .05, x - s * .5, y + s * .3);
      ctx.bezierCurveTo(x - s * .5, y + s * .6, x - s * .15, y + s * .75, x, y + s * .95);
      ctx.bezierCurveTo(x + s * .15, y + s * .75, x + s * .5, y + s * .6, x + s * .5, y + s * .3);
      ctx.bezierCurveTo(x + s * .5, y - s * .05, x, y + s * .05, x, y + s * .35);
      ctx.fill();
    }
    function flake(r) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3, cx = Math.cos(a), sy = Math.sin(a);
        ctx.moveTo(0, 0); ctx.lineTo(cx * r, sy * r);
        const bx = cx * r * .55, by = sy * r * .55, b = r * .28;
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + .7) * b, by + Math.sin(a + .7) * b);
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - .7) * b, by + Math.sin(a - .7) * b);
      }
      ctx.stroke();
    }
    function arrow(x, y, s) {
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x, y + 16 * s); ctx.lineTo(x + 4 * s, y + 12.4 * s);
      ctx.lineTo(x + 6.8 * s, y + 18.4 * s); ctx.lineTo(x + 9.2 * s, y + 17.3 * s);
      ctx.lineTo(x + 6.5 * s, y + 11.4 * s); ctx.lineTo(x + 11.5 * s, y + 11.4 * s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // ---------- drawing ----------
    function drawRibbon(now) {
      const maxAge = 260 * o.length;
      path = path.filter(p => now - p.t < maxAge);
      if (path.length < 3) return path.length > 0;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      const grad = ctx.createLinearGradient(path[0].x, path[0].y, path[path.length - 1].x, path[path.length - 1].y);
      const c = o.colors;
      grad.addColorStop(0, (c[1] || c[0]) + "00");
      grad.addColorStop(1, c[0]);
      for (let i = 1; i < path.length - 1; i++) {
        const k = i / (path.length - 1);
        const a = path[i - 1], b = path[i], n = path[i + 1];
        ctx.lineWidth = Math.max(.6, 5 * o.size * k);
        ctx.strokeStyle = grad;
        ctx.globalAlpha = Math.min(1, k * 1.2) * (1 - (now - b.t) / maxAge);
        ctx.beginPath();
        ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx.quadraticCurveTo(b.x, b.y, (b.x + n.x) / 2, (b.y + n.y) / 2);
        ctx.stroke();
      }
      return true;
    }
    function drawGhost(now) {
      const maxAge = 300 * o.length;
      path = path.filter(p => now - p.t < maxAge);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,.45)";
      ctx.fillStyle = o.colors[0];
      for (let i = 0; i < path.length - 1; i++) {
        const p = path[i];
        ctx.globalAlpha = (1 - (now - p.t) / maxAge) * .35;
        if (ghostImg) {
          // Cursor files are 32×32; keep the hotspot under the pointer
          const k = .75 * o.size, [hx, hy] = o.ghostHot || [0, 0];
          ctx.drawImage(ghostImg, p.x - hx * k, p.y - hy * k, 32 * k, 32 * k);
        }
        else arrow(p.x, p.y, o.size);
      }
      return path.length > 0;
    }

    function frame(now) {
      raf = 0;
      if (!alive) return;
      const dt = Math.min((now - (prev || now)) / 16.67, 3) || 1;
      prev = now;
      ctx.clearRect(0, 0, W, H);
      let busy = false;
      if (o.type === "ribbon") busy = drawRibbon(now);
      else if (o.type === "ghost") busy = drawGhost(now);

      const decay = (o.type === "glow" ? .05 : o.type === "particles" ? .03 : .022) / o.length;
      let n = 0;
      for (const p of parts) {
        p.life -= decay * dt;
        if (p.life <= 0) continue;
        parts[n++] = p;
        if (p.f) { p.vx *= Math.pow(p.f, dt); p.vy *= Math.pow(p.f, dt); }
        if (p.sway !== undefined) { p.sway += .05 * dt; p.x += Math.sin(p.sway) * .35 * dt; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        const a = p.life;
        ctx.globalAlpha = a;
        switch (o.type) {
          case "sparkle": {
            const tw = .65 + Math.sin(now / 90 + p.tw) * .35;
            ctx.fillStyle = p.c;
            star(p.x, p.y, p.r * (.4 + a * .6) * tw, p.rot);
            ctx.globalAlpha = a * .5;
            ctx.drawImage(glowSprite(p.c), p.x - p.r * 1.6, p.y - p.r * 1.6, p.r * 3.2, p.r * 3.2);
            break;
          }
          case "glow":
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = a * a * .32;
            ctx.drawImage(glowSprite(p.c), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
            ctx.globalCompositeOperation = "source-over";
            break;
          case "particles":
            ctx.fillStyle = p.c;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (.5 + a * .5), 0, Math.PI * 2); ctx.fill();
            break;
          case "hearts": {
            const grow = Math.min(1, (1 - a) * 6);
            ctx.fillStyle = p.c;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            heart(0, -p.r / 2, p.r * (.6 + grow * .4));
            ctx.restore();
            break;
          }
          case "snowflakes":
            p.rot += p.spin * dt;
            ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(.8, p.r / 6); ctx.lineCap = "round";
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); flake(p.r); ctx.restore();
            break;
        }
      }
      parts.length = n;
      ctx.globalAlpha = 1;
      if (busy || n) wake(); else prev = 0;
    }
    function wake() { if (!raf && alive) raf = requestAnimationFrame(frame); }

    return {
      set(next) { set(next); wake(); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        area.removeEventListener("pointermove", onMove);
        (fixed ? document : area).removeEventListener("pointerleave", onLeave);
        if (ro) ro.disconnect(); else removeEventListener("resize", resize);
        ctx.clearRect(0, 0, W, H);
      }
    };
  }

  // Should trails / custom cursors run on this device at all?
  const canRun = () => !matchMedia("(hover: none), (pointer: coarse)").matches &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.Trails = { create, canRun };
})();
