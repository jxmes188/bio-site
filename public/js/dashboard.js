/* Dashboard: edit your profile, upload files, live preview */
(function () {
  const $ = id => document.getElementById(id);
  const host = location.host;
  let me = null;          // last data from the server
  let draft = null;       // profile being edited
  let savedJson = "";     // to detect unsaved changes

  const SOCIALS = {
    discord: "Discord", github: "GitHub", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram",
    x: "X", spotify: "Spotify", steam: "Steam", twitch: "Twitch", link: "Website"
  };
  const LINK_ICONS = { link: "Link", heart: "Heart", star: "Star", bolt: "Bolt", fire: "Fire", code: "Code", crown: "Crown" };

  // ---------- tiny helpers ----------
  const clone = o => JSON.parse(JSON.stringify(o));
  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const set = (obj, path, val) => {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((o, k) => (o[k] = o[k] || {}), obj)[last] = val;
  };
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  }
  const icon = d => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.innerHTML = `<path d="${d}"/>`; return s; };
  const I_UP = "M7 14l5-5 5 5z", I_DOWN = "M7 10l5 5 5-5z", I_X = "M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z";
  const fmtMB = b => (b / 1048576).toFixed(1) + " MB";

  let toastTimer;
  function toast(msg, isError) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (isError ? " error" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) { location.href = "/#signin"; throw new Error("Signed out"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  // ---------- Load ----------
  async function init() {
    document.querySelectorAll(".site-name").forEach(el => (el.textContent = host.split(":")[0]));
    try { applyMe(await api("GET", "/api/me")); }
    catch (e) { toast(e.message, true); return; }
    bindInputs();
    reloadPreview();
    if (new URLSearchParams(location.search).get("verified") === "1") {
      toast("Email confirmed ✓ Your page is live!");
      history.replaceState(null, "", "/dashboard");
    }
  }

  function applyMe(data) {
    me = data;
    draft = clone(me.profile);
    savedJson = JSON.stringify(draft);
    const url = `${location.origin}/${me.username}`;
    $("my-link").textContent = `${host}/${me.username}`;
    $("my-link").href = url;
    $("open-page").href = url;
    $("views").textContent = me.views.toLocaleString();
    $("acct-user").textContent = me.username;
    $("acct-email").textContent = me.email;
    const used = me.files.reduce((s, f) => s + f.size, 0);
    $("acct-storage").textContent = `${fmtMB(used)} of ${fmtMB(me.quota)}`;
    document.title = `Dashboard · ${me.username}`;
    renderVerify();
    renderAll();
    updateDirty();
  }

  // ---------- Simple fields (data-path) ----------
  function bindInputs() {
    document.querySelectorAll("[data-path]").forEach(el => {
      const evt = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evt, () => {
        let v;
        if (el.type === "checkbox") v = el.checked;
        else if (el.dataset.type === "number") v = parseFloat(el.value);
        else if (el.dataset.type === "lines") v = el.value.split("\n").slice(0, 8);
        else v = el.value;
        set(draft, el.dataset.path, v);
        if (el.dataset.path.startsWith("discord.")) checkDiscordSoon();
        if (el.dataset.path === "background.type") renderBackground();
        renderLabels();
        updateDirty();
      });
    });
  }

  function renderFields() {
    document.querySelectorAll("[data-path]").forEach(el => {
      const v = get(draft, el.dataset.path);
      if (el.type === "checkbox") el.checked = !!v;
      else if (el.dataset.type === "lines") el.value = (v || []).join("\n");
      else el.value = v ?? "";
    });
  }

  const FMT = {
    x: v => String(+(+v).toFixed(2)) + "×",
    "%": v => Math.round(v * 100) + "%",
    px: v => Math.round(v) + "px",
    deg: v => Math.round(v) + "°"
  };
  function renderLabels() {
    $("vol-val").textContent = Math.round(draft.music.volume * 100) + "%";
    $("op-val").textContent = Math.round(draft.theme.cardOpacity * 100) + "%";
    $("blur-val").textContent = draft.theme.blur + "px";
    document.querySelectorAll("[data-val]").forEach(el => {
      const v = get(draft, el.dataset.val);
      el.textContent = v == null ? "" : FMT[el.dataset.fmt](v);
    });
    $("manual-presence").hidden = draft.discord.enabled;

    // Only show options that apply to what's currently picked
    const bg = draft.background.type;
    $("bg-anim-opts").hidden = !["particles", "stars", "matrix"].includes(bg);
    $("bg-blur-wrap").hidden = !["image", "video"].includes(bg);
    $("tilt-strength-wrap").hidden = !draft.theme.tilt;
    $("type-speed-wrap").hidden = !draft.theme.typewriter;
    const trailOn = draft.cursor.trail !== "none";
    document.querySelectorAll("[data-cursor-opt]").forEach(el => (el.hidden = !trailOn));
    $("cursor-color-wrap").hidden = !trailOn || draft.cursor.colorMode !== "custom";
  }

  // ---------- Email confirmation banner ----------
  function renderVerify() {
    $("verify-banner").hidden = me.emailVerified;
    $("vb-email").textContent = me.email;
  }
  $("vb-resend").addEventListener("click", async () => {
    const msg = $("vb-msg");
    $("vb-resend").disabled = true;
    try {
      applyMe(await api("POST", "/api/me/resend-verification"));
      msg.textContent = "Sent ✓ Check your inbox (and spam folder).";
      msg.className = "hint ok";
    } catch (e) { msg.textContent = e.message; msg.className = "hint bad"; }
    setTimeout(() => ($("vb-resend").disabled = false), 5000);
  });
  $("vb-change").addEventListener("click", () => {
    $("vb-form").hidden = !$("vb-form").hidden;
    if (!$("vb-form").hidden) $("vb-new-email").focus();
  });
  $("vb-form").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("vb-msg");
    try {
      applyMe(await api("POST", "/api/me/email", { email: $("vb-new-email").value }));
      $("vb-form").hidden = true;
      msg.textContent = "Email updated. We sent a new link ✓";
      msg.className = "hint ok";
    } catch (err) { msg.textContent = err.message; msg.className = "hint bad"; }
  });

  // ---------- Images ----------
  function renderImages() {
    $("avatar-preview").src = draft.avatar || "/img/avatar.svg";
    $("banner-preview").style.backgroundImage = draft.banner ? `url("${encodeURI(draft.banner)}")` : "";
    document.querySelector('[data-remove="avatar"]').hidden = !draft.avatar;
    document.querySelector('[data-remove="banner"]').hidden = !draft.banner;
  }

  // ---------- Background ----------
  function renderBackground() {
    const type = draft.background.type;
    document.querySelectorAll("#bg-types button").forEach(b => b.classList.toggle("active", b.dataset.bg === type));
    $("bg-upload-wrap").hidden = !(type === "image" || type === "video");
    const f = me.files.find(f => f.kind === "background");
    document.querySelector('[data-remove="background"]').hidden = !f;
    $("bg-file-name").textContent = f ? `Current: ${f.name}` : "Images up to 30 MB, or MP4 / WEBM video";
  }
  $("bg-types").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    draft.background.type = b.dataset.bg;
    if ((b.dataset.bg === "image" || b.dataset.bg === "video") && !draft.background.url)
      toast("Upload an image or video below to use as your background");
    renderBackground();
    renderLabels();
    updateDirty();
  });

  // ---------- Tracks ----------
  function renderTracks() {
    const list = $("track-list");
    list.replaceChildren(...draft.music.tracks.map((t, i) => h("li", { class: "list-row" },
      h("span", { class: "track-num" }, String(i + 1)),
      h("input", {
        class: "input grow", value: t.title, maxlength: "80", "aria-label": "Song title",
        oninput: e => { t.title = e.target.value; updateDirty(); }
      }),
      h("div", { class: "row-btns" },
        h("button", { class: "btn btn-ghost btn-icon", title: "Move up", disabled: i === 0, onclick: () => move(draft.music.tracks, i, -1, renderTracks) }, icon(I_UP)),
        h("button", { class: "btn btn-ghost btn-icon", title: "Move down", disabled: i === draft.music.tracks.length - 1, onclick: () => move(draft.music.tracks, i, 1, renderTracks) }, icon(I_DOWN)),
        h("button", { class: "btn btn-danger btn-icon", title: "Delete song", onclick: () => deleteFile(t.id, `Delete "${t.title}"?`) }, icon(I_X))
      )
    )));
  }

  function move(arr, i, d, rerender) {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    rerender();
    updateDirty();
  }

  // ---------- Socials ----------
  function renderSocials() {
    $("social-list").replaceChildren(...draft.socials.map((s, i) => h("li", { class: "list-row" },
      h("select", {
        class: "input", "aria-label": "Platform",
        onchange: e => { s.icon = e.target.value; s.label = SOCIALS[s.icon]; if (s.icon === "discord") s.copy = true; renderSocials(); updateDirty(); }
      }, Object.entries(SOCIALS).map(([k, label]) => h("option", { value: k, selected: k === s.icon }, label))),
      h("input", {
        class: "input grow", value: s.url, maxlength: "500",
        placeholder: s.copy ? "username (copied on click)" : "https://…",
        "aria-label": "Link or username",
        oninput: e => { s.url = e.target.value; updateDirty(); }
      }),
      h("label", { class: "check", title: "Clicking copies this text instead of opening a link" },
        h("input", { type: "checkbox", checked: !!s.copy, onchange: e => { s.copy = e.target.checked; renderSocials(); updateDirty(); } }),
        "copy"),
      h("div", { class: "row-btns" },
        h("button", { class: "btn btn-ghost btn-icon", title: "Move up", disabled: i === 0, onclick: () => move(draft.socials, i, -1, renderSocials) }, icon(I_UP)),
        h("button", { class: "btn btn-danger btn-icon", title: "Remove", onclick: () => { draft.socials.splice(i, 1); renderSocials(); updateDirty(); } }, icon(I_X))
      )
    )));
  }
  $("add-social").addEventListener("click", () => {
    if (draft.socials.length >= 12) return toast("You can add up to 12 socials", true);
    const used = new Set(draft.socials.map(s => s.icon));
    const next = Object.keys(SOCIALS).find(k => !used.has(k)) || "link";
    draft.socials.push({ icon: next, url: "", copy: next === "discord", label: SOCIALS[next] });
    renderSocials();
    updateDirty();
    $("social-list").lastElementChild.querySelector("input").focus();
  });

  // ---------- Links ----------
  function renderLinks() {
    $("link-list").replaceChildren(...draft.links.map((l, i) => h("li", { class: "list-row" },
      h("select", { class: "input", "aria-label": "Icon", onchange: e => { l.icon = e.target.value; updateDirty(); } },
        Object.entries(LINK_ICONS).map(([k, label]) => h("option", { value: k, selected: k === l.icon }, label))),
      h("input", { class: "input grow", value: l.title, placeholder: "Button text", maxlength: "50", oninput: e => { l.title = e.target.value; updateDirty(); } }),
      h("input", { class: "input grow", value: l.url, placeholder: "https://…", maxlength: "500", oninput: e => { l.url = e.target.value; updateDirty(); } }),
      h("div", { class: "row-btns" },
        h("button", { class: "btn btn-ghost btn-icon", title: "Move up", disabled: i === 0, onclick: () => move(draft.links, i, -1, renderLinks) }, icon(I_UP)),
        h("button", { class: "btn btn-danger btn-icon", title: "Remove", onclick: () => { draft.links.splice(i, 1); renderLinks(); updateDirty(); } }, icon(I_X))
      )
    )));
  }
  $("add-link").addEventListener("click", () => {
    if (draft.links.length >= 10) return toast("You can add up to 10 links", true);
    draft.links.push({ title: "", url: "", icon: "link" });
    renderLinks();
    updateDirty();
    $("link-list").lastElementChild.querySelectorAll("input")[0].focus();
  });

  function renderAll() {
    renderFields();
    renderLabels();
    renderImages();
    renderBackground();
    renderTracks();
    renderSocials();
    renderLinks();
    checkDiscordSoon();
  }

  // ---------- Save / discard ----------
  const isDirty = () => draft && JSON.stringify(draft) !== savedJson;
  function updateDirty() {
    const d = isDirty();
    $("savebar").classList.toggle("dirty", d);
    $("save-status").textContent = d ? "You have unsaved changes" : "All changes saved";
    $("save").disabled = !d;
    $("discard").hidden = !d;
  }

  async function save(quiet) {
    if (!isDirty()) return;
    $("save").disabled = true;
    $("save").textContent = "Saving…";
    try {
      // Drop empty rows before sending
      const out = clone(draft);
      out.socials = out.socials.filter(s => s.url.trim());
      out.links = out.links.filter(l => l.title.trim() && l.url.trim());
      const sent = out.socials.length + out.links.length;
      applyMe(await api("PUT", "/api/me/profile", out));
      // The server drops links that aren't valid http(s) URLs; let the user know
      const kept = me.profile.socials.length + me.profile.links.length;
      if (!quiet) toast(kept < sent ? "Saved. Some links were removed because they weren't valid https:// URLs." : "Saved ✓");
      reloadPreview();
    } catch (e) {
      toast(e.message, true);
      updateDirty();
    } finally {
      $("save").textContent = "Save changes";
    }
  }
  $("save").addEventListener("click", () => save());
  $("discard").addEventListener("click", () => { draft = clone(me.profile); renderAll(); updateDirty(); });
  addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
  });
  addEventListener("beforeunload", e => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- Uploads ----------
  function uploadOne(kind, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      fd.append("file", file);
      xhr.open("POST", "/api/me/upload/" + kind);
      xhr.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status === 401) location.href = "/#signin";
        xhr.status < 300 ? resolve(data) : reject(new Error(data.error || "Upload failed"));
      };
      xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
      xhr.send(fd);
    });
  }

  document.querySelectorAll("[data-upload]").forEach(input => {
    input.addEventListener("change", async () => {
      const kind = input.dataset.upload;
      const files = [...input.files];
      input.value = "";
      if (!files.length) return;
      await save(true); // keep unsaved edits before the server updates the profile

      const bar = $("upload-progress"), fill = bar.querySelector(".progress-fill"), label = bar.querySelector("span");
      bar.hidden = false;
      for (const [n, file] of files.entries()) {
        label.textContent = `Uploading ${file.name}${files.length > 1 ? ` (${n + 1}/${files.length})` : ""}`;
        try {
          applyMe(await uploadOne(kind, file, p => {
            fill.style.width = Math.round(p * 100) + "%";
            if (p >= 1) label.textContent = "Processing…";
          }));
          toast("Uploaded ✓");
        } catch (e) {
          toast(`${file.name}: ${e.message}`, true);
        }
        fill.style.width = "0";
      }
      bar.hidden = true;
      reloadPreview();
    });
  });

  async function deleteFile(id, question) {
    if (!id) return;
    // confirm() is fine here, but keep it optional in case dialogs are blocked
    if (question && typeof confirm === "function" && !confirm(question)) return;
    await save(true);
    try {
      applyMe(await api("DELETE", "/api/me/files/" + encodeURIComponent(id)));
      reloadPreview();
      toast("Removed");
    } catch (e) { toast(e.message, true); }
  }
  document.querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", () => {
    const f = me.files.find(f => f.kind === btn.dataset.remove);
    if (f) deleteFile(f.id);
  }));

  // ---------- Discord check (via Lanyard) ----------
  let discordTimer;
  function checkDiscordSoon() { clearTimeout(discordTimer); discordTimer = setTimeout(checkDiscord, 500); }
  async function checkDiscord() {
    const out = $("discord-check");
    const id = (draft.discord.userId || "").trim();
    if (!draft.discord.enabled) { out.textContent = ""; return; }
    if (!/^\d{15,21}$/.test(id)) { out.textContent = id ? "✕ A Discord user ID is 17–20 digits long" : ""; out.className = "discord-check bad"; return; }
    out.textContent = "Checking…"; out.className = "discord-check";
    try {
      const r = await (await fetch("https://api.lanyard.rest/v1/users/" + id)).json();
      if (id !== (draft.discord.userId || "").trim()) return;
      if (r.success) {
        const u = r.data.discord_user;
        out.textContent = `✓ Connected as ${u.global_name || u.username} (@${u.username}) · ${r.data.discord_status}`;
        out.className = "discord-check ok";
      } else {
        out.textContent = "✕ Not found. Join discord.gg/lanyard with this account, then wait a minute.";
        out.className = "discord-check bad";
      }
    } catch (_) { out.textContent = "Couldn't reach Lanyard right now."; out.className = "discord-check"; }
  }

  // ---------- Preview / top bar ----------
  function reloadPreview() {
    if (me) $("preview-frame").src = `/${me.username}?preview=1&t=${Date.now()}`;
  }

  $("copy-link").addEventListener("click", () => {
    const url = `${location.origin}/${me.username}`;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
      .then(() => toast("Link copied ✓"), () => toast(url));
  });

  $("logout").addEventListener("click", async () => {
    if (isDirty() && typeof confirm === "function" && !confirm("You have unsaved changes. Sign out anyway?")) return;
    savedJson = JSON.stringify(draft); // skip the leave warning
    await api("POST", "/api/logout").catch(() => {});
    location.href = "/";
  });

  $("pw-form").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("pw-msg");
    try {
      await api("POST", "/api/me/password", { current: $("pw-current").value, next: $("pw-next").value });
      msg.textContent = "Password changed ✓"; msg.className = "hint ok";
      $("pw-current").value = $("pw-next").value = "";
    } catch (err) { msg.textContent = err.message; msg.className = "hint bad"; }
  });

  init();
})();
