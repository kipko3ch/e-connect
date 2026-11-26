const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Router } = require("./router");
for (const allowlist of [false, true])
  test(`MAC access preserves other rules in ${allowlist ? "allowlist" : "blocklist"} mode`, async () => {
    const router = new Router("http://192.168.1.1");
    // No network transport is used in this test; only the recovered rule transformation.
    let rules = [
      {
        mac: "02:00:00:00:00:99",
        enableRule: true,
        ippro: "IPV4V6",
        remark: "Keep this",
      },
    ];
    router.accessRules = async () => ({
      rules,
      allowlist,
      firewallEnabled: true,
    });
    router.cmd = { token: 233 };
    router.call = async (cmd, method, extra) => {
      if (cmd === 233) return { token: "fresh" };
      if (cmd === 23 && method === "POST") rules = extra.datas;
      return { success: true };
    };
    const mac = "02:11:22:33:44:55";
    await router.setBlocked(mac, true);
    assert.deepEqual(rules[0], {
      mac: "02:00:00:00:00:99",
      enableRule: true,
      ippro: "IPV4V6",
      remark: "Keep this",
    });
    await router.setBlocked(mac, false);
    const enabled = rules.some((r) => r.mac === mac && r.enableRule);
    assert.equal(enabled, allowlist);
  });
test("disabled firewall prevents an access write", async () => {
  const r = new Router("http://192.168.1.1");
  r.accessRules = async () => ({ firewallEnabled: false, rules: [] });
  r.call = () => {
    throw Error("Unexpected write");
  };
  await assert.rejects(
    r.setBlocked("02:11:22:33:44:55", true),
    /firewall is disabled/,
  );
});
