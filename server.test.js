const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Router, redact, routerOrigin } = require("./router");
const { createHash } = require("node:crypto");
test("Numeric local login flow hashes challenge plus password and reads real commands", async () => {
  const seen = [];
  const r = new Router("http://192.168.1.1", async (url, opts) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    seen.push(body);
    let data;
    if (url.endsWith("supportAPP.json")) data = { model: "/http.cgi" };
    else if (body.cmd === 232) data = { token: "challenge" };
    else if (body.cmd === 100) {
      assert.equal(
        body.passwd,
        createHash("sha256")
          .update("challenge" + "example-password")
          .digest("hex"),
      );
      assert.equal(body.token, "challenge");
      assert.equal(body.username, "admin");
      data = { AUTH: "AUTH", sessionId: "router-session", user_level: "3" };
    } else if (body.cmd === 233) data = { token: "refreshed" };
    else {
      assert.equal(body.sessionId, "router-session");
      data = { cmd: body.cmd, success: true };
    }
    return new Response(JSON.stringify(data));
  });
  await r.login("admin", "example-password");
  const status = await r.status();
  assert.equal(status.device.cmd, 207);
  assert.equal(status.clients.cmd, 20007);
  assert.equal(status.global.cmd, 20005);
  assert(!JSON.stringify(seen).includes("example-password"));
});
test("private targets and credential redaction", () => {
  assert.throws(() => routerOrigin("http://example.com"));
  assert.throws(() => routerOrigin("http://127.0.0.1"));
  assert.throws(() => routerOrigin("http://192.168.1.1/path"));
  assert.deepEqual(
    redact({
      token: "a",
      sessionId: "b",
      nested: { wifi_password: "x", model: "real" },
    }),
    { nested: { model: "real" } },
  );
});
test("failed router login does not create authenticated state", async () => {
  const r = new Router(
    "http://192.168.1.1",
    async (url, opts) =>
      new Response(
        JSON.stringify(
          url.endsWith("json")
            ? { model: "/http.cgi" }
            : JSON.parse(opts.body).cmd === 232
              ? { token: "challenge" }
              : { AUTH: "FAIL" },
        ),
      ),
  );
  await assert.rejects(r.login("admin", "bad"), /rejected/);
});
