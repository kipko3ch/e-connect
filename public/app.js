const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  overview: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  devices: "M4 4h16v12H4zM8 21h8m-4-5v5",
  wifi: "M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-10 4a5 5 0 0 1 6 0m-3 4h.01",
  network: "M12 3v6M5 21v-6h14v6M5 15v-3h14v3m-7-3V9M9 3h6v6H9z",
  settings:
    "m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3Zm3 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 14 0l1 5M4 12l1 5a8 8 0 0 0 14 0",
  logout: "M9 4H4v16h5m5-12 4 4-4 4m-6-4h13",
  search: "m16 16 5 5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  signal: "M5 20v-3m5 3v-7m5 7V9m5 11V4",
  clock: "M12 8v5l3 2m-3-12a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6",
  phone: "M7 2h10v20H7zm3 17h4",
  check: "m5 12 4 4L19 6",
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.devices}"/></svg>`;
}
const pages = {
  overview: "Dashboard",
  devices: "Connected devices",
  wifi: "Wi-Fi networks",
  network: "Router & network",
  settings: "Settings",
};
let page =
  location.hash.slice(1) in pages ? location.hash.slice(1) : "overview";
let live = null,
  access = null,
  accessError = "",
  wifi = null,
  portal = null,
  connected = false,
  fetching = false,
  modalHandler = null,
  notice = "",
  toastTimer;
