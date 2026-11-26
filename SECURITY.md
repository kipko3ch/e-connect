# Security policy

E-connect is a local router administration tool. Keep it on loopback, run a supported Node.js version, and use it only on networks you are authorized to administer.

## Reporting a vulnerability

Do not post passwords, router sessions or a working exploit against someone else's equipment in a public issue. Use GitHub's **Report a vulnerability** option on this repository if available. Otherwise open a minimal issue asking the maintainer for a private reporting channel; omit exploit details and sensitive data until a private channel is agreed.

Include the E-connect version, Node.js version, router model/firmware, affected operation and a redacted reproduction using synthetic fixtures. Do not attach full configuration backups, firmware, APKs or unredacted network responses.

## Current boundaries

- Only local use is supported; public hosting of this dashboard is not supported.
- Router credentials are not persisted, but session tokens exist in server memory until expiry or shutdown.
- Some router firmware uses HTTP. E-connect does not make that transport encrypted.
- MAC-based restrictions are not strong user identity and can be bypassed by a device changing its MAC address.
- A valid configuration readback does not prove end-to-end enforcement.
- Native portal inspection is read-only and does not unlock restricted router roles.

Only the current main branch is maintained at present. Review updates before deploying to a network where disconnecting a device would be disruptive.
