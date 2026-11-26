# E-connect

A clean, local-first interface for managing supported routers and the devices connected to them.

E-connect runs on your computer and communicates directly with your router over the local network. There is no cloud account, subscription, payment provider or database to configure.

## Features

- **Live dashboard** - connected devices, Wi-Fi band distribution, router uptime, CPU, memory and temperature when the firmware reports them.
- **Connected devices** - search device names, IP addresses, MAC addresses and Wi-Fi bands; inspect signal and negotiated link rates.
- **Internet access controls** - read existing MAC allow/block rules, preserve unrelated rules and confirm requested changes by reading them back. The host computer is protected against blocking itself.
- **Wi-Fi settings** - read 2.4 GHz / 5 GHz network settings and change the network name or password after confirmation.
- **Router details** - hardware, firmware, mobile-network information and a link to the router's native administration interface.
- **Read-only portal inspection** - check whether the firmware exposes native portal configuration and whether the signed-in account can read it. E-connect does not enable a captive portal.
- **Browser preferences** - configurable automatic refresh with a manual-only option. Credentials are not stored in browser preferences.

Here, "users" means connected client devices. E-connect does not create system accounts or replace the router's authentication system.

## Compatibility

E-connect currently implements the `/cgi-bin/http.cgi` local management protocol advertised by `/supportAPP.json` on some **ZLT / Tozed** routers. It is not a universal router manager and it is not an official Airtel, ZTE, ZLT, Tozed or TKonnect product.

| Equipment | Evidence and limitations |
| --- | --- |
| ZLT X17M outdoor unit paired with ZLT W304VA PRO indoor unit | Login and telemetry were observed on one Airtel deployment. Available operations vary by firmware and account role. |
| Other routers exposing the same local CGI protocol | Numeric and UUID command mappings are implemented but other models need independent testing. |
| Other brands/protocols | No adapter is currently implemented. |

The original setup reported firmware 6.07.0. Its portal configuration was restricted for a level-3 account. MAC access controls and Wi-Fi writes have automated protocol tests, but broad firmware coverage and end-to-end traffic enforcement are not established. Errors are surfaced instead of presenting simulated success.

Wi-Fi link rates are negotiation speeds, not internet speed measurements. MAC rules identify devices, not people; randomized MAC addresses can change a device's identity.

## Quick start

Requirements: Node.js **22.13 or later**, a supported router, and its legitimate admin username/password. Node.js 24 is a suitable runtime.

```sh
git clone https://github.com/kipko3ch/e-connect.git
cd e-connect
npm start
```

Open **http://localhost:4173**, connect your computer to the router's local network, and sign in with the router address and admin credentials. No `npm install` is necessary: the runtime uses Node.js built-ins only.

On Windows you can also double-click `start-e-connect.cmd` after installing Node.js.

To use another port:

```powershell
# PowerShell
$env:PORT = 4174
npm start
```

```sh
# macOS / Linux
PORT=4174 npm start
```

## Safe local operation

- The server binds only to **127.0.0.1**. Keep the dashboard local; it has no separate internet-facing identity system.
- Router passwords are used for authentication and are not written to disk. Router sessions remain in memory and expire after inactivity. Restarting the app requires signing in again.
- An HttpOnly, SameSite=Strict browser cookie identifies the local session. Host checks, origin checks and an explicit static-file allowlist limit local request exposure.
- Private IPv4 router addresses are accepted. Router redirects are not followed. HTTPS is supported only with a certificate trusted by Node.js; certificate verification is not disabled.
- If the router uses HTTP, its local management transport is not encrypted. The challenge hash is part of the router's authentication protocol, not a substitute for transport security.
- Block/allow changes require a verified enabled firewall state. If a firmware hides that state, rules can be displayed but writes stay unavailable.
- Changing an SSID or password can disconnect devices, including this computer. Readback of a firewall rule verifies configuration, not a packet test from the affected client.

Only administer equipment you own or are authorized to manage. Do not expose router administration to the public internet or bypass account restrictions.

## Development

```sh
npm test
```

Tests cover authentication, session handling, local HTTP access checks, sensitive-field filtering, client deduplication, malformed responses, MAC allow/block transformations, disabled-firewall refusal, portal permissions and rendering of each interface screen. Test fixtures are used only by tests; the app displays live router data.

| File | Purpose |
| --- | --- |
| `server.js` | Loopback web server, session management and authenticated router APIs |
| `router.js` | Router discovery, challenge authentication, telemetry, Wi-Fi and MAC access adapter |
| `portal-inspection.js` | Read-only native portal capability inspection |
| `public/app.js` | Dashboard screens, interaction handling and browser preferences |
| `public/style.css` | Responsive interface styles |
| `*.test.js` | Node.js test suite |

To add another adapter, keep credentials and protocol-specific fields on the backend, normalize returned data, and add synthetic response fixtures for permission failures as well as successful reads. Do not add private router responses, credentials, serial numbers or third-party firmware to the repository.

## Contributing and reporting issues

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [SECURITY.md](SECURITY.md) for security reporting. When reporting compatibility, include model, firmware and the error message. Redact passwords, tokens, MAC addresses, public IPs, SIM identifiers, serial numbers and device names.

## License

[MIT](LICENSE). The repository contains the E-connect implementation; no original application package, extracted vendor source, firmware, private screenshots or local runtime records are included. Product names identify compatibility only.
