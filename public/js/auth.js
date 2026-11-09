/* Homepage: sign up / sign in */
(function () {
  const $ = id => document.getElementById(id);
  const host = location.host;

  // Show the real domain (e.g. "yoursite.com/") everywhere
  document.querySelectorAll(".site-prefix").forEach(el => (el.textContent = host + "/"));
  document.querySelectorAll(".site-name").forEach(el => (el.textContent = host.split(":")[0]));
  document.title = host.split(":")[0] + " · claim your page";

  // ---------- Tabs ----------
  let pendingId = null;   // set after step 1 of sign up, until the code is entered

  function showTab(name) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    const codeStep = name === "signup" && pendingId;
    $("signup-form").hidden = name !== "signup" || !!codeStep;
    $("code-form").hidden = !codeStep;
    $("signin-form").hidden = name !== "signin";
    (codeStep ? $("code-input") : name === "signup" ? $("su-username") : $("si-login")).focus();
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
      const r = await post("/api/signup", {
        username: $("su-username").value,
        email: $("su-email").value,
        password: $("su-password").value
      });
      // Step 2: ask for the code from the email
      pendingId = r.pendingId;
      $("code-email").textContent = r.email;
      $("code-username").textContent = `${host}/${r.username}`;
      $("code-input").value = "";
      $("code-error").textContent = "";
      startResendTimer();
      showTab("signup");
    } catch (err) {
      $("su-error").textContent = err.message;
    }
    busy($("su-submit"), false, "Create account");
  });

  // ---------- Sign up step 2: the code ----------
  $("code-input").addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
    if (e.target.value.length === 6) $("code-form").requestSubmit();
  });

  $("code-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("code-input").value;
    if (code.length !== 6) { $("code-error").textContent = "Enter the 6-digit code from your email"; return; }
    $("code-error").textContent = "";
    busy($("code-submit"), true);
    try {
      await post("/api/signup/verify", { pendingId, code });
      location.href = "/dashboard";
    } catch (err) {
      $("code-error").textContent = err.message;
      $("code-input").select();
      busy($("code-submit"), false, "Verify & create account");
    }
  });

  let resendTimer;
  function startResendTimer() {
    const btn = $("code-resend");
    let left = 60;
    clearInterval(resendTimer);
    btn.disabled = true;
    btn.textContent = `Resend code (${left}s)`;
    resendTimer = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; btn.textContent = "Resend code"; }
      else btn.textContent = `Resend code (${left}s)`;
    }, 1000);
  }

  $("code-resend").addEventListener("click", async () => {
    $("code-error").textContent = "";
    try {
      await post("/api/signup/resend", { pendingId });
      $("code-error").textContent = "";
      $("code-input").value = "";
      startResendTimer();
      $("code-error").innerHTML = "";
      $("code-error").append(Object.assign(document.createElement("span"), { className: "ok", textContent: "New code sent ✓" }));
    } catch (err) {
      $("code-error").textContent = err.message;
    }
  });

  $("code-back").addEventListener("click", () => {
    pendingId = null;
    clearInterval(resendTimer);
    showTab("signup");
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
