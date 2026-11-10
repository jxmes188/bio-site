/* =========================================================
   Premium switch. EVERYTHING IS FREE RIGHT NOW.

   To make features premium later (no code rewrite needed):
     1. Set PREMIUM_ENABLED=true in Railway.
     2. List the setting paths that should be premium, either in
        PREMIUM_PATHS below or in the PREMIUM_FEATURES Railway setting
        (comma separated), e.g.  effects.bg,cursor.image,theme.nameFont
     3. Give a user premium by setting their plan to "premium"
        (users.plan column; an admin control can be added for this).
   Free users then keep the default value for those settings, and the
   dashboard shows them with a "PRO" tag.
   ========================================================= */

const PREMIUM_ENABLED = process.env.PREMIUM_ENABLED === "true";

// Paths of settings that become premium when PREMIUM_ENABLED is on.
const PREMIUM_PATHS = [
  // e.g. "effects.bg", "cursor.image", "theme.nameFont", "background.type"
];

const premiumPaths = [...new Set([
  ...PREMIUM_PATHS,
  ...(process.env.PREMIUM_FEATURES || "").split(",").map(s => s.trim()).filter(Boolean)
])];

const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
function set(o, path, v) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((x, k) => (x == null ? x : x[k]), o);
  if (target && typeof target === "object") target[last] = v;
}

/** Free users get the default value for premium settings (only when premium is switched on). */
function applyPlan(profile, defaults, plan) {
  if (!PREMIUM_ENABLED || plan === "premium") return profile;
  for (const p of premiumPaths) {
    const def = get(defaults, p);
    if (def !== undefined) set(profile, p, JSON.parse(JSON.stringify(def)));
  }
  return profile;
}

function featureInfo(plan) {
  return { premiumEnabled: PREMIUM_ENABLED, premiumPaths: PREMIUM_ENABLED ? premiumPaths : [], plan: plan || "free" };
}

module.exports = { applyPlan, featureInfo };
