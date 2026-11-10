/* =========================================================
   Dashboard (v2)
   - Built from DASH_SCHEMA (settings list + templates)
   - Autosave, undo/redo, reset section, search, advanced toggle
   - Instant live preview (unsaved changes are posted into the preview)
   ========================================================= */
(function () {
  const { SECTIONS, SETTINGS, TEMPLATES, LOOK_PATHS } = window.DASH_SCHEMA;
  const $ = id => document.getElementById(id);
  const host = location.host;

  let me = null;            // last server response
  let draft = null;         // profile being edited
  let savedJson = "";       // what the server has
  let section = "profile";
  let undoStack = [], future = [];
  let lastPushKey = "", lastPushAt = 0;
  const advanced = loadAdv();

  const SUBTITLES = {
    profile: "Your picture, name and bio.",
    appearance: "Templates, background, colours, card and fonts.",
    effects: "Animated background, cursor trail, entrance and the enter screen.",
    links: "Social icons and link buttons. Drag ⠿ to reorder.",
    audio: "Music that plays on your page.",
    discord: "Live Discord status, badges and the view counter.",
    analytics: "How your page is doing.",
    account: "Your link, dashboard look, password and account."
  };
  const SOCIALS = { discord: "Discord", github: "GitHub", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", x: "X", spotify: "Spotify", steam: "Steam", twitch: "Twitch", link: "Website" };
  const SOCIAL_PH = {
    discord: "Server invite, e.g. https://discord.gg/abc123", github: "https://github.com/you", youtube: "https://youtube.com/@you",
    tiktok: "https://tiktok.com/@you", instagram: "https://instagram.com/you", x: "https://x.com/you", spotify: "https://open.spotify.com/…",
    steam: "https://steamcommunity.com/id/you", twitch: "https://twitch.tv/you", link: "https://yoursite.com"
  };
  const LINK_ICONS = { link: "Link", heart: "Heart", star: "Star", bolt: "Bolt", fire: "Fire", code: "Code", crown: "Crown" };
  const PRESETS = [["arrow", "Arrow"], ["arrow-dark", "Dark"], ["outline", "Outline"], ["soft", "Soft"], ["dot", "Dot"], ["ring", "Ring"], ["crosshair", "Cross"], ["glow", "Glow"]];

  // ---------- helpers ----------
  const clone = o => JSON.parse(JSON.stringify(o));
  const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
  function set(o, path, v) {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((x, k) => (x[k] = x[k] || {}), o)[last] = v;
  }
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;             // only our own icon SVG strings
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const icon = name => h("span", { class: "ico", html: UI(name) });
  const FMT = {
    x: v => String(+(+v).toFixed(2)) + "×",
    "%": v => Math.round(v * 100) + "%",
    px: v => Math.round(v) + "px",
    deg: v => Math.round(v) + "°"
  };
  const fmtMB = b => (b / 1048576).toFixed(1) + " MB";

  let toastTimer;
  function toast(msg, isError) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (isError ? " error" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3000);
  }

  function confirmBox(text, yes = "Confirm") {
    return new Promise(resolve => {
      $("dialog-text").textContent = text;
      $("dialog-yes").textContent = yes;
      $("dialog").hidden = false;
      $("dialog-yes").focus();
      const done = v => { $("dialog").hidden = true; $("dialog-yes").onclick = $("dialog-no").onclick = null; resolve(v); };
      $("dialog-yes").onclick = () => done(true);
      $("dialog-no").onclick = () => done(false);
    });
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) { location.href = "/login"; throw new Error("Signed out"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  function loadAdv() { try { return JSON.parse(localStorage.getItem("dash-adv") || "{}"); } catch { return {}; } }
  function storeAdv() { try { localStorage.setItem("dash-adv", JSON.stringify(advanced)); } catch {} }
  const isAdv = id => advanced[id] ?? (me && me.prefs.advanced) ?? false;

  const isLocked = path => {
    const f = me && me.features;
    return !!(f && f.premiumEnabled && f.plan !== "premium" && f.premiumPaths.includes(path));
  };

  // ---------- Start ----------
  async function init() {
    document.querySelectorAll(".site-name").forEach(el => (el.textContent = host.split(":")[0]));
    try { me = await api("GET", "/api/me"); }
    catch (e) { toast(e.message, true); return; }
    draft = clone(me.profile);
    savedJson = JSON.stringify(draft);
    applyPrefs(me.prefs);
    buildNav();
    updateIdentity();
    const fromHash = location.hash.slice(1);
    showSection(SECTIONS.some(s => s.id === fromHash) ? fromHash : "profile");
    refreshPreview();
    // Coming back from linking Google / Discord
    const q = new URLSearchParams(location.search);
    const NAMES = { google: "Google", discord: "Discord" };
    if (q.get("linked")) toast(`${NAMES[q.get("linked")] || "Account"} connected ✓`);
    if (q.get("link_error")) toast(`That ${NAMES[q.get("link_error").split("_")[0]] || ""} account is already linked to a different page.`, true);
    if (location.search) history.replaceState(null, "", location.pathname + location.hash);
  }

  function updateIdentity() {
    const url = `${location.origin}/${me.username}`;
    $("side-name").textContent = draft.displayName || me.username;
    $("side-link").textContent = `${host}/${me.username}`;
    $("side-page").href = url;
    $("open-page").href = url;
    $("side-avatar").src = draft.avatar || "/img/avatar.svg";
    $("admin-link").hidden = !me.isAdmin;
    document.title = `Dashboard · ${me.username}`;
  }

  // ---------- Dashboard look (dark / light / match device; always monochrome) ----------
  function applyPrefs(p) {
    const dark = p.theme === "dark" || (p.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    $("theme-toggle").innerHTML = UI(dark ? "sun" : "moon");
  }
  async function savePrefs(patch) {
    me.prefs = { ...me.prefs, ...patch };
    applyPrefs(me.prefs);
    try { me.prefs = (await api("PUT", "/api/me/prefs", patch)).prefs; } catch (e) { toast(e.message, true); }
  }
  $("theme-toggle").addEventListener("click", () => savePrefs({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }));

  // ---------- Navigation ----------
  function buildNav() {
    $("side-nav").replaceChildren(...SECTIONS.map(s => h("button", { class: "nav-item", "data-sec": s.id, onclick: () => showSection(s.id) },
      icon(s.icon), s.label)));
    $("tabbar").replaceChildren(...SECTIONS.map(s => h("button", { class: "tab", "data-sec": s.id, onclick: () => showSection(s.id) },
      icon(s.icon), h("span", {}, s.short || s.label))));
  }

  function showSection(id) {
    section = id;
    if (location.hash.slice(1) !== id) window.history.replaceState(null, "", "#" + id);
    document.querySelectorAll("[data-sec]").forEach(b => b.classList.toggle("active", b.dataset.sec === id));
    const sec = SECTIONS.find(s => s.id === id);
    $("section-title").textContent = sec.label;
    $("section-sub").textContent = SUBTITLES[id] || "";
    $("adv-switch").hidden = !!sec.noAdvanced || !SETTINGS.some(s => s.section === id && s.adv);
    $("reset-section").hidden = !!sec.noAdvanced;
    $("adv-toggle").checked = isAdv(id);
    render();
    const activeTab = $("tabbar").querySelector(".active");
    if (activeTab) activeTab.scrollIntoView({ inline: "center", block: "nearest" });
    window.scrollTo({ top: 0 });
  }

  addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (id !== section && SECTIONS.some(s => s.id === id)) showSection(id);
  });

  $("adv-toggle").addEventListener("change", e => { advanced[section] = e.target.checked; storeAdv(); render(); });

  // ---------- Rendering ----------
  function render() {
    const items = SETTINGS.filter(s => s.section === section)
      .filter(s => !s.adv || isAdv(section))
      .filter(s => !s.show || s.show(draft));
    const groups = [];
    for (const s of items) {
      let g = groups.find(x => x.name === s.group);
      if (!g) groups.push(g = { name: s.group, items: [] });
      g.items.push(s);
    }
    $("content").replaceChildren(...groups.map(g => h("section", { class: "group" },
      g.name ? h("h2", {}, g.name) : null,
      ...g.items.map(control)
    )));
  }

  const keyOf = s => s.path || "block:" + s.block;

  function control(s) {
    if (s.type === "block") {
      const el = BLOCKS[s.block](s);
      el.dataset.key = keyOf(s);
      return el;
    }
    const v = get(draft, s.path);
    const locked = isLocked(s.path);
    const label = h("span", { class: "field-label" }, s.label, locked ? h("span", { class: "pro" }, "PRO") : null);
    const wrap = h("div", { class: "field" + (locked ? " locked" : ""), "data-key": s.path });

    const commit = (val, rerender) => change(s.path, val, rerender);

    if (s.type === "toggle") {
      wrap.classList.add("toggle-field");
      wrap.append(h("label", { class: "switch" },
        h("input", { type: "checkbox", checked: !!v, onchange: e => commit(e.target.checked, true) }),
        h("span"), s.label));
      if (locked) wrap.append(h("span", { class: "pro" }, "PRO"));
      return s.hint ? h("div", { class: "field", "data-key": s.path }, wrap, h("span", { class: "hint" }, s.hint)) : wrap;
    }

    wrap.append(label);
    if (s.type === "text") {
      wrap.append(h("input", { class: "input", value: v ?? "", maxlength: String(s.max || 200), placeholder: s.placeholder || "",
        inputmode: s.inputmode || null, oninput: e => commit(e.target.value, false) }));
    } else if (s.type === "lines") {
      wrap.append(h("textarea", { class: "input", rows: "3", placeholder: "welcome to my page", oninput: e => commit(e.target.value.split("\n").slice(0, 8), false) },
        (v || []).join("\n")));
    } else if (s.type === "select") {
      wrap.append(h("select", { class: "input", onchange: e => commit(e.target.value, true) },
        s.options.map(([val, txt]) => h("option", { value: val, selected: val === v }, txt))));
    } else if (s.type === "segmented") {
      wrap.append(h("div", { class: "seg", role: "radiogroup", "aria-label": s.label },
        s.options.map(([val, txt]) => h("button", { type: "button", class: val === v ? "on" : "", role: "radio", "aria-checked": String(val === v),
          onclick: () => commit(val, true) }, txt))));
    } else if (s.type === "range") {
      const out = h("span", { class: "val" }, FMT[s.fmt] ? FMT[s.fmt](v) : String(v));
      label.append(out);
      wrap.append(h("input", { type: "range", min: String(s.min), max: String(s.max), step: String(s.step), value: String(v), "aria-label": s.label,
        oninput: e => { const n = parseFloat(e.target.value); out.textContent = FMT[s.fmt] ? FMT[s.fmt](n) : String(n); commit(n, false); },
        onchange: e => { if (s.path === "theme.cardBorder") render(); } }));
    } else if (s.type === "color") {
      const text = h("input", { class: "input", value: v, maxlength: "7", "aria-label": s.label + " hex",
        onchange: e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { picker.value = e.target.value; commit(e.target.value.toLowerCase(), false); } else e.target.value = get(draft, s.path); } });
      const picker = h("input", { type: "color", value: v, "aria-label": s.label, oninput: e => { text.value = e.target.value; commit(e.target.value, false); } });
      wrap.append(h("div", { class: "color-row" }, picker, text));
    }
    if (s.hint) wrap.append(h("span", { class: "hint" }, s.hint));
    return wrap;
  }

  // ---------- Changes, undoStack, autosave ----------
  function pushHistory(key) {
    const now = Date.now();
    // Typing or dragging a slider on the same setting counts as one undo step
    if (key && key === lastPushKey && now - lastPushAt < 1200) { lastPushAt = now; return; }
    undoStack.push(JSON.stringify(draft));
    if (undoStack.length > 100) undoStack.shift();
    future = [];
    lastPushKey = key; lastPushAt = now;
    updateUndo();
  }
  function change(path, value, rerender) {
    pushHistory(path);
    set(draft, path, value);
    if (LOOK_PATHS.includes(path)) draft.template = "custom";
    afterChange(rerender);
  }
  function afterChange(rerender) {
    if (rerender) render();
    updateIdentity();
    scheduleSave();
    schedulePreview();
  }
  function updateUndo() { $("undo").disabled = !undoStack.length; $("redo").disabled = !future.length; }
  function undo() {
    if (!undoStack.length) return;
    future.push(JSON.stringify(draft));
    draft = JSON.parse(undoStack.pop());
    lastPushKey = "";
    updateUndo(); afterChange(true);
  }
  function redo() {
    if (!future.length) return;
    undoStack.push(JSON.stringify(draft));
    draft = JSON.parse(future.pop());
    lastPushKey = "";
    updateUndo(); afterChange(true);
  }
  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);

  $("reset-section").addEventListener("click", async () => {
    const sec = SECTIONS.find(s => s.id === section);
    if (!(await confirmBox(`Reset all ${sec.label} settings to default? Your text, links and uploads are kept. You can undo this.`, "Reset"))) return;
    pushHistory("reset:" + section);
    for (const s of SETTINGS) if (s.section === section && s.path && !s.content) set(draft, s.path, clone(get(me.defaults, s.path)));
    afterChange(true);
    toast(`${sec.label} reset to default`);
  });

  // Autosave
  let saveTimer = null, saving = null, saveError = false;
  function setSaveState(state, text) {
    const el = $("save-state");
    el.className = "save-state " + state;
    el.querySelector("span").textContent = text;
  }
  function cleaned() {
    const out = clone(draft);
    out.socials = (out.socials || []).filter(s => (s.url || "").trim());
    out.links = (out.links || []).filter(l => (l.title || "").trim() && (l.url || "").trim());
    out.bio = (out.bio || []).filter(l => l.trim());
    return out;
  }
  function scheduleSave() {
    if (JSON.stringify(cleaned()) === savedJson) { if (!saving) setSaveState("", "Saved"); return; }
    setSaveState("saving", "Saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 800);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    if (saving) { await saving; }
    const body = cleaned();
    const bodyJson = JSON.stringify(body);
    if (bodyJson === savedJson) { setSaveState("", "Saved"); return; }
    const draftAtSend = JSON.stringify(draft);
    setSaveState("saving", "Saving…");
    saving = (async () => {
      try {
        me = await api("PUT", "/api/me/profile", body);
        savedJson = JSON.stringify(me.profile);
        saveError = false;
        // Nothing typed since we sent it: adopt what the server kept (e.g. invalid links removed)
        if (JSON.stringify(draft) === draftAtSend && savedJson !== bodyJson) {
          const dropped = body.socials.length + body.links.length - me.profile.socials.length - me.profile.links.length;
          draft = clone(me.profile);
          if (dropped > 0) toast("Some links were removed because they weren't valid (links must be https; Discord needs a server invite).", true);
          render(); schedulePreview();
        }
        setSaveState("", "Saved ✓");
      } catch (e) {
        saveError = true;
        setSaveState("error", "Not saved");
        toast(e.message === "Signed out" ? e.message : "Couldn't save: " + e.message + ". Retrying…", true);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 5000);
      } finally { saving = null; }
    })();
    return saving;
  }
  addEventListener("beforeunload", e => {
    if (JSON.stringify(cleaned()) !== savedJson) { saveNow(); e.preventDefault(); e.returnValue = ""; }
  });

  // ---------- Keyboard ----------
  addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveNow(); }
    else if (e.key === "/" && !typing) { e.preventDefault(); $("search-input").focus(); }
    else if (e.key === "Escape") { if (!$("dialog").hidden) $("dialog-no").click(); $("dash").classList.remove("show-preview"); }
  });

  // ---------- Search ----------
  const searchIndex = () => SETTINGS.map(s => ({
    s, text: `${s.label} ${s.group || ""} ${SECTIONS.find(x => x.id === s.section).label} ${s.keywords || ""} ${(s.options || []).map(o => o[1]).join(" ")}`.toLowerCase()
  }));
  let results = [], sel = 0;
  $("search-input").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { $("search-results").hidden = true; return; }
    const words = q.split(/\s+/);
    results = searchIndex().filter(x => words.every(w => x.text.includes(w)))
      .sort((a, b) => (b.s.label.toLowerCase().startsWith(q) ? 1 : 0) - (a.s.label.toLowerCase().startsWith(q) ? 1 : 0)).slice(0, 8);
    sel = 0;
    drawResults();
  });
  function drawResults() {
    const ul = $("search-results");
    ul.replaceChildren(...(results.length ? results.map((r, i) => h("li", { class: i === sel ? "sel" : "", role: "option",
      onmousedown: e => { e.preventDefault(); jumpTo(r.s); } },
      h("span", {}, r.s.label), h("small", {}, SECTIONS.find(x => x.id === r.s.section).label + (r.s.adv ? " · Advanced" : "")))) :
      [h("li", { class: "empty" }, "No matching settings")]));
    ul.hidden = false;
  }
  $("search-input").addEventListener("keydown", e => {
    if ($("search-results").hidden || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % results.length; drawResults(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + results.length) % results.length; drawResults(); }
    else if (e.key === "Enter") { e.preventDefault(); jumpTo(results[sel].s); }
    else if (e.key === "Escape") { $("search-results").hidden = true; e.target.blur(); }
  });
  $("search-input").addEventListener("blur", () => setTimeout(() => ($("search-results").hidden = true), 120));

  function jumpTo(s) {
    $("search-input").value = "";
    $("search-results").hidden = true;
    $("search-input").blur();
    if (s.adv) { advanced[s.section] = true; storeAdv(); }
    showSection(s.section);
    const el = $("content").querySelector(`[data-key="${CSS.escape(keyOf(s))}"]`);
    if (!el) { toast(`"${s.label}" isn't available with your current choices`); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    const input = el.querySelector("input:not([type=checkbox]), textarea, select");
    if (input) setTimeout(() => input.focus({ preventScroll: true }), 350);
  }

  // ---------- Live preview (double-buffered so it never flickers) ----------
  let previewTimer, previewFrame = null, pendingFrame = null;
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(refreshPreview, 250); }
  function previewData() {
    const p = cleaned();
    return { username: me.username, views: me.views, badges: me.badges, profile: p };
  }
  function refreshPreview() {
    if (!me) return;
    if (pendingFrame) pendingFrame.remove();
    const f = h("iframe", { class: "loading", title: "Live preview of your page", src: `/${me.username}?live=1` });
    pendingFrame = f;
    $("preview-stage").append(f);
  }
  addEventListener("message", e => {
    if (e.origin !== location.origin || !pendingFrame || e.source !== pendingFrame.contentWindow) return;
    if (e.data && e.data.type === "bio-ready") {
      pendingFrame.contentWindow.postMessage({ type: "bio-preview", data: previewData() }, location.origin);
    } else if (e.data && e.data.type === "bio-rendered") {
      const f = pendingFrame;
      pendingFrame = null;
      f.classList.remove("loading");
      if (previewFrame) { const old = previewFrame; setTimeout(() => old.remove(), 200); }
      previewFrame = f;
    }
  });
  $("preview-open").addEventListener("click", () => $("dash").classList.add("show-preview"));
  $("preview-close").addEventListener("click", () => $("dash").classList.remove("show-preview"));

  // ---------- Uploads ----------
  function upload(kind, file, bar) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      fd.append("file", file);
      xhr.open("POST", "/api/me/upload/" + kind);
      xhr.upload.onprogress = e => { if (bar && e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + "%"; };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status === 401) location.href = "/login";
        xhr.status < 300 ? resolve(data) : reject(new Error(data.error || "Upload failed"));
      };
      xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
      xhr.send(fd);
    });
  }
  async function doUploads(kind, files, bar) {
    await saveNow();                         // keep unsaved edits before the server changes the profile
    for (const file of files) {
      try {
        me = await upload(kind, file, bar);
        draft = clone(me.profile);
        savedJson = JSON.stringify(me.profile);
        toast("Uploaded ✓");
      } catch (e) { toast(`${file.name}: ${e.message}`, true); }
      if (bar) bar.style.width = "0";
    }
    afterChange(true);
  }
  async function deleteFile(id, question) {
    if (question && !(await confirmBox(question, "Delete"))) return;
    await saveNow();
    try {
      me = await api("DELETE", "/api/me/files/" + encodeURIComponent(id));
      draft = clone(me.profile);
      savedJson = JSON.stringify(me.profile);
      afterChange(true);
      toast("Removed");
    } catch (e) { toast(e.message, true); }
  }
  // An upload box with click + drag-and-drop
  function uploadBox({ kind, accept, title, note, thumb, wide, current, removeKind, multiple, small }) {
    const bar = h("div");
    const input = h("input", { type: "file", accept, multiple: !!multiple, hidden: true,
      onchange: e => { const files = [...e.target.files]; e.target.value = ""; if (files.length) doUploads(kind, files, bar); } });
    const file = removeKind && me.files.find(f => f.kind === removeKind);
    const box = h("div", { class: "upload" + (small ? " small" : "") },
      thumb !== undefined ? h("div", { class: "upload-thumb" + (wide ? " wide" : "") + (small ? " contain" : ""), style: thumb ? `background-image:url("${encodeURI(thumb)}")` : "" },
        thumb ? null : h("span", { html: UI("upload") })) : null,
      h("div", { class: "upload-body" },
        h("b", {}, title),
        h("small", {}, current || note),
        h("div", { class: "row" },
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => input.click() }, current ? "Replace" : "Upload"),
          file ? h("button", { class: "btn btn-danger btn-sm", type: "button", onclick: () => deleteFile(file.id) }, "Remove") : null),
        h("div", { class: "progress" }, bar)),
      input);
    box.addEventListener("dragover", e => { e.preventDefault(); box.classList.add("drag"); });
    box.addEventListener("dragleave", () => box.classList.remove("drag"));
    box.addEventListener("drop", e => {
      e.preventDefault(); box.classList.remove("drag");
      const files = [...e.dataTransfer.files];
      if (files.length) doUploads(kind, multiple ? files : files.slice(0, 1), bar);
    });
    return box;
  }

  // ---------- Drag to reorder (mouse + touch) ----------
  function sortable(list, arr, onDone) {
    list.querySelectorAll(".handle").forEach(handle => {
      handle.addEventListener("pointerdown", e => {
        e.preventDefault();
        const item = handle.closest(".item");
        item.classList.add("dragging");
        // Listen on the whole page: moving the item in the DOM would cancel pointer capture
        const move = ev => {
          if (ev.pointerId !== e.pointerId) return;
          ev.preventDefault();
          const sibs = [...list.children].filter(c => c !== item);
          const after = sibs.find(c => { const r = c.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
          if ((after || null) !== item.nextElementSibling) list.insertBefore(item, after || null);
        };
        const up = ev => {
          if (ev.pointerId !== e.pointerId) return;
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", up);
          document.removeEventListener("pointercancel", up);
          item.classList.remove("dragging");
          const order = [...list.children].map(c => Number(c.dataset.idx));
          if (order.some((v, i) => v !== i)) {
            pushHistory("reorder");
            const copy = order.map(i => arr[i]);
            arr.splice(0, arr.length, ...copy);
            onDone();
          }
        };
        document.addEventListener("pointermove", move, { passive: false });
        document.addEventListener("pointerup", up);
        document.addEventListener("pointercancel", up);
      });
    });
  }
  const grip = () => h("span", { class: "handle", title: "Drag to reorder", "aria-label": "Drag to reorder", html: UI("grip") });
  const removeBtn = (label, fn) => h("button", { class: "icon-btn", type: "button", title: label, "aria-label": label, onclick: fn, html: UI("x") });

  // ---------- Custom panels ----------
  const BLOCKS = {
    avatar: () => {
      const files = me.files;
      const av = files.find(f => f.kind === "avatar"), bn = files.find(f => f.kind === "banner");
      return h("div", { class: "upload-pair" },
        uploadBox({ kind: "avatar", accept: ".png,.jpg,.jpeg,.gif,.webp", title: "Avatar", note: "PNG, JPG, GIF or WEBP · 5 MB", thumb: draft.avatar || "/img/avatar.svg", current: av && av.name, removeKind: "avatar" }),
        uploadBox({ kind: "banner", accept: ".png,.jpg,.jpeg,.gif,.webp", title: "Banner", note: "Wide image above your name · 8 MB", thumb: draft.banner || "", wide: true, current: bn && bn.name, removeKind: "banner" }));
    },

    bgUpload: () => {
      const f = me.files.find(x => x.kind === "background");
      const video = draft.background.type === "video";
      const wrongKind = f && (video ? !/\.(mp4|webm)$/i.test(f.name) : /\.(mp4|webm)$/i.test(f.name));
      return h("div", { class: "field" },
        uploadBox({ kind: "background", accept: video ? ".mp4,.webm" : ".png,.jpg,.jpeg,.gif,.webp",
          title: video ? "Background video" : "Background image or GIF",
          note: video ? "MP4 or WEBM · 30 MB" : "PNG, JPG, GIF or WEBP · 30 MB",
          thumb: !video && f && !wrongKind ? draft.background.url : undefined, current: f && f.name, removeKind: "background" }),
        wrongKind ? h("span", { class: "hint bad" }, `Your current file is ${video ? "an image" : "a video"}. Upload a ${video ? "video" : "picture"} to use this option.`) : null);
    },

    // Default / one of the presets / your own upload. Shown to visitors on computers (not phones).
    cursorPicker: () => {
      const c = draft.cursor;
      const f = me.files.find(x => x.kind === "cursor");
      const pickStyle = (style, preset) => {
        pushHistory("cursor");
        c.style = style;
        if (preset) c.preset = preset;
        draft.template = "custom";
        afterChange(true);
      };
      const tile = (on, label, img, onclick, extra) => h("button", { type: "button", class: "cursor-tile" + (on ? " on" : ""), "aria-pressed": String(on), title: label, onclick },
        img ? h("img", { src: img, alt: "" }) : h("span", { class: "cursor-none" }, "Aa"), h("small", {}, label), extra || null);
      const tiles = [
        tile(c.style === "default", "Default", "", () => pickStyle("default")),
        ...PRESETS.map(([id, label]) => tile(c.style === "preset" && c.preset === id, label, `/cursors/${id}.svg`, () => pickStyle("preset", id))),
        f || c.image ? tile(c.style === "upload", "Yours", c.image || (f && f.url), () => pickStyle("upload")) : null
      ];
      return h("div", { class: "field" },
        h("div", { class: "cursor-grid", role: "group", "aria-label": "Cursor" }, tiles),
        uploadBox({ kind: "cursor", accept: ".png,.svg,.ico,.cur", title: f ? "Your cursor" : "Upload your own", note: "PNG, SVG, ICO or CUR · 32×32 works best · 256 KB",
          thumb: c.image || "", current: f && f.name, removeKind: "cursor", small: true }),
        h("span", { class: "hint" }, "Visitors on a computer see your cursor. Phones and tablets keep their normal touch."));
    },

    // Drag the blocks under your name into any order
    order: () => {
      const arr = draft.theme.order;
      const NAMES = { presence: ["Activity / Discord card", "chat"], socials: ["Social icons", "globe"], links: ["Link buttons", "link"], player: ["Music player", "music"] };
      const list = h("ul", { class: "list" }, arr.map((b, i) => h("li", { class: "item", "data-idx": String(i) },
        grip(), icon(NAMES[b][1]), h("span", { class: "grow" }, NAMES[b][0]),
        h("div", { class: "row-btns" },
          h("button", { type: "button", class: "icon-btn", disabled: i === 0, "aria-label": "Move up", html: UI("chevronDown"), style: "transform:rotate(180deg)",
            onclick: () => { pushHistory(); [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; afterChange(true); } }),
          h("button", { type: "button", class: "icon-btn", disabled: i === arr.length - 1, "aria-label": "Move down", html: UI("chevronDown"),
            onclick: () => { pushHistory(); [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; afterChange(true); } })))));
      sortable(list, arr, () => afterChange(true));
      return h("div", { class: "field" }, h("span", { class: "field-label" }, "Order of sections"), list,
        h("span", { class: "hint" }, "Drag to reorder. Sections you haven't set up stay hidden."));
    },

    // Google / Discord sign-in, connect and disconnect
    signin: () => {
      const rows = [["google", "Google"], ["discord", "Discord"]].map(([key, name]) => {
        const linked = me.linked[key], ready = me.providers[key];
        return h("li", { class: "item" }, icon(key), h("span", { class: "grow" }, h("b", {}, name), h("small", {}, linked ? "Connected" : ready ? "Not connected" : "Not set up on this site yet")),
          linked
            ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: async () => {
                if (!(await confirmBox(`Disconnect ${name}? You won't be able to log in with it any more.`, "Disconnect"))) return;
                try { await api("POST", "/api/me/unlink", { provider: key }); me = await api("GET", "/api/me"); render(); toast(`${name} disconnected`); }
                catch (e) { toast(e.message, true); }
              } }, "Disconnect")
            : h("a", { class: "btn btn-ghost btn-sm" + (ready ? "" : " disabled"), href: ready ? `/auth/${key}?link=1` : null, "aria-disabled": ready ? null : "true",
                onclick: ready ? () => saveNow() : null }, "Connect"));
      });
      return h("div", { class: "field" }, h("ul", { class: "list" }, rows),
        h("span", { class: "hint" }, "Connect one to log in with a single click. You can also always log in with an emailed code."));
    },

    templates: () => {
      // Pages saved before templates existed say "classic"; only highlight it if the look really matches
      if (draft.template === "classic" && LOOK_PATHS.some(p => JSON.stringify(get(draft, p)) !== JSON.stringify(get(me.defaults, p)))) draft.template = "custom";
      const tiles = TEMPLATES.map(t => {
        const [c1, c2, a1, a2] = t.swatch;
        return h("button", { type: "button", class: "tpl" + (draft.template === t.id ? " on" : ""), onclick: () => applyTemplate(t) },
          h("div", { class: "tpl-thumb", style: `background:linear-gradient(150deg, ${c1}, ${c2})` },
            h("div", { class: "tpl-card" }, h("i", { style: `background:${a1}` }), h("b", { style: `background:linear-gradient(90deg, ${a1}, ${a2})` }))),
          h("span", { class: "tpl-name" }, t.name), h("span", { class: "tpl-note" }, t.note));
      });
      return h("div", { class: "field" }, h("div", { class: "templates" }, tiles),
        h("span", { class: "hint" }, draft.template === "custom" ? "You've customised your look. Pick a template to start over; your text, links and uploads stay." : "Templates change the look only. Your text, links and uploads stay."));
    },

    socials: () => {
      const arr = draft.socials;
      const list = h("ul", { class: "list" }, arr.map((s, i) => h("li", { class: "item", "data-idx": String(i) },
        grip(),
        h("span", { class: "item-icon", html: ICONS[s.icon] || ICONS.link }),
        h("select", { class: "input", "aria-label": "Platform", onchange: e => { pushHistory(); s.icon = e.target.value; s.label = SOCIALS[s.icon]; afterChange(true); } },
          Object.entries(SOCIALS).map(([k, label]) => h("option", { value: k, selected: k === s.icon }, label))),
        h("input", { class: "input grow", value: s.url, maxlength: "500", placeholder: SOCIAL_PH[s.icon] || "https://…", "aria-label": "Link",
          oninput: e => { pushHistory("social" + i); s.url = e.target.value; afterChange(false); } }),
        removeBtn("Remove", () => { pushHistory(); arr.splice(i, 1); afterChange(true); }))));
      if (!arr.length) list.append(h("li", { class: "list-empty" }, "No social icons yet."));
      sortable(list, arr, () => afterChange(true));
      return h("div", { class: "field" }, list,
        h("div", { class: "row" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => {
          if (arr.length >= 12) return toast("You can add up to 12 social icons", true);
          const used = new Set(arr.map(x => x.icon));
          const next = Object.keys(SOCIALS).find(k => !used.has(k)) || "link";
          pushHistory(); arr.push({ icon: next, url: "", label: SOCIALS[next] }); afterChange(true);
          setTimeout(() => { const ins = $("content").querySelectorAll('[data-key="block:socials"] .item .input.grow'); ins[ins.length - 1] && ins[ins.length - 1].focus(); }, 0);
        } }, "+ Add social icon")));
    },

    links: () => {
      const arr = draft.links;
      const list = h("ul", { class: "list" }, arr.map((l, i) => h("li", { class: "item", "data-idx": String(i) },
        grip(),
        h("select", { class: "input", "aria-label": "Icon", onchange: e => { pushHistory(); l.icon = e.target.value; afterChange(false); } },
          Object.entries(LINK_ICONS).map(([k, label]) => h("option", { value: k, selected: k === l.icon }, label))),
        h("input", { class: "input grow", value: l.title, maxlength: "50", placeholder: "Button text", "aria-label": "Button text",
          oninput: e => { pushHistory("lt" + i); l.title = e.target.value; afterChange(false); } }),
        h("input", { class: "input grow", value: l.url, maxlength: "500", placeholder: "https://…", "aria-label": "Link",
          oninput: e => { pushHistory("lu" + i); l.url = e.target.value; afterChange(false); } }),
        removeBtn("Remove", () => { pushHistory(); arr.splice(i, 1); afterChange(true); }))));
      if (!arr.length) list.append(h("li", { class: "list-empty" }, "No link buttons yet."));
      sortable(list, arr, () => afterChange(true));
      return h("div", { class: "field" }, list,
        h("div", { class: "row" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => {
          if (arr.length >= 10) return toast("You can add up to 10 link buttons", true);
          pushHistory(); arr.push({ title: "", url: "", icon: "link" }); afterChange(true);
        } }, "+ Add link button")));
    },

    tracks: () => {
      const arr = draft.music.tracks;
      const bar = h("div");
      const input = h("input", { type: "file", accept: ".mp3,.ogg,.wav,.m4a", multiple: true, hidden: true,
        onchange: e => { const files = [...e.target.files]; e.target.value = ""; if (files.length) doUploads("music", files, bar); } });
      const list = h("ul", { class: "list" }, arr.map((t, i) => h("li", { class: "item", "data-idx": String(i) },
        grip(),
        h("input", { class: "input grow", value: t.title, maxlength: "80", "aria-label": "Song title",
          oninput: e => { pushHistory("tt" + i); t.title = e.target.value; afterChange(false); } }),
        removeBtn("Delete song", () => deleteFile(t.id, `Delete "${t.title}"?`)))));
      if (!arr.length) list.append(h("li", { class: "list-empty" }, "No songs yet."));
      sortable(list, arr, () => afterChange(true));
      const box = h("div", { class: "field" }, list,
        h("div", { class: "row" },
          h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => input.click() }, "+ Upload songs"),
          h("span", { class: "hint" }, "MP3, OGG, WAV or M4A · 20 MB each · up to 10. Only upload music you have the right to share.")),
        h("div", { class: "progress" }, bar), input);
      box.addEventListener("dragover", e => e.preventDefault());
      box.addEventListener("drop", e => { e.preventDefault(); const files = [...e.dataTransfer.files]; if (files.length) doUploads("music", files, bar); });
      return box;
    },

    discordCheck: () => {
      const out = h("span", { class: "hint" });
      const id = (draft.discord.userId || "").trim();
      if (!/^\d{15,21}$/.test(id)) out.textContent = id ? "A Discord user ID is 17–20 digits long." : "Paste your Discord user ID above.";
      else {
        out.textContent = "Checking…";
        fetch("https://api.lanyard.rest/v1/users/" + id).then(r => r.json()).then(r => {
          if (r.success) {
            const u = r.data.discord_user;
            out.textContent = `✓ Connected as ${u.global_name || u.username} (@${u.username}) · ${r.data.discord_status}`;
            out.className = "hint ok";
          } else { out.textContent = "✕ Not found. Join discord.gg/lanyard with this account, then wait a minute."; out.className = "hint bad"; }
        }).catch(() => { out.textContent = "Couldn't reach Lanyard right now."; });
      }
      return h("div", { class: "field" }, out,
        h("details", { class: "help" }, h("summary", {}, "How do I connect?"),
          h("ol", {},
            h("li", {}, "Join the Lanyard server: discord.gg/lanyard (this is how your status is read; you can mute it)."),
            h("li", {}, "In Discord: Settings → Advanced → turn on Developer Mode."),
            h("li", {}, "Right-click your own name → Copy User ID, then paste it above."))));
    },

    badges: () => h("div", { class: "field" },
      me.badges.length
        ? h("div", { class: "badge-list" }, me.badges.map(b => h("span", { class: "badge-chip", title: b.tip || b.label },
            b.image ? h("img", { src: b.image, alt: "" }) : h("span", { style: /^#[0-9a-f]{6}$/i.test(b.color || "") ? `color:${b.color}` : "", html: ICONS[b.icon] || "" }), b.label)))
        : h("span", { class: "hint" }, "You don't have any badges yet. Badges are given out by the site's admins.")),

    analytics: () => {
      const wrap = h("div", { class: "field" }, h("span", { class: "hint" }, "Loading…"));
      loadAnalytics(wrap, Number(sessionStorage.getItem("an-days")) || 30);
      return wrap;
    },

    pageLink: () => {
      const url = `${location.origin}/${me.username}`;
      return h("div", { class: "field" },
        h("div", { class: "row" },
          h("input", { class: "input grow", value: url, readonly: true, "aria-label": "Your page link", style: "flex:1;min-width:0" }),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () =>
            (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast("Link copied ✓"), () => toast(url)) }, "Copy"),
          h("a", { class: "btn btn-ghost btn-sm", href: url, target: "_blank", rel: "noopener" }, "Open ↗")),
        h("span", { class: "hint" }, `Signed in as @${me.username} · ${me.email} · ${me.views.toLocaleString()} views · storage ${fmtMB(me.files.reduce((s, f) => s + f.size, 0))} of ${fmtMB(me.quota)}`),
        h("div", { class: "row" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: logout }, "Sign out")));
    },

    dashTheme: () => {
      const seg = (val, txt) => h("button", { type: "button", class: me.prefs.theme === val ? "on" : "", onclick: () => { savePrefs({ theme: val }).then(render); render(); } }, txt);
      return h("div", { class: "field" },
        h("span", { class: "field-label" }, "Theme"),
        h("div", { class: "seg" }, seg("dark", "Dark"), seg("light", "Light"), seg("system", "Match device")),
        h("label", { class: "switch" }, h("input", { type: "checkbox", checked: me.prefs.advanced, onchange: e => { savePrefs({ advanced: e.target.checked }); for (const k in advanced) delete advanced[k]; storeAdv(); } }), h("span"), "Show advanced settings by default"));
    },

    // Accounts made with Google / Discord have no password yet: they can set one
    password: () => {
      const has = me.hasPassword;
      const cur = has ? h("input", { class: "input", type: "password", autocomplete: "current-password", placeholder: "Current password" }) : null;
      const next = h("input", { class: "input", type: "password", autocomplete: "new-password", placeholder: "New password (8+ characters)" });
      const msg = h("span", { class: "hint" });
      return h("form", { class: "field", onsubmit: async e => {
        e.preventDefault();
        try {
          await api("POST", "/api/me/password", { current: cur ? cur.value : "", next: next.value });
          msg.textContent = has ? "Password changed ✓" : "Password set ✓"; msg.className = "hint ok";
          if (cur) cur.value = ""; next.value = "";
          if (!has) { me.hasPassword = true; setTimeout(render, 1200); }
        } catch (err) { msg.textContent = err.message; msg.className = "hint bad"; }
      } },
      has ? null : h("span", { class: "hint" }, "You sign in with Google or Discord. Set a password to also log in with your email and password."),
      cur, next, h("div", { class: "row" }, h("button", { class: "btn btn-ghost btn-sm", type: "submit" }, has ? "Change password" : "Set password"), msg));
    },

    deleteAccount: () => {
      const has = me.hasPassword;
      const pw = h("input", { class: "input", type: has ? "password" : "text", autocomplete: has ? "current-password" : "off", placeholder: has ? "Your password" : `Type ${me.username} to confirm` });
      const msg = h("span", { class: "hint" });
      return h("div", { class: "field" },
        h("span", { class: "hint" }, "Deletes your page, uploads and stats for good. This can't be undone."),
        pw, h("div", { class: "row" }, h("button", { class: "btn btn-danger btn-sm", type: "button", onclick: async () => {
          if (!pw.value) { msg.textContent = has ? "Enter your password first" : "Type your username first"; msg.className = "hint bad"; return; }
          if (!(await confirmBox(`Delete @${me.username} forever?`, "Delete forever"))) return;
          try { await api("DELETE", "/api/me", has ? { password: pw.value } : { confirm: pw.value }); savedJson = JSON.stringify(cleaned()); location.href = "/"; }
          catch (err) { msg.textContent = err.message; msg.className = "hint bad"; }
        } }, "Delete my account"), msg));
    }
  };

  function applyTemplate(t) {
    pushHistory("template");
    if (t.fromDefaults) for (const p of LOOK_PATHS) set(draft, p, clone(get(me.defaults, p)));
    else {
      // Start from Classic, then apply the template's changes, so templates are predictable
      for (const p of LOOK_PATHS) set(draft, p, clone(get(me.defaults, p)));
      for (const [p, v] of Object.entries(t.set)) set(draft, p, v);
    }
    // Keep an uploaded image/video background available if the template uses a colour
    draft.template = t.id;
    afterChange(true);
    toast(`${t.name} template applied. Undo with Ctrl+Z.`);
  }

  async function logout() {
    await saveNow();
    await api("POST", "/api/logout").catch(() => {});
    location.href = "/";
  }
  $("logout").addEventListener("click", logout);

  // ---------- Analytics ----------
  async function loadAnalytics(wrap, days) {
    let a;
    try { a = await api("GET", "/api/me/analytics?days=" + days); }
    catch (e) { wrap.replaceChildren(h("span", { class: "hint bad" }, e.message)); return; }
    sessionStorage.setItem("an-days", String(days));
    const sum = k => a.series.reduce((s, d) => s + d[k], 0);
    const views = sum("views"), clicks = sum("clicks");
    let metric = "views";

    const rangeSeg = h("div", { class: "seg range-pick" }, [7, 30, 90].map(d =>
      h("button", { type: "button", class: d === days ? "on" : "", onclick: () => loadAnalytics(wrap, d) }, `${d} days`)));
    const stats = h("div", { class: "stats" },
      stat(a.totalViews.toLocaleString(), "Total views"),
      stat(views.toLocaleString(), `Views (${days}d)`),
      stat(clicks.toLocaleString(), `Link clicks (${days}d)`),
      stat(views ? Math.round((clicks / views) * 100) + "%" : "–", "Click rate"));

    const chartBox = h("div", { class: "chart-wrap" });
    const metricSeg = h("div", { class: "seg" },
      h("button", { type: "button", class: "on", onclick: e => pick(e, "views") }, "Views"),
      h("button", { type: "button", onclick: e => pick(e, "clicks") }, "Clicks"));
    function pick(e, m) { metric = m; metricSeg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === e.currentTarget)); drawChart(); }
    function drawChart() { chartBox.replaceChildren(barChart(a.series, metric)); }
    drawChart();

    const table = h("details", {}, h("summary", {}, "Show as table"),
      h("table", { class: "data-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Day"), h("th", {}, "Views"), h("th", {}, "Clicks"))),
        h("tbody", {}, a.series.slice().reverse().map(d => h("tr", {}, h("td", {}, dayLabel(d.day)), h("td", {}, String(d.views)), h("td", {}, String(d.clicks)))))));

    wrap.replaceChildren(
      rangeSeg, stats,
      h("div", { class: "row", style: "justify-content:space-between" }, h("span", { class: "field-label" }, "Over time"), metricSeg),
      chartBox, table,
      h("span", { class: "field-label" }, "Top links"),
      hbars(a.links.map(l => [l.label, l.clicks, l.url]), "No clicks yet. Clicks on your social icons and link buttons show up here."),
      h("span", { class: "field-label" }, "Where visitors come from"),
      hbars(a.referrers.map(r => [r.source, r.views]), "No visits yet."),
      h("span", { class: "hint" }, "Views and clicks count each visitor once per day. Your own dashboard preview isn't counted."));
  }
  const stat = (v, label) => h("div", { class: "stat" }, h("b", {}, v), h("span", {}, label));
  const dayLabel = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  function hbars(rows, empty) {
    if (!rows.length) return h("span", { class: "hint" }, empty);
    const max = Math.max(...rows.map(r => r[1]), 1);
    return h("ul", { class: "hbars" }, rows.map(([name, n, title]) => h("li", { title: title || name },
      h("span", { class: "name" }, name), h("span", { class: "num" }, n.toLocaleString()),
      h("div", { class: "track" }, h("div", { class: "fill", style: `width:${Math.max(2, (n / max) * 100)}%` })))));
  }

  // Single-series bar chart with hover/touch tooltip
  function barChart(series, key) {
    const W = 640, H = 190, padL = 30, padB = 22, padT = 10;
    const max = Math.max(1, ...series.map(d => d[key]));
    const nice = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
    const n = series.length, slot = (W - padL) / n, bw = Math.max(2, slot - (n > 40 ? 2 : 4));
    const NS = "http://www.w3.org/2000/svg";
    const el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const s = el("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": `${key} per day` });
    for (let i = 0; i <= 4; i++) {
      const y = padT + ((H - padT - padB) * i) / 4;
      s.append(el("line", { class: "grid", x1: padL, x2: W, y1: y, y2: y }));
      const t = el("text", { class: "axis", x: padL - 6, y: y + 3, "text-anchor": "end" });
      t.textContent = String(Math.round(nice - (nice * i) / 4));
      s.append(t);
    }
    const tip = h("div", { class: "tip", hidden: true });
    series.forEach((d, i) => {
      const v = d[key];
      const bh = ((H - padT - padB) * v) / nice;
      const x = padL + i * slot + (slot - bw) / 2;
      const y = H - padB - bh;
      if (v > 0) {
        // rounded data-end, anchored to the baseline
        const r = Math.min(4, bw / 2, bh);
        s.append(el("path", { class: "bar", d: `M${x},${H - padB} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H - padB} Z` }));
      }
      const hit = el("rect", { class: "hit", x: padL + i * slot, y: padT, width: slot, height: H - padT - padB });
      const show = () => {
        tip.textContent = `${dayLabel(d.day)}: ${v.toLocaleString()} ${key === "views" ? (v === 1 ? "view" : "views") : (v === 1 ? "click" : "clicks")}`;
        tip.hidden = false;
        const box = s.getBoundingClientRect();
        tip.style.left = ((padL + i * slot + slot / 2) / W) * box.width + "px";
        tip.style.top = (Math.max(y, padT + 20) / H) * box.height + "px";
      };
      hit.addEventListener("pointerenter", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => (tip.hidden = true));
      s.append(hit);
    });
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      const t = el("text", { class: "axis", x: padL + i * slot + slot / 2, y: H - 6, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" });
      t.textContent = dayLabel(series[i].day);
      s.append(t);
    });
    return h("div", { class: "chart-wrap" }, s, tip);
  }

  init();
})();
