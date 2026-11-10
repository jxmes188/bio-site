/* The site's own cursor (homepage, sign in, dashboard, admin):
   a crisp monochrome arrow, links keep the hand, text fields keep the text cursor,
   plus a faint spotlight that follows the mouse on pages that have one (.spotlight).
   Nothing changes on touch screens; the spotlight stays still with "reduce motion". */
(function () {
  if (matchMedia("(hover: none), (pointer: coarse)").matches) return;
  const style = document.createElement("style");
  style.textContent =
    'html, body { cursor: url("/cursors/arrow.svg") 4 3, auto; }' +
    "a, button, label, select, summary, [role=button], [role=radio], [role=tab], input[type=checkbox], input[type=range], input[type=color] { cursor: pointer; }" +
    "input:not([type=checkbox]):not([type=range]):not([type=color]), textarea { cursor: text; }" +
    "button:disabled { cursor: not-allowed; }";
  document.head.appendChild(style);

  const spot = document.querySelector(".spotlight");
  if (!spot || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let x = innerWidth / 2, y = -200, tx = x, ty = y, raf = 0;
  addEventListener("pointermove", e => {
    tx = e.clientX; ty = e.clientY;
    if (!raf) raf = requestAnimationFrame(step);
  }, { passive: true });
  function step() {
    x += (tx - x) * 0.18; y += (ty - y) * 0.18;
    spot.style.setProperty("--mx", x + "px");
    spot.style.setProperty("--my", y + "px");
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(step) : 0;
  }
})();
