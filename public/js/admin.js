/* Admin panel */
(function () {
  const $ = id => document.getElementById(id);
  let badges = [];          // badge catalog
  let icons = [];           // allowed badge icons
  let current = null;       // user open in the editor
  const userQuery = { q: "", sort: "new", filter: "", page: 0 };

  // ---------- helpers ----------
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;          // only used with our own icon SVGs
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const iconEl = (name, color) => h("span", { class: "badge-icons", style: color ? `color:${color}` : null, html: ICONS[name] || "" });
  const fmtDate = t => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const fmtTime = t => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtMB = b => (b / 1048576).toFixed(1) + " MB";

  let toastTimer;
  function toast(msg, isError) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (isError ? " error" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.locked) { showLock(); throw new Error("Locked"); }
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  // ---------- Lock screen ----------
  function showLock() {
    $("panel").hidden = true;
    $("lock-btn").hidden = true;
    $("user-modal").hidden = true;
    $("lock-screen").hidden = false;
    $("code").value = "";
    $("code").focus();
  }
  function showPanel() {
    $("lock-screen").hidden = true;
    $("panel").hidden = false;
    $("lock-btn").hidden = false;
    openTab(location.hash.slice(1) || "overview");
  }

  $("unlock-form").addEventListener("submit", async e => {
    e.preventDefault();
    $("code-error").textContent = "";
    $("unlock-btn").disabled = true;
    try {
      await api("POST", "/api/admin/unlock", { code: $("code").value });
      showPanel();
    } catch (err) {
      $("code-error").textContent = err.message;
      $("code").select();
    }
    $("unlock-btn").disabled = false;
  });

  $("lock-btn").addEventListener("click", async () => {
    await api("POST", "/api/admin/lock").catch(() => {});
    showLock();
  });

  // ---------- Tabs ----------
  const loaders = { overview: loadStats, users: loadUsers, badges: loadBadges, blocked: loadBlocked, pending: loadPending, log: loadLog };
  function openTab(name) {
    if (!loaders[name]) name = "overview";
    document.querySelectorAll("[data-view]").forEach(s => (s.hidden = s.dataset.view !== name));
    document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("active", a.dataset.tab === name));
    loaders[name]().catch(err => err.message !== "Locked" && toast(err.message, true));
  }
  $("tabs").addEventListener("click", e => {
    const a = e.target.closest("a[data-tab]");
    if (!a) return;
    e.preventDefault();
    history.replaceState(null, "", "#" + a.dataset.tab);
    openTab(a.dataset.tab);
  });

  // ---------- Overview ----------
  async function loadStats() {
    const s = await api("GET", "/api/admin/stats");
    const tiles = [
      ["Users", s.users], ["New today", s.signups24h], ["New this week", s.signups7d], ["Total views", s.views],
      ["Banned", s.banned], ["Pending sign-ups", s.pending], ["Files", s.files], ["Storage", fmtMB(s.storage)]
    ];
    $("stats").replaceChildren(...tiles.map(([label, v]) => h("div", { class: "stat" }, h("b", {}, typeof v === "number" ? v.toLocaleString() : v), h("span", {}, label))));
    $("newest").replaceChildren(...s.newest.map(u => h("li", {}, h("a", { href: "/" + u.username, target: "_blank" }, "@" + u.username), h("span", {}, fmtDate(u.created_at)))));
    $("top-views").replaceChildren(...s.topViews.map(u => h("li", {}, h("a", { href: "/" + u.username, target: "_blank" }, "@" + u.username), h("span", {}, u.views.toLocaleString() + " views"))));
  }

  // ---------- Users ----------
  async function ensureBadges() {
    if (badges.length && icons.length) return;
    const r = await api("GET", "/api/admin/badges");
    badges = r.badges; icons = r.icons;
  }

  async function loadUsers() {
    await ensureBadges();
    const qs = new URLSearchParams({ q: userQuery.q, sort: userQuery.sort, filter: userQuery.filter, page: userQuery.page });
    const r = await api("GET", "/api/admin/users?" + qs);
    $("user-count").textContent = `(${r.total.toLocaleString()})`;
    const body = $("user-table").querySelector("tbody");
    body.replaceChildren(...(r.users.length ? r.users.map(u => h("tr", { class: "clickable", onclick: () => openUser(u.id) },
      h("td", {}, h("b", {}, "@" + u.username), h("span", { class: "sub" }, u.displayName)),
      h("td", {}, u.email),
      h("td", {}, fmtDate(u.createdAt)),
      h("td", {}, u.views.toLocaleString()),
      h("td", {}, ...badges.filter(b => u.badges.includes(b.id)).map(b => iconEl(b.icon, b.color))),
      h("td", {}, u.isAdmin ? h("span", { class: "tag admin" }, "admin") : null, " ",
        u.banned ? h("span", { class: "tag bad" }, "banned") : !u.verified ? h("span", { class: "tag warn" }, "unconfirmed") : h("span", { class: "tag ok" }, "active"))
    )) : [h("tr", {}, h("td", { class: "empty", colspan: "6" }, "No users found"))]));
    const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
    $("page-info").textContent = `Page ${r.page + 1} of ${pages}`;
    $("prev-page").disabled = r.page === 0;
    $("next-page").disabled = r.page + 1 >= pages;
  }

  let searchTimer;
  $("user-search").addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { userQuery.q = e.target.value; userQuery.page = 0; loadUsers().catch(err => toast(err.message, true)); }, 250);
  });
  $("user-sort").addEventListener("change", e => { userQuery.sort = e.target.value; userQuery.page = 0; loadUsers(); });
  $("user-filter").addEventListener("change", e => { userQuery.filter = e.target.value; userQuery.page = 0; loadUsers(); });
  $("prev-page").addEventListener("click", () => { userQuery.page--; loadUsers(); });
  $("next-page").addEventListener("click", () => { userQuery.page++; loadUsers(); });

  // ---------- User editor ----------
  async function openUser(id) {
    try {
      await ensureBadges();
      current = await api("GET", "/api/admin/users/" + id);
    } catch (err) { if (err.message !== "Locked") toast(err.message, true); return; }
    const u = current;
    $("um-error").textContent = "";
    $("um-title").textContent = "@" + u.username;
    $("um-link").textContent = `${location.host}/${u.username}`;
    $("um-link").href = "/" + u.username;
    $("um-meta").textContent = `Joined ${fmtDate(u.createdAt)} · ${u.views.toLocaleString()} views · ${u.files} files (${fmtMB(u.storage)}) · ${u.sessions} signed-in device${u.sessions === 1 ? "" : "s"}` +
      (u.discordId ? ` · Discord ID ${u.discordId}` : "") + (u.banned ? " · BANNED" : "");
    $("um-username").value = u.username;
    $("um-email").value = u.email;
    $("um-views").value = u.views;
    $("um-password").value = "";
    $("um-delete-confirm").value = "";
    $("um-block").checked = false;
    $("um-reset-files").checked = false;
    $("um-ban").textContent = u.banned ? "Unban" : "Ban";

    $("um-badges").replaceChildren(...badges.map(b => {
      const on = u.badges.includes(b.id);
      const input = h("input", { type: "checkbox", checked: on, value: String(b.id) });
      const chip = h("label", { class: "chip" + (on ? " on" : "") }, input, iconEl(b.icon, b.color), b.name);
      input.addEventListener("change", () => chip.classList.toggle("on", input.checked));
      return chip;
    }));
    if (!badges.length) $("um-badges").append(h("span", { class: "hint" }, "No badges yet. Create some in the Badges tab."));

    renderFiles();
    $("user-modal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function renderFiles() {
    const list = current.fileList;
    $("um-files").replaceChildren(...(list.length ? list.map(f => h("li", { class: "list-row file-row" },
      h("span", { class: "tag admin" }, f.kind),
      h("a", { class: "grow", href: f.url, target: "_blank", rel: "noopener" }, f.name),
      h("span", { class: "count" }, fmtMB(f.size)),
      h("button", { class: "btn btn-danger btn-sm", onclick: () => deleteFile(f) }, "Delete")
    )) : [h("li", { class: "hint" }, "No uploads")]));
  }

  function closeUser() {
    $("user-modal").hidden = true;
    document.body.style.overflow = "";
    current = null;
  }
  $("um-close").addEventListener("click", closeUser);
  $("user-modal").addEventListener("click", e => { if (e.target === $("user-modal")) closeUser(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !$("user-modal").hidden) closeUser(); });

  async function act(fn, okMsg) {
    $("um-error").textContent = "";
    try {
      await fn();
      if (okMsg) toast(okMsg);
      if (current) await openUser(current.id);
      loadUsers().catch(() => {});
    } catch (err) { if (err.message !== "Locked") $("um-error").textContent = err.message; }
  }

  $("um-save").addEventListener("click", () => act(() => api("PATCH", "/api/admin/users/" + current.id, {
    username: $("um-username").value, email: $("um-email").value, views: Number($("um-views").value)
  }), "Account saved ✓"));

  $("um-save-badges").addEventListener("click", () => act(() => api("PATCH", "/api/admin/users/" + current.id, {
    badges: [...$("um-badges").querySelectorAll("input:checked")].map(i => Number(i.value))
  }), "Badges saved ✓"));

  $("um-set-password").addEventListener("click", () => act(() =>
    api("POST", `/api/admin/users/${current.id}/password`, { password: $("um-password").value }), "Password changed ✓ They've been signed out."));

  $("um-signout").addEventListener("click", () => act(() =>
    api("POST", `/api/admin/users/${current.id}/signout`), "Signed out everywhere ✓"));

  $("um-ban").addEventListener("click", () => {
    const ban = !current.banned;
    if (ban && !confirm(`Ban @${current.username}? Their page disappears and they can't sign in.`)) return;
    act(() => api("PATCH", "/api/admin/users/" + current.id, { banned: ban }), ban ? "Banned" : "Unbanned");
  });

  $("um-reset").addEventListener("click", () => {
    const files = $("um-reset-files").checked;
    if (!confirm(`Reset @${current.username}'s page to the default look${files ? " and delete all their uploads" : ""}?`)) return;
    act(() => api("POST", `/api/admin/users/${current.id}/reset-profile`, { deleteFiles: files }), "Page reset ✓");
  });

  function deleteFile(f) {
    if (!confirm(`Delete ${f.name}?`)) return;
    act(() => api("DELETE", `/api/admin/users/${current.id}/files/${encodeURIComponent(f.id)}`), "File deleted");
  }

  $("um-delete").addEventListener("click", async () => {
    const name = current.username;
    if ($("um-delete-confirm").value.trim().toLowerCase() !== name) {
      $("um-error").textContent = `Type "${name}" in the box to confirm.`;
      return;
    }
    try {
      await api("DELETE", "/api/admin/users/" + current.id, { confirm: name, block: $("um-block").checked });
      closeUser();
      toast(`@${name} deleted`);
      loadUsers();
    } catch (err) { if (err.message !== "Locked") $("um-error").textContent = err.message; }
  });

  // ---------- Badges ----------
  function iconSelect(value, onchange) {
    return h("select", { class: "input icon-select", "aria-label": "Icon", onchange },
      icons.map(i => h("option", { value: i, selected: i === value }, i)));
  }

  async function loadBadges() {
    const r = await api("GET", "/api/admin/badges");
    badges = r.badges; icons = r.icons;
    $("badge-list").replaceChildren(...badges.map((b, i) => {
      const preview = h("span", { class: "badge-preview", style: `color:${b.color}`, html: ICONS[b.icon] || "" });
      const name = h("input", { class: "input grow", value: b.name, maxlength: "30", "aria-label": "Badge name" });
      const color = h("input", { type: "color", class: "color small", value: b.color, "aria-label": "Colour",
        oninput: e => (preview.style.color = e.target.value) });
      const icon = iconSelect(b.icon, e => (preview.innerHTML = ICONS[e.target.value] || ""));
      const save = extra => api("PATCH", "/api/admin/badges/" + b.id, { name: name.value, icon: icon.value, color: color.value, ...extra })
        .then(r => { badges = r.badges; loadBadges(); toast("Badge saved ✓"); }, err => toast(err.message, true));
      return h("li", { class: "list-row" },
        preview, name, icon, color,
        h("span", { class: "count" }, `${b.users} user${b.users === 1 ? "" : "s"}`),
        h("div", { class: "row-btns" },
          h("button", { class: "btn btn-ghost btn-sm", disabled: i === 0, title: "Move up", onclick: () => save({ move: "up" }) }, "↑"),
          h("button", { class: "btn btn-ghost btn-sm", disabled: i === badges.length - 1, title: "Move down", onclick: () => save({ move: "down" }) }, "↓"),
          h("button", { class: "btn btn-primary btn-sm", onclick: () => save() }, "Save"),
          h("button", { class: "btn btn-danger btn-sm", onclick: () => {
            if (!confirm(`Delete the "${b.name}" badge? It's removed from ${b.users} user(s).`)) return;
            api("DELETE", "/api/admin/badges/" + b.id).then(() => { loadBadges(); toast("Badge deleted"); }, err => toast(err.message, true));
          } }, "Delete")
        )
      );
    }));
    // New badge form
    if (!$("nb-icon").options.length) {
      $("nb-icon").replaceChildren(...icons.map(i => h("option", { value: i }, i)));
      $("nb-icon").value = "shield";
    }
    updateNewPreview();
  }
  function updateNewPreview() {
    $("nb-preview").innerHTML = ICONS[$("nb-icon").value] || "";
    $("nb-preview").style.color = $("nb-color").value;
  }
  $("nb-icon").addEventListener("change", updateNewPreview);
  $("nb-color").addEventListener("input", updateNewPreview);
  $("new-badge").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await api("POST", "/api/admin/badges", { name: $("nb-name").value, icon: $("nb-icon").value, color: $("nb-color").value });
      $("nb-name").value = "";
      toast("Badge added ✓");
      loadBadges();
    } catch (err) { toast(err.message, true); }
  });

  // ---------- Blocked usernames ----------
  async function loadBlocked(data) {
    const r = data || await api("GET", "/api/admin/blocked");
    $("blocked-list").replaceChildren(...(r.blocked.length ? r.blocked.map(b => h("span", { class: "chip" }, b.name,
      h("button", { title: "Unblock", "aria-label": "Unblock " + b.name, onclick: () =>
        api("DELETE", "/api/admin/blocked/" + encodeURIComponent(b.name)).then(loadBlocked, err => toast(err.message, true)) }, "✕")
    )) : [h("span", { class: "hint" }, "No blocked usernames")]));
  }
  $("block-form").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      loadBlocked(await api("POST", "/api/admin/blocked", { name: $("block-name").value }));
      $("block-name").value = "";
    } catch (err) { toast(err.message, true); }
  });

  // ---------- Pending sign-ups ----------
  async function loadPending() {
    const r = await api("GET", "/api/admin/pending");
    const body = $("pending-table").querySelector("tbody");
    body.replaceChildren(...(r.pending.length ? r.pending.map(p => h("tr", {},
      h("td", {}, "@" + p.username), h("td", {}, p.email), h("td", {}, fmtTime(p.created_at)),
      h("td", {}, String(p.attempts) + (p.expires_at < Date.now() ? " (expired)" : "")),
      h("td", {}, h("button", { class: "btn btn-ghost btn-sm", onclick: () =>
        api("DELETE", "/api/admin/pending/" + p.id).then(loadPending, err => toast(err.message, true)) }, "Remove"))
    )) : [h("tr", {}, h("td", { class: "empty", colspan: "5" }, "No pending sign-ups"))]));
  }
  $("clear-pending").addEventListener("click", () => {
    if (!confirm("Remove all pending sign-ups? Anyone waiting on a code will have to start again.")) return;
    api("DELETE", "/api/admin/pending").then(() => { loadPending(); toast("Cleared"); }, err => toast(err.message, true));
  });

  // ---------- Log ----------
  async function loadLog() {
    const r = await api("GET", "/api/admin/log");
    $("log-table").querySelector("tbody").replaceChildren(...(r.log.length ? r.log.map(l => h("tr", {},
      h("td", {}, fmtTime(l.created_at)), h("td", {}, "@" + l.admin), h("td", {}, l.action),
      h("td", {}, l.target), h("td", {}, l.details)
    )) : [h("tr", {}, h("td", { class: "empty", colspan: "5" }, "Nothing yet"))]));
  }

  // ---------- Start ----------
  api("GET", "/api/admin/status").then(s => {
    $("admin-name").textContent = "@" + s.admin;
    s.unlocked ? showPanel() : showLock();
  }).catch(() => { location.href = "/"; });
})();
