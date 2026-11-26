const { randomBytes, createHash } = require("node:crypto");
const commands = {
  plain: { challenge: 232, login: 100, token: 233, info: 207, check: 104 },
  uuid: {
    challenge: "3830c61a-620d-47da-ae47-33d8401401c4",
    login: "d2aa9843-494b-4947-9621-a46ec652ecd9",
    token: "f3b70f2f-8721-48c4-87ec-22d8c92dd3c9",
    info: "f4f88a4a-0178-4897-b4a2-9b53bf86e631",
    check: "835e31b3-a45a-4504-80df-586bf8a509aa",
  },
};
function routerOrigin(address) {
  const url = new URL(address);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("Use a local router address such as http://192.168.1.1");
  const h = url.hostname;
  const parts = h.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255) ||
    !(
      parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    )
  )
    throw Error("Router address must be a private IPv4 address");
  return url.origin;
}
class Router {
  constructor(address, request = fetch) {
    this.origin = routerOrigin(address);
    this.request = request;
    this.sessionId = randomBytes(32).toString("hex");
    this.token = "";
    this.cookies = "";
  }
  async json(path, body) {
    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-cache",
    };
    if (this.cookies) headers.Cookie = this.cookies;
    let response;
    try {
      response = await this.request(this.origin + path, {
        method: body ? "POST" : "GET",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
    } catch {
      throw Error(
        "Cannot reach the router. Connect this PC to its Wi-Fi and check the address.",
      );
    }
    if (!response.ok) throw Error("Router returned HTTP " + response.status);
    const cookies = response.headers.getSetCookie?.() || [];
    if (cookies.length)
      this.cookies = cookies.map((c) => c.split(";")[0]).join("; ");
    try {
      return await response.json();
    } catch {
      throw Error("Router returned an unsupported response");
    }
  }
  async discover() {
    const support = await this.json("/supportAPP.json");
    if (support.model !== "/http.cgi")
      throw Error(
        "This router does not advertise the supported local CGI protocol",
      );
    this.cmd = commands[support.cmd_encryption === "yes" ? "uuid" : "plain"];
    return {
      address: this.origin,
      protocol:
        support.cmd_encryption === "yes" ? "UUID commands" : "Numeric commands",
    };
  }
  async call(cmd, method = "GET", extra = {}) {
    const data = { cmd, method, ...extra, sessionId: this.sessionId };
    if (method === "POST" && this.token) data.token = this.token;
    const result = await this.json("/cgi-bin/http.cgi", data);
    if (result.message === "LIMITED_ACCESS")
      throw Error(
        "Router account restricted: command " +
          cmd +
          " returned LIMITED_ACCESS",
      );
    if (["NO_AUTH", "LOGIN_TIMEOUT"].includes(result.message))
      throw Error("Router session expired or access denied. Sign in again.");
    if (result.success === false && cmd !== this.cmd?.login)
      throw Error("Router rejected command " + cmd);
    return result;
  }
  async login(username, password) {
    await this.discover();
    const challenge = await this.call(this.cmd.challenge);
    if (typeof challenge.token !== "string" || !challenge.token)
      throw Error("Router did not supply a login token");
    this.token = challenge.token;
    const auth = await this.call(this.cmd.login, "POST", {
      username,
      passwd: createHash("sha256")
        .update(this.token + password)
        .digest("hex"),
    });
    if (auth.AUTH !== "AUTH")
      throw Error(
        auth.login_fail2 === "fail"
          ? "Router login is temporarily locked. Wait before trying again."
          : "Router rejected the admin login. Check username and password.",
      );
    if (typeof auth.sessionId !== "string" || !auth.sessionId)
      throw Error("Router did not return a valid session");
    this.sessionId = auth.sessionId;
    const token = await this.call(this.cmd.token);
    if (typeof token.token !== "string" || !token.token)
      throw Error("Router did not refresh the session token");
    this.token = token.token;
    return { address: this.origin, userLevel: auth.user_level };
  }
  async status() {
    const result = {
      address: this.origin,
      updatedAt: new Date().toISOString(),
    };
    for (const [name, cmd] of [
      ["device", this.cmd.info],
      ["global", 20005],
      ["clients", 20007],
      ["radio", 20008],
    ]) {
      try {
        result[name] = await this.call(cmd);
      } catch (e) {
        result[name] = { error: e.message };
      }
    }
    return result;
  }
}
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !/(pass|token|session|secret|credential|preshared|psk|(^|_)key($|_))/i.test(
              k,
            ),
        )
        .map(([k, v]) => [k, redact(v)]),
    );
  return value;
}

