// Read-only inspection of the native portal feature found in the router's web UI.
// There is deliberately no enable/configure operation in this module.
function portalMenu(hex, level) {
  const alphabet = [
    "00",
    "01",
    "02",
    "03",
    "10",
    "11",
    "12",
    "13",
    "20",
    "21",
    "22",
    "23",
    "30",
    "31",
    "32",
    "33",
  ];
  const flag = String(hex || "")
    .split("")
    .map((c) => alphabet[parseInt(c, 16)] || "")
    .join("")
    .split("")
    .reverse()[213];
  const visible =
    String(level) === "1" ||
    flag === "3" ||
    (flag === "2" && ["2", "3"].includes(String(level))) ||
    (flag === "1" && String(level) === "2");
  return {
    index: 213,
    flag: flag ?? null,
    accountLevel: String(level || "unknown"),
    visible,
  };
}
async function inspectPortal(router) {
  const global = await router.call(20005);
  const menu = portalMenu(global.web_page_hide, global.account_level);
  const result = await router.json("/cgi-bin/http.cgi", {
    cmd: 468,
    method: "GET",
    sessionId: router.sessionId,
  });
  const common = {
    readOnly: true,
    command: 468,
    menu,
    checkedAt: new Date().toISOString(),
  };
  if (["NO_AUTH", "LOGIN_TIMEOUT"].includes(result.message))
    return {
      ...common,
      status: "session_expired",
      summary:
        "The router session expired. Sign in again before checking the portal.",
    };
  if (["LIMITED_ACCESS", "prohibit_edit"].includes(result.message))
    return {
      ...common,
      status: "access_denied",
      summary:
        "The firmware advertises portal settings, but this account is not permitted to read them. An authorized higher-privilege router account is needed.",
    };
  if (result.success === false)
    return {
      ...common,
      status: "unconfirmed",
      summary:
        "The router rejected the portal read command. The shipped settings page alone does not prove that its backend is implemented.",
    };
  if (!Object.hasOwn(result, "protalSw"))
    return {
      ...common,
      status: "unconfirmed",
      summary:
        "The router response did not contain the portal configuration fields expected by its own web interface.",
    };
  const fields = [
    "heartTime",
    "portalPort",
    "serverHostname",
    "serverHttpPort",
    "serverSslPort",
    "fragmentLogin",
    "fragmentPortal",
    "fragmentPing",
    "fragmentAuth",
    "fragmentPath",
    "whiteList",
  ];
  const settings = Object.fromEntries(
    fields
      .filter((k) => ["string", "number"].includes(typeof result[k]))
      .map((k) => [k, String(result[k])]),
  );
  return {
    ...common,
    status: "configuration_available",
    enabled: [true, 1, "1"].includes(result.protalSw),
    settings,
    summary:
      "The authenticated router API returns native portal configuration. Server protocol compatibility, pre-authentication exceptions and actual guest redirection still require controlled testing before enabling it.",
  };
}
module.exports = { inspectPortal, portalMenu };
