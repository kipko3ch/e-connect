const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const http = require("node:http");
const { createServer, clientsFrom } = require("./server");
test("client inventory excludes stale Wi-Fi DHCP leases and merges bands by MAC", () => {
  const result = clientsFrom({
    wlan5g_wifi_info: [
      {
        mac: "aa:bb:cc:dd:ee:ff",
        user: "Phone",
        ip: "192.168.1.2",
        rssi: "-61",
        txrate: "433",
      },
    ],
    dhcp_list_info: [
      {
        mac: "AA:BB:CC:DD:EE:FF",
        hostname: "Phone",
        seconds: "100",
        interface: "wlan",
      },
      { mac: "11:22:33:44:55:66", hostname: "Offline", interface: "wlan" },
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].band, "5 GHz");
  assert.equal(result[0].seconds, 100);
  assert.equal(result[0].rssi, -61);
});

test("authenticated local APIs preserve device controls and refuse cross-origin requests", async () => {
  const actions = [];
  const router = {
    origin: "http://192.168.1.1",
    discover: async () => ({ address: "http://192.168.1.1" }),
    login: async () => ({ address: "http://192.168.1.1", userLevel: "3" }),
    status: async () => ({
      address: "http://192.168.1.1",
      updatedAt: new Date().toISOString(),
      device: {
        board_type: "Test router",
        token: "never-return",
        IMSI: "never-return",
      },
      clients: {
        wlan5g_wifi_info: [{ mac: "02:11:22:33:44:55", user: "Phone" }],
      },
      global: {},
      radio: {},
    }),
    accessRules: async () => ({
      rules: [],
      allowlist: false,
      firewallEnabled: true,
    }),
    setBlocked: async (mac, blocked) => {
      actions.push({ mac, blocked });
      return { verified: true, blocked };
    },
    wifi: async () => [{ band: "5 GHz", ssid: "Test network" }],
  };
  const server = createServer({ routerFactory: () => router });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://localhost:" + server.address().port;
  let cookie = "";
  const request = (route, body) =>
    fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    assert.equal((await request("/api/router/status")).status, 401);
    let res = await request("/api/router/login", {
      address: router.origin,
      username: "admin",
      password: "test-only",
    });
    assert.equal(res.status, 200);
    cookie = res.headers.get("set-cookie").split(";")[0];
    assert(cookie.startsWith("ec_session="));
    res = await request("/api/router/status");
    assert.equal(res.status, 200);
    const text = await res.text();
    assert(!text.includes("never-return"));
    assert(text.includes("Test router"));
    assert.equal(
      (
        await fetch(base + "/api/router/status", {
          headers: { Cookie: cookie, Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    const rejectedHost = await new Promise((resolve, reject) => {
      const req = http.get(
        base + "/",
        { headers: { Host: "untrusted.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
    });
    assert.equal(rejectedHost, 403);
    assert.equal((await request("/api/router/wifi")).status, 200);
    assert.equal(
      (
        await request("/api/router/access", {
          mac: "02:11:22:33:44:55",
          blocked: true,
        })
      ).status,
      200,
    );
    assert.deepEqual(actions, [{ mac: "02:11:22:33:44:55", blocked: true }]);
    const localMac = Object.values(os.networkInterfaces()).flat()[0]?.mac;
    if (localMac)
      assert.equal(
        (await request("/api/router/access", { mac: localMac, blocked: true }))
          .status,
        400,
      );
    for (const file of [
      "/router.js",
      "/.env",
      "/data/tkonnect.sqlite",
      "/reference/app-service.js",
    ])
      assert.equal((await request(file)).status, 404);
    assert.equal((await request("/api/unknown")).status, 404);
    assert.equal((await fetch(base + "/", { method: "HEAD" })).status, 200);
    await request("/api/router/logout", {});
    assert.equal((await request("/api/router/status")).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
