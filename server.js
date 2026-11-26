const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomBytes } = require("node:crypto");
const { Router } = require("./router");
const { inspectPortal } = require("./portal-inspection");
function clientsFrom(data) {
  const c = data || {};
  const byMac = new Map();
  for (const [key, band] of [
    ["wlan24g_wifi_info", "2.4 GHz"],
    ["wlan5g_wifi_info", "5 GHz"],
    ["wlan6g_wifi_info", "6 GHz"],
    ["dhcp_list_info", "LAN"],
  ])
    for (const row of c[key] || []) {
      const mac = String(row.mac || "").toUpperCase();
      if (!mac) continue;
      if (
        key === "dhcp_list_info" &&
        !byMac.has(mac) &&
        row.interface !== "eth"
      )
        continue;
      const old = byMac.get(mac) || {};
      byMac.set(mac, {
        ...row,
        ...old,
        mac,
        name:
          old.name ||
          (row.user && row.user !== "*"
            ? row.user
            : row.hostname && row.hostname !== "*"
              ? row.hostname
              : "Unnamed device"),
        band: old.band || band,
        ip: old.ip || row.ip,
        seconds: row.seconds || old.seconds,
      });
    }
  return [...byMac.values()].map((c) => ({
    name: c.name,
    mac: c.mac,
    ip: c.ip,
    band: c.band,
    rssi: Number(c.rssi) || null,
    txrate: Number(c.txrate) || null,
    rxrate: Number(c.rxrate) || null,
    seconds: Number(c.seconds) || 0,
  }));
}

function createServer({
  routerFactory = (address) => new Router(address),
} = {}) {
  const sessions = new Map();
  let loginBusy = false,
    queue = Promise.resolve();
  const lock = (fn) => {
    const result = queue.then(fn, fn);
    queue = result.catch(() => {});
    return result;
  };
  const ownMacs = new Set(
    Object.values(os.networkInterfaces())
      .flat()
      .map((n) => n.mac.toUpperCase()),
  );
  const server = http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || ""))
      return send(403, { error: "Local access only" });
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`
    )
      return send(403, { error: "Origin not allowed" });
    const url = new URL(req.url, "http://localhost");
    async function body() {
      if (!req.headers["content-type"]?.startsWith("application/json"))
        throw Error("JSON required");
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) throw Error("Request too large");
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    const key = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("ec_session="))
      ?.slice(11);
    for (const [id, item] of sessions)
      if (Date.now() - item.at > 1800000) sessions.delete(id);
    const session = sessions.get(key);
    if (url.pathname === "/api/router/discover" && req.method === "GET") {
      try {
        return send(
          200,
          await routerFactory(
            url.searchParams.get("address") || "http://192.168.1.1",
          ).discover(),
        );
      } catch (error) {
        return send(502, { error: error.message });
      }
    }
    if (url.pathname === "/api/router/login" && req.method === "POST") {
      if (loginBusy) return send(429, { error: "A login is already running" });
      loginBusy = true;
      try {
        const input = await body();
        if (
          typeof input.username !== "string" ||
          typeof input.password !== "string" ||
          !input.username ||
          !input.password ||
          input.username.length > 100 ||
          input.password.length > 256
        )
          throw Error("Enter a valid router username and password");
        const router = routerFactory(input.address);
        const result = await lock(() =>
          router.login(input.username, input.password),
        );
        if (key) sessions.delete(key);
        const id = randomBytes(32).toString("hex");
        sessions.set(id, { router, at: Date.now() });
        res.setHeader(
          "Set-Cookie",
          `ec_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`,
        );
        return send(200, result);
      } catch (error) {
        return send(400, { error: error.message });
      } finally {
        loginBusy = false;
      }
    }
    if (url.pathname.startsWith("/api/")) {
      if (!session) return send(401, { error: "Sign in to your router first" });
      session.at = Date.now();
      res.setHeader(
        "Set-Cookie",
        `ec_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`,
      );
      try {
        if (url.pathname === "/api/router/status" && req.method === "GET") {
          const data = await lock(() => session.router.status());
          if (data.device?.error) throw Error(data.device.error);
          const d = data.device || {},
            radio = data.radio || {};
          return send(200, {
            address: data.address,
            updatedAt: data.updatedAt,
            device: {
              model: d.board_type,
              indoor: d.idu_dev_type,
              firmware: d.real_fwversion,
              hardware: d.hwversion,
              uptime: Number(d.uptime),
              cpu: Number(d.cpu_usage),
              temperature: Number(d.device_temperature),
              memoryFree: d.memoryFree,
            },
            radio: {
              operator: radio.network_operator,
              type: radio.network_type_str,
              signal: Number(radio.signal_lvl),
              upload:
                Math.max(0, Number(radio.mac_lte_ul) || 0) +
                Math.max(0, Number(radio.mac_nr_ul) || 0),
              download:
                Math.max(0, Number(radio.mac_lte_dl) || 0) +
                Math.max(0, Number(radio.mac_nr_dl) || 0),
              monthUsage: radio.mon_total_flow,
              error: radio.error,
            },
            clients: clientsFrom(data.clients),
            clientsError: data.clients?.error,
            sim: data.global?.sim_status,
            networkState: data.global?.networkState,
          });
        }

        if (url.pathname === "/api/router/wifi" && req.method === "GET")
          return send(200, await lock(() => session.router.wifi()));
        if (url.pathname === "/api/router/wifi" && req.method === "POST") {
          const input = await body();
          return send(200, await lock(() => session.router.updateWifi(input)));
        }
        if (url.pathname === "/api/router/portal" && req.method === "GET")
          return send(200, await lock(() => inspectPortal(session.router)));
        if (url.pathname === "/api/router/access" && req.method === "GET") {
          const policy = await lock(() => session.router.accessRules());
          return send(200, { ...policy, protectedMacs: [...ownMacs] });
        }
        if (url.pathname === "/api/router/access" && req.method === "POST") {
          const input = await body();
          if (typeof input.blocked !== "boolean")
            throw Error("Specify allow or block");
          if (ownMacs.has(String(input.mac).toUpperCase()))
            throw Error(
              "This PC is protected from access changes. Choose another device.",
            );
          return send(
            200,
            await lock(() =>
              session.router.setBlocked(input.mac, input.blocked),
            ),
          );
        }
        if (url.pathname === "/api/router/logout" && req.method === "POST") {
          sessions.delete(key);
          res.setHeader(
            "Set-Cookie",
            "ec_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          );
          return send(200, { disconnected: true });
        }
        return send(404, { error: "Unknown API route" });
      } catch (error) {
        return send(400, { error: error.message });
      }
    }
    if (!["GET", "HEAD"].includes(req.method))
      return send(405, { error: "Method not allowed" });
    const files = {
      "/": "index.html",
      "/index.html": "index.html",
      "/app.js": "app.js",
      "/style.css": "style.css",
    };
    const file = files[url.pathname];
    if (!file) return send(404, { error: "Not found" });
    res.writeHead(200, {
      "Content-Type": file.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : file.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(path.join(__dirname, "public", file)).pipe(res);
  });
  return server;
}
if (require.main === module)
  createServer().listen(process.env.PORT || 4173, "127.0.0.1", () =>
    console.log("E-connect: http://localhost:" + (process.env.PORT || 4173)),
  );
module.exports = { createServer, clientsFrom };