let preferences = { refreshSeconds: 30 };
try {
  const saved = JSON.parse(localStorage.getItem("e-connect-preferences"));
  if (saved && [0, 10, 30, 60].includes(saved.refreshSeconds))
    preferences = saved;
} catch {}
const duration = (s) => {
  if (s == null || !Number.isFinite(Number(s))) return "—";
  s = Math.max(0, Number(s));
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
const stamp = (s) =>
  s
    ? new Date(s).toLocaleString("en-TZ", {
        timeZone: "Africa/Dar_es_Salaam",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 6500);
}
async function api(path, body) {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      connected = false;
      live = null;
    }
    throw Error(data.error || "The request failed");
  }
  return data;
}
function nav() {
  $("#nav").innerHTML = Object.entries(pages)
    .filter(([k]) => k !== "settings")
    .map(
      ([key, label]) =>
        `<button data-page="${key}" class="rail-button ${page === key ? "active" : ""}" aria-label="${label}" title="${label}">${icon(key)}<span class="rail-label">${label}</span></button>`,
    )
    .join("");
  $("#rail-settings").innerHTML = icon("settings");
  $("#rail-settings").className =
    "rail-button " + (page === "settings" ? "active" : "");
  $("#logout").innerHTML = icon("logout");
  $("#logout").className = "rail-button";
  $("#logout").hidden = !connected;
  $("#search-icon").innerHTML = icon("search");
  $("#refresh").innerHTML = icon("refresh");
  $("#page-title").textContent = pages[page];
  $("#connection").className = "connection " + (connected ? "online" : "");
  $("#connection").textContent = connected
    ? "Router connected"
    : "Not connected";
  $("#search").disabled = !connected;
  $("#refresh").disabled = fetching;
}
function go(next) {
  if (!(next in pages)) return;
  page = next;
  location.hash = next;
  $("#search").value = "";
  render();
  loadPage();
}
function empty(title, text, action = "") {
  return `<div class="empty"><span class="empty-icon">${icon("wifi")}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
}
function loginView() {
  return `<div class="login-layout"><section class="login-copy"><span class="pill">YOUR NETWORK, IN FOCUS</span><h2>A better view.<br>A little more control<span>.</span></h2><p>A clearer view of your router, Wi-Fi networks and connected devices.</p><div class="login-points"><span>${icon("wifi")} Direct Wi-Fi connection</span><span>${icon("shield")} Your router. Your credentials.</span></div><div class="login-price"><span>LOCAL FIRST · OPEN SOURCE</span><b>Your network. A clearer view.</b></div></section><section class="login-card"><div class="section-heading"><div><p class="kicker">LET’S GET CONNECTED</p><h2>Welcome back.</h2></div><span class="round-icon">${icon("wifi")}</span></div><p class="muted">Sign in with your router’s admin account while connected to its Wi-Fi.</p><form id="login-form"><label>Router address<input name="address" type="url" required value="http://192.168.1.1" autocomplete="url"></label><label>Username<input name="username" autocomplete="username" placeholder="Admin username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" placeholder="Router admin password" required></label><p id="login-error" class="form-error" role="alert"></p><button class="button dark wide">Connect to router ${icon("arrow")}</button><p class="fine-print">Your password isn’t saved. The connection goes directly to your local router.</p></form></section></div>`;
}
function clientAccess(client) {
  if (!access)
    return {
      label: accessError ? "Read failed" : "Checking…",
      tone: accessError ? "red" : "neutral",
      blocked: null,
    };
  const enabled = access.rules.some(
    (r) =>
      String(r.mac).toUpperCase() === client.mac &&
      [true, 1, "1"].includes(r.enableRule) &&
      r.ippro === "IPV4V6",
  );
  const blocked = access.allowlist ? !enabled : enabled;
  return {
    label:
      access.firewallEnabled === false
        ? "Firewall off"
        : blocked
          ? "Blocked"
          : "Allowed",
    tone: blocked ? "red" : "green",
    blocked: access.firewallEnabled === true ? blocked : null,
  };
}
function clientRows(limit) {
  let list = live?.clients || [];
  const search = $("#search").value.toLowerCase();
  if (search)
    list = list.filter((c) =>
      [c.name, c.ip, c.mac, c.band].some((v) =>
        String(v).toLowerCase().includes(search),
      ),
    );
  if (limit) list = list.slice(0, limit);
  if (!list.length)
    return empty(
      "No devices to show",
      live?.clientsError
        ? esc(live.clientsError)
        : search
          ? "Try another name, IP address or MAC address."
          : "No connected devices were returned by the router.",
    );
  return `<div class="table-scroll"><table><thead><tr><th>DEVICE</th><th>CONNECTION</th><th>SIGNAL</th><th>INTERNET ACCESS</th><th></th></tr></thead><tbody>${list
    .map((c, i) => {
      const a = clientAccess(c);
      return `<tr><td><div class="device-cell"><span class="device-avatar tone-${i % 4}">${icon(/DESKTOP|PC|LAPTOP/i.test(c.name) ? "devices" : "phone")}</span><div><b>${esc(c.name)}</b><small>${esc(c.ip)} <span>·</span> ${esc(c.mac)}</small></div></div></td><td><span class="band">${esc(c.band)}</span><small>${c.txrate ? c.txrate + " Mbps link" : "Link rate unavailable"}</small></td><td><div class="signal-cell">${icon("signal")} ${c.rssi ? c.rssi + " dBm" : "—"}</div></td><td><span class="status ${a.tone}">${a.label}</span></td><td><button class="dots" data-device="${c.mac}" aria-label="Options for ${esc(c.name)}" title="Device options">Internet access</button></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function overview() {
  const clients = live.clients || [],
    five = clients.filter((c) => c.band === "5 GHz").length,
    two = clients.filter((c) => c.band === "2.4 GHz").length;
  const pct = clients.length ? Math.round((five / clients.length) * 100) : 0,
    d = live.device;
  return `<section class="hero"><div class="hero-count"><span class="section-label">CONNECTED RIGHT NOW</span><div class="big-number">${live.clientsError ? "—" : clients.length}<span class="live-dot"></span></div><p>devices on your network</p><a href="#devices" data-page="devices" class="inline-link">See all connections ${icon("arrow")}</a></div><div class="hero-network"><div class="hero-network-top"><div><span class="percent">${pct}%</span><span> connected on 5 GHz</span></div><span class="pill light">${esc(live.radio.type || "Network connected")}</span></div><div class="spectrum"><progress class="spectrum-progress" max="100" value="${pct}" aria-label="Share of connected devices on 5 GHz"></progress><span class="spectrum-label">${pct}% on 5 GHz</span></div><div class="spectrum-legend"><span><i class="swatch mint"></i>5 GHz <b>${five}</b></span><span><i class="swatch peach"></i>2.4 GHz <b>${two}</b></span><span>Other <b>${clients.length - five - two}</b></span></div><p class="network-caption">${esc(d.model || "Your router")} <span>→</span> ${esc(d.indoor || "Wi-Fi network")}</p></div></section>
  <section class="metric-strip"><div><p>2.4 GHz connections</p><h2>${two}</h2><small>Devices reported by your router</small></div><div><p>5 GHz connections</p><h2>${five}</h2><small>Devices reported by your router</small></div><div><p>Router uptime</p><h2>${duration(d.uptime)}</h2><small>${esc(live.radio.operator || "Local connection")}</small></div></section>
  <div class="dashboard-bottom"><section class="devices-section"><div class="section-heading"><div><h2>Your connections <span class="count">${clients.length}</span></h2><p>Every device. One place.</p></div><button class="button subtle small" data-page="devices">View all ${icon("arrow")}</button></div>${clientRows(5)}</section><section class="health-section"><div class="section-heading"><h2>Router health</h2><span class="live-label">LIVE</span></div><div class="health-bloom"><div class="petal petal-one"><b>${Number.isFinite(d.cpu) ? d.cpu.toFixed(1) + "%" : "—"}</b><span>CPU usage</span></div><div class="petal petal-two"><b>${Number.isFinite(d.temperature) ? d.temperature + "°" : "—"}</b><span>Temperature</span></div><div class="petal petal-three"><b>${esc(d.memoryFree ? Math.round(parseFloat(d.memoryFree) / 1024) + " MB" : "—")}</b><span>Memory free</span></div><div class="petal petal-four"><b>${esc(live.radio.signal ? live.radio.signal + "/5" : "—")}</b><span>Mobile signal</span></div><div class="bloom-centre">${icon("shield")}</div></div><div class="health-footer"><span>${esc(d.model || "Connected router")}</span><button class="inline-link" data-page="network">Details ↗</button></div></section></div>
  <section class="bottom-note"><span>${icon("shield")} Local router management. No cloud account required.</span><button data-page="settings" class="inline-link">Workspace preferences ↗</button></section>`;
}
function devicesPage() {
  return `<div class="page-intro"><div><p class="kicker">PEOPLE & CONNECTIONS</p><h2>Make room for everyone.</h2><p>Inspect devices and manage their access directly on your router.</p></div><span class="pill">${live.clients.length} DEVICES</span></div><div class="filter-bar"><span class="tab active">All devices <b>${live.clients.length}</b></span><span class="filter-description">Use the search above to filter by name, address or band.</span></div>${clientRows()}<div class="soft-note">${icon("shield")} This PC is protected from blocking. Access changes are verified by reading the router’s rules back.</div>`;
}
function wifiPage() {
  return `<div class="page-intro"><div><p class="kicker">YOUR WIRELESS NETWORK</p><h2>A connection for every corner.</h2><p>Manage the names and passwords your devices use to connect.</p></div></div>${wifi ? `<div class="wifi-grid">${wifi.map((w) => `<article class="wifi-card"><span class="round-icon">${icon("wifi")}</span><span class="pill light">${esc(w.band)}</span><h2>${esc(w.ssid || "Network unavailable")}</h2>${w.error ? `<p class="form-error">${esc(w.error)}</p>` : `<p><span class="status ${w.enabled ? "green" : "neutral"}">${w.enabled ? "Enabled" : "Disabled"}</span></p><dl><div><dt>Broadcast</dt><dd>${w.broadcast ? "Visible" : "Hidden"}</dd></div><div><dt>Security</dt><dd>${esc(w.authentication || "Router managed")}</dd></div><div><dt>Password</dt><dd>••••••••</dd></div></dl><button class="button subtle" data-wifi="${w.id}">Edit network ${icon("arrow")}</button>`}</article>`).join("")}</div>` : empty("Reading Wi-Fi settings", "Connecting to your router…")}<div class="soft-note">${icon("wifi")} Changing a Wi-Fi name or password can disconnect this PC and other devices. You’ll confirm the change before it is sent.</div>`;
}

function details(rows) {
  return `<dl class="details-list">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v === undefined || v === null || v === "" ? "—" : v)}</dd></div>`).join("")}</dl>`;
}
function networkPage() {
  const d = live.device,
    r = live.radio;
  return `<div class="page-intro"><div><p class="kicker">THE HEART OF YOUR NETWORK</p><h2>${esc(d.model || "Your router")}</h2><p>Real device information from ${esc(live.address)}.</p></div><a class="button subtle" href="${esc(live.address)}" target="_blank" rel="noreferrer">Open full router admin ↗</a></div><div class="network-grid"><section class="detail-card"><h2>Device information</h2>${details(
    [
      ["Outdoor unit", d.model],
      ["Indoor unit", d.indoor],
      ["Firmware", d.firmware],
      ["Hardware", d.hardware],
      ["Uptime", duration(d.uptime)],
      ["CPU usage", Number.isFinite(d.cpu) ? d.cpu + "%" : "—"],
      [
        "Temperature",
        Number.isFinite(d.temperature) ? d.temperature + " °C" : "—",
      ],
      ["Memory free", d.memoryFree],
    ],
  )}</section><section class="detail-card"><h2>Mobile network</h2>${details([
    ["Operator", r.operator],
    ["Network type", r.type],
    ["Signal", r.signal ? r.signal + " / 5" : "—"],
    ["SIM", live.sim === "1" ? "Detected" : "Not ready"],
    ["Router address", live.address],
    ["Last read", stamp(live.updatedAt)],
  ])}<p class="muted">Client link rates are Wi-Fi negotiation speeds, not measured internet throughput.</p>${r.error ? `<p class="form-error">${esc(r.error)}</p>` : ""}</section></div>${portalCard()}`;
}
function portalCard() {
  const labels = {
    configuration_available: "Configuration available",
    access_denied: "Account restricted",
    session_expired: "Sign in again",
    unconfirmed: "Not confirmed",
  };
  return `<section class="detail-card portal-inspection"><div class="section-heading"><h2>Native captive portal</h2><span class="status ${portal?.status === "configuration_available" ? "green" : "neutral"}">${portal ? labels[portal.status] : "Read-only check"}</span></div><p>The router’s own firmware includes a portal settings page. Check whether your current account can read the configuration. This does not enable the portal or change Wi-Fi access.</p><button class="button subtle" id="check-portal">Check portal support ${icon("arrow")}</button>${
    portal
      ? `<p>${esc(portal.summary)}</p>${details([
          ["Account level", portal.menu.accountLevel],
          ["Native menu visible", portal.menu.visible ? "Yes" : "No"],
          [
            "Portal currently enabled",
            portal.status === "configuration_available"
              ? portal.enabled
                ? "Yes"
                : "No"
              : "Not confirmed",
          ],
          ["Last checked", stamp(portal.checkedAt)],
        ])}${portal.settings ? details(Object.entries(portal.settings).map(([k, v]) => [esc(k), v])) : ""}`
      : ""
  }</section>`;
}
function settingsPage() {
  return `<div class="page-intro"><div><p class="kicker">YOUR WORKSPACE</p><h2>Make E-connect yours.</h2><p>Preferences are stored in this browser. Router credentials are never saved.</p></div></div><section class="detail-card"><h2>Refresh preferences</h2><form id="preferences-form"><label>Refresh interval<select name="refreshSeconds">${[0, 10, 30, 60].map((n) => `<option value="${n}" ${preferences.refreshSeconds === n ? "selected" : ""}>${n ? n + " seconds" : "Manual only"}</option>`).join("")}</select></label><button class="button dark">Save preferences</button></form></section><section class="detail-card portal-inspection"><h2>Compatibility</h2><p>E-connect supports the local CGI protocol used by some ZLT/Tozed routers. Available controls depend on firmware and account permissions. It is not a universal router manager.</p><p class="muted">Use only with networks you administer. Updates to Wi-Fi settings can disconnect connected devices.</p></section>`;
}
function render() {
  nav();
  const shownNotice =
    notice ||
    (["overview", "devices"].includes(page) && connected && accessError
      ? "Internet access controls: " + accessError
      : "");
  $("#banner").innerHTML = shownNotice
    ? `<div class="alert">${icon("wifi")}<span>${esc(shownNotice)}</span></div>`
    : "";
  if (!connected) {
    $("#view").innerHTML = loginView();
    return;
  }
  $("#view").innerHTML = {
    overview,
    devices: devicesPage,
    wifi: wifiPage,
    network: networkPage,
    settings: settingsPage,
  }[page]();
  $("#last-updated").textContent =
    "Last synced " + stamp(live.updatedAt) + " · Local router";
}
async function loadPage() {
  const requested = page;
  try {
    if (!connected) return;
    if (page === "wifi") wifi = await api("/api/router/wifi");
    if (page === "devices" || page === "overview") {
      try {
        access = await api("/api/router/access");
        accessError = "";
        if (access.firewallError)
          accessError =
            "MAC rules read successfully. Firewall state could not be verified: " +
            access.firewallError;
      } catch (error) {
        access = null;
        accessError = error.message;
      }
    }
    if (page === requested) render();
  } catch (e) {
    toast(e.message);
    render();
  }
}
async function refresh(silent = false) {
  if (fetching) return;
  fetching = true;
  nav();
  try {
    live = await api("/api/router/status");
    connected = true;
    notice = "";
    render();
    await loadPage();
  } catch (e) {
    if (!silent || connected) notice = e.message;
    render();
  } finally {
    fetching = false;
    nav();
  }
}
function openModal(title, content, submit, handler, kicker = "YOUR NETWORK") {
  $("#modal-title").textContent = title;
  $("#modal-kicker").textContent = kicker;
  $("#modal-content").innerHTML = content;
  $("#modal-error").textContent = "";
  $("#modal-submit").textContent = submit || "Done";
  $("#modal-submit").hidden = !handler;
  modalHandler = handler;
  $("#modal").showModal();
}

function deviceModal(mac) {
  const client = live.clients.find((c) => c.mac === mac);
  const a = clientAccess(client),
    protectedDevice = access?.protectedMacs.includes(client.mac);
  openModal(
    client.name,
    `${details([
      ["IP address", client.ip],
      ["MAC address", client.mac],
      ["Wi-Fi band", client.band],
      ["Signal", client.rssi ? client.rssi + " dBm" : "—"],
      ["Wi-Fi link", client.txrate ? client.txrate + " Mbps" : "—"],
      ["Internet access", a.label],
    ])}<p class="fine-print">${protectedDevice ? "This is the admin PC. Blocking it is disabled." : a.blocked === null ? "Access rules could not be read or the firewall is disabled. No changes will be sent." : a.blocked ? "Allowing restores internet according to the router’s firewall policy." : "Blocking disconnects this device from internet access. It may remain connected to Wi-Fi."}</p>`,
    a.blocked ? "Allow internet" : "Block internet",
    protectedDevice || a.blocked === null
      ? null
      : async () => {
          await api("/api/router/access", {
            mac: client.mac,
            blocked: !a.blocked,
          });
          $("#modal").close();
          await refresh();
          toast("Access change verified on your router.");
        },
    "CONNECTED DEVICE",
  );
}
document.addEventListener("click", async (event) => {
  const target = event.target;
  const link = target.closest("[data-page]");
  if (link) {
    event.preventDefault();
    go(link.dataset.page);
  }
  const device = target.closest("[data-device]");
  if (device) deviceModal(device.dataset.device);
  const wifiButton = target.closest("[data-wifi]");
  if (wifiButton) {
    const network = wifi.find((w) => w.id === Number(wifiButton.dataset.wifi));
    openModal(
      "Edit " + network.band + " network",
      `<p class="muted">Devices using this network may disconnect after saving. Reconnect using the new details.</p><label>Network name<input name="ssid" required value="${esc(network.ssid)}" maxlength="32"></label><label>New password <span class="muted">(optional)</span><input name="password" type="password" minlength="8" maxlength="63" autocomplete="new-password" placeholder="Leave blank to keep the current password"></label><input type="hidden" name="band" value="${network.id}"><label class="checkbox"><input type="checkbox" required> I understand this may disconnect Wi-Fi devices.</label>`,
      "Apply to router",
      async (form) => {
        await api("/api/router/wifi", Object.fromEntries(form));
        $("#modal").close();
        toast("Router accepted the update. Reconnect if your Wi-Fi changed.");
        wifi = null;
        await loadPage();
      },
    );
  }
});
document.addEventListener("submit", async (event) => {
  if (event.target.id === "login-form") {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    $("#login-error").textContent = "";
    try {
      await api(
        "/api/router/login",
        Object.fromEntries(new FormData(event.target)),
      );
      event.target.elements.password.value = "";
      await refresh();
    } catch (error) {
      $("#login-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }
  if (event.target.id === "preferences-form") {
    event.preventDefault();
    preferences.refreshSeconds = Number(
      new FormData(event.target).get("refreshSeconds"),
    );
    localStorage.setItem("e-connect-preferences", JSON.stringify(preferences));
    scheduleRefresh();
    toast("Preferences saved.");
  }
});
$("#modal-form").onsubmit = async (event) => {
  event.preventDefault();
  if (!modalHandler) return;
  $("#modal-submit").disabled = true;
  $("#modal-error").textContent = "";
  try {
    await modalHandler(new FormData(event.target));
  } catch (error) {
    $("#modal-error").textContent = error.message;
  } finally {
    $("#modal-submit").disabled = false;
  }
};
$("#close-modal").onclick = $("#cancel-modal").onclick = () =>
  $("#modal").close();
$("#refresh").onclick = () => refresh();
$("#logout").onclick = () =>
  openModal(
    "Disconnect your router?",
    `<p>This ends the local E-connect session. Existing router settings stay as they are.</p>`,
    "Disconnect",
    async () => {
      await api("/api/router/logout", {});
      connected = false;
      live = null;
      $("#modal").close();
      render();
    },
  );
$("#search").oninput = () => {
  if (connected && !["devices", "overview"].includes(page)) {
    page = "devices";
    location.hash = "devices";
  }
  render();
};
document.addEventListener("click", async (event) => {
  if (event.target.closest("#check-portal")) {
    const button = event.target.closest("button");
    button.disabled = true;
    try {
      portal = await api("/api/router/portal");
      render();
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  }
});
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (next in pages && next !== page) {
    page = next;
    render();
    loadPage();
  }
});
render();
refresh(true);
let refreshTimer;
function scheduleRefresh() {
  clearInterval(refreshTimer);
  if (preferences.refreshSeconds)
    refreshTimer = setInterval(() => {
      if (
        connected &&
        !$("#modal").open &&
        !["settings", "wifi"].includes(page)
      )
        refresh(true);
    }, preferences.refreshSeconds * 1000);
}
scheduleRefresh();
