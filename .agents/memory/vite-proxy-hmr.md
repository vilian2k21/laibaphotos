---
name: Vite proxy preview HMR
description: Express-mounted Vite middleware can produce websocket errors in the Replit proxied preview.
---

When Vite runs as middleware inside the Express server used by the Replit preview, disable Vite HMR for the dev server unless its websocket server is explicitly wired to the same HTTP server.

**Why:** The proxied preview can load the app successfully while the browser repeatedly reports failed Vite websocket connections, which creates noisy console errors and can make live updates unreliable.

**How to apply:** For this unified Express/Vite setup, use Vite middleware mode with `hmr: false`; restart the workflow after changing the server configuration.