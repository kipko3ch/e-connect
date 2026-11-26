const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
test("all workspace screens render with real API-shaped data and escape device names", () => {
  const nodes = {};
  const document = {
    querySelector: (s) =>
      (nodes[s] ??= {
        innerHTML: "",
        textContent: "",
        value: "",
        className: "",
      }),
  };
  const context = vm.createContext({
    document,
    location: { hash: "" },
    Date,
    Intl,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null },
  });
  const source = fs.readFileSync("public/app.js", "utf8");
  assert(source.length > 10000);
  const cut = source.indexOf("document.addEventListener(");
  assert(cut > 0);
  vm.runInContext(source.slice(0, cut), context);
  vm.runInContext(
    `live={address:'http://192.168.1.1',updatedAt:new Date().toISOString(),device:{model:'Test router',cpu:20,temperature:40,memoryFree:'320000 kB',uptime:1000},radio:{},clients:[{name:'<script>bad</script>',mac:'02:11:22:33:44:55',ip:'192.168.1.2',band:'5 GHz',rssi:-61,txrate:433}],sim:'1'};connected=true;`,
    context,
  );
  for (const screen of ["overview", "devices", "wifi", "network", "settings"]) {
    vm.runInContext(`page='${screen}';render()`, context);
    assert(nodes["#view"].innerHTML.length > 300);
    assert(!nodes["#view"].innerHTML.includes("<script>bad</script>"));
  }
  vm.runInContext(`page='overview';render()`, context);
  assert(nodes["#view"].innerHTML.includes('value="100"'));
  assert(nodes["#view"].innerHTML.includes("&lt;script&gt;bad&lt;/script&gt;"));
  vm.runInContext("connected=false;render()", context);
  assert(nodes["#view"].innerHTML.includes('id="login-form"'));
});
