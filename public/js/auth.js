/* Homepage: sign up / sign in */
(function () {
  const $ = id => document.getElementById(id);
  const host = location.host;

  // Show the real domain (e.g. "yoursite.com/") everywhere
  document.querySelectorAll(".site-prefix").forEach(el => (el.textContent = host + "/"));
  document.querySelectorAll(".site-name").forEach(el => (el.textContent = host.split(":")[0]));
  document.title = host.split(":")[0] + " · claim your page";

  // ---------- Tabs ----------
  function showTab(name) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    $("signup-form").hidden = name !== "signup";
    $("signin-form").hidden = name !== "signin";
    (name === "signup" ? $("su-username") : $("si-login")).focus();
  }
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
  $("nav-signin").addEventListener("click", () => showTab("signin"));

  // ---------- Claim box -> sign up form ----------
  $("claim-form").addEventListener("submit", e => {
    e.preventDefault();
    $("su-username").value = clean($("claim-input").value);
    showTab("signup");
    checkUsername();
    $("su-email").focus();
  });

  // ---------- Username availability ----------
  const clean = v => v.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
  let checkTimer, lastChecked = "";
  $("su-username").addEventListener("input", e => {
    const v = clean(e.target.value);
    if (v !== e.target.value) e.target.value = v;
    clearTimeout(checkTimer);
    checkTimer = setTimeout(checkUsername, 300);
  });
  $("claim-input").addEventListener("input", e => { e.target.value = clean(e.target.value); });

  async function checkUsername() {
    const v = $("su-username").value;
    const out = $("su-avail");
    if (!v) { out.textContent = ""; return; }
    if (v === lastChecked) return;
    lastChecked = v;
    try {
      const r = await (await fetch("/api/check/" + encodeURIComponent(v))).json();
      if ($("su-username").value !== v) return;
      out.textContent = r.available ? `✓ ${host}/${v} is available` : `✕ ${r.reason}`;
      out.className = "avail " + (r.available ? "ok" : "bad");
    } catch (_) { out.textContent = ""; }
  }

  // ---------- Submit helpers ----------
  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    btn.textContent = on ? "Please wait…" : label;
  }

  $("signup-form").addEventListener("submit", async e => {
    e.preventDefault();
    $("su-error").textContent = "";
    busy($("su-submit"), true);
    try {
      await post("/api/signup", {
        username: $("su-username").value,
        email: $("su-email").value,
        password: $("su-password").value
      });
      location.href = "/dashboard";
    } catch (err) {
      $("su-error").textContent = err.message;
      busy($("su-submit"), false, "Create account");
    }
  });

  $("signin-form").addEventListener("submit", async e => {
    e.preventDefault();
    $("si-error").textContent = "";
    busy($("si-submit"), true);
    try {
      await post("/api/login", { login: $("si-login").value, password: $("si-password").value });
      location.href = "/dashboard";
    } catch (err) {
      $("si-error").textContent = err.message;
      busy($("si-submit"), false, "Sign in");
    }
  });

  if (location.hash === "#signin") showTab("signin");
})();