Router.prototype.accessRules = async function () {
  const read = async (cmd, label, extra = {}) => {
    try {
      return await this.call(cmd, "GET", extra);
    } catch (error) {
      throw Error(label + " (command " + cmd + "): " + error.message);
    }
  };
  const defaults = await read(28, "Default access policy");
  const rules = await read(23, "MAC whitelist/blacklist", { getfun: true });
  // The mobile app reads this only on models advertising its firewall switch.
  // An unavailable optional switch must not hide the actual MAC rules.
  let firewall,
    firewallError = null;
  try {
    firewall = await read(367, "Firewall state");
  } catch (error) {
    firewallError = error.message;
  }
  if (!Array.isArray(rules.datas))
    throw Error(
      "MAC whitelist/blacklist (command 23) did not return its rules list.",
    );
  // The legacy local client initializes defaultRule=false and only
  // overrides it when response.datas exists. Match that legacy blocklist
  // behavior on an explicitly successful response with no datas property.
  const legacyBlocklist =
    defaults.success === true && !Object.hasOwn(defaults, "datas");
  if (
    !legacyBlocklist &&
    (!Array.isArray(defaults.datas) || !defaults.datas[0])
  )
    throw Error(
      "Default access policy (command 28) returned an unexpected or empty policy record.",
    );
  const accept = legacyBlocklist ? true : defaults.datas[0].acceptAll;
  if (![true, false, 0, 1, "0", "1"].includes(accept))
    throw Error("Unrecognized router access policy");
  return {
    allowlist: [false, 0, "0"].includes(accept),
    policySource: legacyBlocklist ? "legacy-blocklist" : "router-policy-record",
    rules: rules.datas,
    firewallEnabled: firewall
      ? [true, 1, "1"].includes(firewall.fw_switch)
      : null,
    firewallError,
  };
};
Router.prototype.setBlocked = async function (mac, blocked) {
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac))
    throw Error("Invalid device MAC address");
  mac = mac.toUpperCase();
  const policy = await this.accessRules();
  if (!policy.firewallEnabled)
    throw Error(
      "Router firewall is disabled. Enable it in the router admin before using access controls",
    );
  const rules = structuredClone(policy.rules);
  const desired = policy.allowlist ? !blocked : blocked;
  let found = false;
  for (const rule of rules) {
    if (String(rule.mac).toUpperCase() === mac) {
      rule.enableRule = desired;
      rule.ippro = "IPV4V6";
      found = true;
    }
  }
  if (!found && desired) {
    if (rules.length >= 32) throw Error("Router MAC rule limit reached (32)");
    rules.push({
      enableLink: policy.allowlist,
      enableRule: true,
      remark: "E-connect",
      ippro: "IPV4V6",
      mac,
    });
  }
  if (!found && !desired) return { blocked, verified: true };
  const token = await this.call(this.cmd.token);
  if (token.token) this.token = token.token;
  const write = await this.call(23, "POST", { success: true, datas: rules });
  if (write.success !== true) throw Error("Router did not accept the MAC rule");
  const applied = await this.call(
    this.cmd === commands.plain ? 20 : "06df6e71-3091-4fd3-98c4-759127d0f366",
    "POST",
  );
  if (applied.success !== true)
    throw Error("Router did not confirm applying the access rules");
  const after = await this.accessRules();
  const enabled = after.rules.some(
    (r) =>
      String(r.mac).toUpperCase() === mac &&
      [true, 1, "1"].includes(r.enableRule) &&
      r.ippro === "IPV4V6",
  );
  const actual = after.allowlist ? !enabled : enabled;
  if (actual !== blocked)
    throw Error("Router rule readback did not match the requested access");
  return { blocked, verified: true };
};
Router.prototype.wifi = async function () {
  const out = [];
  for (const [band, plain, uuid] of [
    ["2.4 GHz", 2, "79e44d29-789a-47d5-ab6a-692f43841fc9"],
    ["5 GHz", 211, "bd9f2e03-1fc4-4b7c-bcda-8bfb6550aa88"],
  ]) {
    const cmd = this.cmd === commands.plain ? plain : uuid;
    try {
      const data = await this.call(cmd, "GET", { subcmd: 0 });
      out.push({
        band,
        id: plain,
        ssid: Buffer.from(data.ssid || "", "base64").toString("utf8"),
        enabled: data.wifiOpen === "1",
        broadcast: data.broadcast === "1",
        authentication: data.authenticationType,
        error:
          data.success === false
            ? "Router did not return Wi-Fi settings"
            : null,
      });
    } catch (e) {
      out.push({ band, id: plain, error: e.message });
    }
  }
  return out;
};
Router.prototype.updateWifi = async function ({ band, ssid, password }) {
  if (![2, 211].includes(Number(band))) throw Error("Unknown Wi-Fi band");
  if (typeof ssid !== "string" || !ssid.trim() || Buffer.byteLength(ssid) > 32)
    throw Error("SSID must be 1-32 UTF-8 bytes");
  if (
    password &&
    (typeof password !== "string" ||
      password.length < 8 ||
      password.length > 63)
  )
    throw Error("Wi-Fi password must have 8-63 characters");
  const cmd =
    this.cmd === commands.plain
      ? Number(band)
      : Number(band) === 2
        ? "79e44d29-789a-47d5-ab6a-692f43841fc9"
        : "bd9f2e03-1fc4-4b7c-bcda-8bfb6550aa88";
  const raw = await this.call(cmd, "GET", { subcmd: 0 });
  if (raw.success === false || !raw.authenticationType || !raw.ssid)
    throw Error("Current Wi-Fi settings could not be read safely");
  if (!password && typeof raw.key !== "string")
    throw Error(
      "Router did not return the current password. Supply a new password to update this network safely",
    );
  const data = {
    subcmd: 0,
    wifiOpen: raw.wifiOpen,
    broadcast: raw.broadcast,
    ssid: Buffer.from(ssid).toString("base64"),
    key: password || raw.key,
    authenticationType: raw.authenticationType,
  };
  if (raw.wifiSames !== undefined) data.wifiSames = raw.wifiSames;
  const token = await this.call(this.cmd.token);
  if (token.token) this.token = token.token;
  try {
    const result = await this.call(cmd, "POST", data);
    if (!result.success && result.message !== "0")
      throw Error("Router did not confirm the Wi-Fi update");
    return { submitted: true };
  } catch (e) {
    throw Error(
      "Wi-Fi update was sent but could not be confirmed. Reconnect to the router and check its settings before retrying.",
    );
  }
};
module.exports = { Router, redact, routerOrigin };
