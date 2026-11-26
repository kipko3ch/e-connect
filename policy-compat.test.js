const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Router } = require("./router");
test("matches original app blocklist default when successful command 28 omits datas", async () => {
  const r = new Router("http://192.168.1.1");
  r.call = async (cmd) =>
    cmd === 28
      ? { success: true, cmd: 28 }
      : cmd === 23
        ? { success: true, datas: [] }
        : { success: true, fw_switch: "1" };
  const p = await r.accessRules();
  assert.equal(p.allowlist, false);
  assert.equal(p.policySource, "legacy-blocklist");
  assert.equal(p.firewallEnabled, true);
});
test("empty or malformed policy datas is not silently treated as blocklist", async () => {
  for (const response of [
    { success: true, datas: [] },
    { success: true, datas: {} },
    { success: false },
  ]) {
    const r = new Router("http://192.168.1.1");
    r.call = async (cmd) =>
      cmd === 28 ? response : cmd === 23 ? { datas: [] } : { fw_switch: "1" };
    await assert.rejects(r.accessRules(), /unexpected or empty/);
  }
});
