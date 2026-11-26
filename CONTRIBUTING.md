# Contributing to E-connect

Small fixes, accessibility improvements and well-tested router adapters are welcome.

1. Open an issue describing the problem or proposed adapter before making a large change.
2. Fork the repository and create a focused branch.
3. Keep the runtime dependency-free unless a new dependency has a clear benefit.
4. Run `npm test` and `node --check public/app.js` before opening a pull request.
5. Describe the user-visible change, supported firmware, how it was tested, and any limitations.

Use synthetic response fixtures. Never include real admin credentials, authentication tokens, SIM identifiers, serial numbers, MAC addresses, device lists, packet captures, APKs or firmware dumps. Check new files before committing: ignore rules are a precaution, not a secret scanner.

For router writes, preserve unrelated settings, validate inputs, verify responses, and represent uncertain outcomes as uncertain. Tests must not contact or modify a real router by default. Do not bypass role restrictions.

The current UI treats connected clients as devices, not as authenticated people. Avoid claiming universal compatibility or a feature is supported based only on an exposed settings page.
