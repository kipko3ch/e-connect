const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inspectPortal, portalMenu } = require("./portal-inspection");
test("native menu bit 213 is restricted to level 1 with zero flag", () => {
  assert.equal(portalMenu("0".repeat(128), "3").visible, false);
  assert.equal(portalMenu("0".repeat(128), "1").visible, true);
});
test("portal inspection only reads and strips unrelated response fields", async () => {
  const requests = [];
  const router = {
    sessionId: "test-session",
    call: async (cmd) => {
      assert.equal(cmd, 20005);
      return { account_level: "3", web_page_hide: "0".repeat(128) };
    },
    json: async (path, body) => {
      requests.push(body);
      return {
        success: true,
        protalSw: "0",
        serverHostname: "wifi.example.com",
        portalPort: "2060",
        token: "must-not-leak",
      };
    },
  };
  const result = await inspectPortal(router);
  assert.equal(result.status, "configuration_available");
  assert.equal(result.enabled, false);
  assert.equal(result.menu.visible, false);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].cmd, 468);
  assert(!JSON.stringify(result).includes("must-not-leak"));
  assert(!JSON.stringify(result).includes("test-session"));
});
test("shipped UI is not treated as proof of backend support or permissions", async () => {
  for (const [response, status] of [
    [{ success: false, message: "LIMITED_ACCESS" }, "access_denied"],
    [{ success: false, message: "NO_AUTH" }, "session_expired"],
    [{ success: true }, "unconfirmed"],
  ]) {
    const result = await inspectPortal({
      call: async () => ({}),
      json: async () => response,
    });
    assert.equal(result.status, status);
  }
});
