/* Sign in / sign up page (/login, /signup)
   Password · email code or link · Google · Discord · forgot password ·
   picking a username after a first Google/Discord sign-in */
(function () {
  const $ = id => document.getElementById(id);
  const host = location.host;
  const qs = new URLSearchParams(location.search);
  document.querySelectorAll(".site-prefix").forEach(el => (el.textContent = host + "/"));
  document.querySelectorAll(".site-name").forEach(el => (el.textContent = host.split(":")[0]));

  // ---------- Views ----------
  const VIEWS = ["signin", "magic-code", "signup", "verify", "forgot", "reset", "claim", "busy"];
  const FOCUS = { signin: "si-login", "magic-code": "mc-code", signup: "su-username", verify: "code-input", forgot: "fp-login", reset: "rs-code", claim: "cl-username" };
  function show(name, { push } = {}) {
    for (const v of VIEWS) $("v-" + v).hidden = v !== name;
    const signupSide = name === "signup" || name === "verify";
    $("switch-signup").hidden = signupSide || name === "claim" || name === "busy";
    $("switch-signin").hidden = !signupSide;
    document.title = (signupSide ? "Sign up" : "Log in") + " · " + host.split(":")[0];
    const path = signupSide ? "/signup" : "/login";
    if (push && location.pathname !== path) history.pushState(null, "", path);
    const f = FOCUS[name] && $(FOCUS[name]);
    if (f && matchMedia("(hover: hover)").matches) setTimeout(() => f.focus(), 30);
  }
  document.addEventListener("click", e => {
    const go = e.target.closest("[data-go]");
    if (!go) return;
    e.preventDefault();
    show(go.dataset.go, { push: true });
  });
  addEventListener("popstate", () => show(location.pathname === "/signup" ? "signup" : "signin"));

  // ---------- Helpers ----------
  async function post(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong"), { data });
    return data;
  }
  function busy(btn, on) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.textContent = "Please wait…"; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  function countdown(btn, label) {
    let left = 60;
    clearInterval(btn._t);
    btn.disabled = true;
    btn.textContent = `${label} (${left}s)`;
    btn._t = setInterval(() => {
      if (--left <= 0) { clearInterval(btn._t); btn.disabled = false; btn.textContent = label; }
      else btn.textContent = `${label} (${left}s)`;
    }, 1000);
  }
  function okMsg(el, text) { el.replaceChildren(Object.assign(document.createElement("span"), { className: "ok", textContent: text })); }
  const digits = (input, onFull) => input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    if (input.value.length === 6 && onFull) onFull();
  });
  const cleanName = v => v.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
  const goDashboard = () => location.replace("/dashboard");

  // ---------- Google / Discord buttons ----------
  fetch("/api/auth/providers").then(r => r.json()).then(p => {
    document.querySelectorAll(".oauth-btn").forEach(a => {
      if (p[a.dataset.provider]) return;
      a.classList.add("off");
      a.removeAttribute("href");
      a.setAttribute("aria-disabled", "true");
      a.title = "The site owner hasn't set this up yet";
    });
  }).catch(() => {});

  // ---------- Sign in: password / email code ----------
  document.querySelectorAll("[data-method]").forEach(b => b.addEventListener("click", () => {
    const email = b.dataset.method === "email";
    document.querySelectorAll("[data-method]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", String(x === b)); });
    $("signin-form").hidden = email;
    $("magic-form").hidden = !email;
    if (email && /@/.test($("si-login").value)) $("mg-email").value = $("si-login").value;
    $(email ? "mg-email" : "si-login").focus();
  }));

  $("signin-form").addEventListener("submit", async e => {
    e.preventDefault();
    $("si-error").textContent = "";
    busy($("si-submit"), true);
    try { await post("/api/login", { login: $("si-login").value, password: $("si-password").value }); goDashboard(); }
    catch (err) { $("si-error").textContent = err.message; busy($("si-submit"), false); }
  });

  let magicId = null, magicEmail = "";
  async function sendMagic(btn, errEl) {
    errEl.textContent = "";
    busy(btn, true);
    try {
      const r = await post("/api/login/magic", { email: magicEmail });
      magicId = r.id;
      return true;
    } catch (err) { errEl.textContent = err.message; return false; }
    finally { busy(btn, false); }
  }
  $("magic-form").addEventListener("submit", async e => {
    e.preventDefault();
    magicEmail = $("mg-email").value.trim();
    if (!(await sendMagic($("mg-submit"), $("mg-error")))) return;
    $("mc-email").textContent = magicEmail;
    $("mc-code").value = ""; $("mc-error").textContent = "";
    show("magic-code");
    countdown($("mc-resend"), "Resend");
  });
  digits($("mc-code"), () => $("v-magic-code").requestSubmit());
  $("v-magic-code").addEventListener("submit", async e => {
    e.preventDefault();
    if ($("mc-code").value.length !== 6) { $("mc-error").textContent = "Enter the 6-digit code from your email"; return; }
    $("mc-error").textContent = "";
    busy($("mc-submit"), true);
    try { await post("/api/login/magic/verify", { id: magicId, code: $("mc-code").value }); goDashboard(); }
    catch (err) { $("mc-error").textContent = err.message; $("mc-code").select(); busy($("mc-submit"), false); }
  });
  $("mc-resend").addEventListener("click", async () => {
    if (await sendMagic($("mc-resend"), $("mc-error"))) { $("mc-code").value = ""; okMsg($("mc-error"), "New email sent"); countdown($("mc-resend"), "Resend"); }
  });

  // ---------- Sign up ----------
  let pendingId = null;
  function availability(input, out) {
    let timer, lastChecked = "";
    const check = async () => {
      const v = input.value;
      if (!v) { out.textContent = ""; out.className = "avail"; return; }
      if (v === lastChecked) return;
      lastChecked = v;
      try {
        const r = await (await fetch("/api/check/" + encodeURIComponent(v))).json();
        if (input.value !== v) return;
        out.textContent = r.available ? `${host}/${v} is available` : r.reason;
        out.className = "avail " + (r.available ? "ok" : "bad");
      } catch (_) { out.textContent = ""; }
    };
    input.addEventListener("input", () => {
      const v = cleanName(input.value);
      if (v !== input.value) input.value = v;
      clearTimeout(timer);
      timer = setTimeout(check, 300);
    });
    return check;
  }
  const checkSignup = availability($("su-username"), $("su-avail"));

  $("signup-form").addEventListener("submit", async e => {
    e.preventDefault();
    $("su-error").textContent = "";
    busy($("su-submit"), true);
    try {
      const r = await post("/api/signup", { username: $("su-username").value, email: $("su-email").value, password: $("su-password").value });
      pendingId = r.pendingId;
      $("code-email").textContent = r.email;
      $("code-username").textContent = `${host}/${r.username}`;
      $("code-input").value = ""; $("code-error").textContent = "";
      show("verify");
      countdown($("code-resend"), "Resend code");
    } catch (err) { $("su-error").textContent = err.message; }
    busy($("su-submit"), false);
  });
  digits($("code-input"), () => $("v-verify").requestSubmit());
  $("v-verify").addEventListener("submit", async e => {
    e.preventDefault();
    if ($("code-input").value.length !== 6) { $("code-error").textContent = "Enter the 6-digit code from your email"; return; }
    $("code-error").textContent = "";
    busy($("code-submit"), true);
    try { await post("/api/signup/verify", { pendingId, code: $("code-input").value }); goDashboard(); }
    catch (err) {
      $("code-error").textContent = err.message;
      busy($("code-submit"), false);
      if (err.data && err.data.restart) { pendingId = null; setTimeout(() => show("signup"), 1800); }
      else $("code-input").select();
    }
  });
  $("code-resend").addEventListener("click", async () => {
    $("code-error").textContent = "";
    try { await post("/api/signup/resend", { pendingId }); $("code-input").value = ""; okMsg($("code-error"), "New code sent"); countdown($("code-resend"), "Resend code"); }
    catch (err) { $("code-error").textContent = err.message; if (err.data && err.data.restart) setTimeout(() => show("signup"), 1800); }
  });
  $("code-back").addEventListener("click", () => { pendingId = null; show("signup"); });

  // ---------- Forgot password ----------
  let resetId = null;
  $("si-forgot").addEventListener("click", () => { $("fp-login").value = $("si-login").value; $("fp-error").textContent = ""; show("forgot"); });
  $("v-forgot").addEventListener("submit", async e => {
    e.preventDefault();
    const login = $("fp-login").value.trim();
    if (!login) { $("fp-error").textContent = "Enter your username or email"; return; }
    $("fp-error").textContent = "";
    busy($("fp-submit"), true);
    try {
      resetId = (await post("/api/password/forgot", { login })).resetId;
      $("rs-login").textContent = login;
      $("rs-code").value = $("rs-password").value = ""; $("rs-error").textContent = "";
      show("reset");
      countdown($("rs-resend"), "Resend code");
    } catch (err) { $("fp-error").textContent = err.message; }
    busy($("fp-submit"), false);
  });
  digits($("rs-code"), () => $("rs-password").focus());
  $("v-reset").addEventListener("submit", async e => {
    e.preventDefault();
    if ($("rs-code").value.length !== 6) { $("rs-error").textContent = "Enter the 6-digit code from your email"; return; }
    $("rs-error").textContent = "";
    busy($("rs-submit"), true);
    try { await post("/api/password/reset", { resetId, code: $("rs-code").value, password: $("rs-password").value }); goDashboard(); }
    catch (err) { $("rs-error").textContent = err.message; busy($("rs-submit"), false); }
  });
  $("rs-resend").addEventListener("click", async () => {
    $("rs-error").textContent = "";
    try { await post("/api/password/resend", { resetId }); $("rs-code").value = ""; okMsg($("rs-error"), "New code sent"); countdown($("rs-resend"), "Resend code"); }
    catch (err) { $("rs-error").textContent = err.message; }
  });

  // ---------- First Google / Discord sign-in: pick a username ----------
  let claimId = null;
  const checkClaim = availability($("cl-username"), $("cl-avail"));
  async function startClaim(id) {
    claimId = id;
    show("busy");
    $("busy-title").textContent = "One moment…";
    try {
      const r = await (await fetch("/api/oauth/pending/" + encodeURIComponent(id))).json();
      if (r.error) throw new Error(r.error);
      $("cl-provider").textContent = r.providerName;
      $("cl-email").textContent = r.email;
      $("cl-icon").innerHTML = window.UI(r.provider);
      $("cl-username").value = cleanName(r.suggestion || "");
      show("claim");
      checkClaim();
    } catch (err) { failBusy(err.message); }
  }
  $("v-claim").addEventListener("submit", async e => {
    e.preventDefault();
    $("cl-error").textContent = "";
    busy($("cl-submit"), true);
    try { await post("/api/oauth/claim", { id: claimId, username: $("cl-username").value }); goDashboard(); }
    catch (err) {
      $("cl-error").textContent = err.message;
      busy($("cl-submit"), false);
      if (err.data && err.data.restart) setTimeout(() => location.replace("/login"), 2000);
    }
  });

  function failBusy(msg) {
    show("busy");
    $("busy-title").textContent = "Couldn't sign you in";
    document.querySelector("#v-busy .spinner").hidden = true;
    $("busy-error").textContent = msg;
    $("busy-back").hidden = false;
  }

  // ---------- Errors sent back from Google / Discord ----------
  const ERRORS = {
    cancelled: "Sign-in was cancelled.",
    expired: "That sign-in took too long or was opened in another browser. Try again.",
    provider_error: "We couldn't reach the sign-in service. Try again in a minute.",
    banned: "This account has been suspended.",
    email_unverified_google: "Your Google email isn't verified yet.",
    email_unverified_discord: "Verify your email in Discord first (User Settings → My Account), then try again.",
    not_configured_google: "Google sign-in isn't set up on this site yet.",
    not_configured_discord: "Discord sign-in isn't set up on this site yet."
  };
  function notice(text) {
    const n = Object.assign(document.createElement("p"), { className: "notice bad", textContent: text, role: "alert" });
    $("v-signin").prepend(n);
  }

  // ---------- Start ----------
  if (qs.get("magic")) {
    // One-click link from the email. Sent with POST so link scanners can't use it up.
    show("busy");
    history.replaceState(null, "", "/login");
    post("/api/login/magic/verify", { link: qs.get("magic") }).then(goDashboard, err => failBusy(err.message));
  } else if (qs.get("claim")) {
    startClaim(qs.get("claim"));
    history.replaceState(null, "", "/login");
  } else {
    show(location.pathname === "/signup" ? "signup" : "signin");
    if (qs.get("error")) { notice(ERRORS[qs.get("error")] || "Sign-in didn't work. Try again."); history.replaceState(null, "", location.pathname); }
    if (qs.get("u")) { $("su-username").value = cleanName(qs.get("u")); checkSignup(); $("su-email").focus(); }
  }
})();
