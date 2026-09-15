---
name: Railway lockfile registry
description: Railway cannot resolve Replit-internal npm tarball URLs stored in a generated package-lock.
---

Keep committed npm lockfiles pointed at `https://registry.npmjs.org/`, not the Replit package firewall host.

**Why:** Railpack can detect npm correctly and still fail before the build starts if `resolved` entries point to `package-firewall.replit.internal`, which is not resolvable from Railway.

**How to apply:** Regenerate the lockfile from scratch with the public npm registry and pin the npm package manager in package.json before redeploying.