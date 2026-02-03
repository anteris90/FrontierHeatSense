# Stamping Utilities

This folder contains utilities for stamping the current git short hash into `index.html`.

- `stamp-version.js` — Updates `index.html` meta `app-version` and the `js/app.js` cache-bust query parameter with the current git short hash.
  - Usage: `node scripts/stamp-version.js`

- `stamp-and-commit.js` — Runs the stamp, stages `index.html`, and commits the updated file with a message including the stamped hash.
  - Usage: `node scripts/stamp-and-commit.js`
  - Optional: `node scripts/stamp-and-commit.js --push` to push the commit to the remote.

Notes:
- The commit message uses the git short hash of the HEAD that was stamped, for example `chore: stamp version eec21cd`.
- Include `node scripts/stamp-and-commit.js` in your CI deploy step to automate stamping+committing before publishing.
