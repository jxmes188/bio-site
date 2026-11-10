/* Profile page: the owner's custom cursor + cursor trail.
   cursor.style:  default | preset (public/cursors/<name>.svg) | upload (their own file)
   Trails use the shared engine in trails.js.
   Nothing here runs on touch screens; trails also stop for "reduce motion". */
(function () {
  const C = window.CONFIG;
  const opt = C.cursor || {};
  const canvas = document.getElementById("cursor-canvas");
  const touch = matchMedia("(hover: none), (pointer: coarse)").matches;
  if (touch) { canvas.hidden = true; return; }

  // ---------- Custom cursor ----------
  const PRESET_HOT = { arrow: [4, 3], "arrow-dark": [4, 3], outline: [4, 3], soft: [5, 4], dot: [16, 16], ring: [16, 16], crosshair: [16, 16], glow: [16, 16] };
  let url = "", hot = [4, 3];
  if (opt.style === "preset" && PRESET_HOT[opt.preset]) {
    url = `/cursors/${opt.preset}.svg`;
    hot = PRESET_HOT[opt.preset];
  } else if (opt.style === "upload" && /^\/uploads\/\d+\/[a-f0-9]+\.(png|gif|webp|svg|ico|cur)$/.test(opt.image || "")) {
    url = opt.image;
    hot = opt.hotspot === "center" ? [16, 16] : [2, 2];
  }
  if (url) {
    const st = document.createElement("style");
    st.textContent = `html, body, a, button, input, label, .splash, .progress { cursor: url("${url}") ${hot[0]} ${hot[1]}, auto !important; }`;
    document.head.appendChild(st);
  }

  // ---------- Trail ----------
  if (!opt.trailOn || !window.Trails || !Trails.canRun()) { canvas.hidden = true; return; }
  const colors = opt.colorMode === "custom" ? [opt.color] : [C.theme.accent, C.theme.accent2];
  Trails.create(canvas, {
    type: opt.trail || "sparkle",
    colors: opt.trail === "snowflakes" && opt.colorMode !== "custom" ? ["#ffffff"] : colors,
    size: opt.size || 1,
    length: opt.length || 1,
    density: opt.density || 1,
    ghostImage: opt.trail === "ghost" && url ? url : "",
    ghostHot: hot
  });
})();
