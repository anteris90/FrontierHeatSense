 # Copilot Instructions for FrontierHeatSense

 ## Orientation
 - FrontierHeatSense couples a static browser UI (`index.html` + `css/styles.css` + `js/app.js`) with a Cloudflare Worker API under `workers/systems/`; all star/ship data lives under `db/` and the worker `workers/systems/data.json` or `db/data.json` fallbacks.
 - The browser uses `js/app.js` to orchestrate `core/` logic, `services/` business rules, and `ui/` DOM code; the worker handles route calculations/player gate resolution and talks to R2 via `services/data-loader.js`.

## Directory roles
- `js/core` contains pure algorithms like `api-client.js`, `calculations.js`, and `normalization.js` (no DOM access, no globals) while `js/services` bridges those utilities with higher-level concepts such as ship selection (`ship-manager.js`) and player-gate logic (`player-gate-resolver.js`).
- `js/ui` modules (`renderer.js`, `route-table.js`, `event-handlers.js`, `ship-ui.js`, `skill-progress.js`) are the only place where DOM manipulation occurs; they ingest the normalized state produced by services.
- Worker code lives in `workers/systems/` with `worker.js` routing requests into `handlers/` (route, systems, player-gates, admin) and shared helpers in `services/` and `utils/`.

## Data & API patterns
- Always normalize user input through `core/normalization.js` (`normalizeSystemName`, `parseSystemInput`) before calling the API so casing, diacritics, and EF-Map anchors are handled.
- Browser API calls use `core/api-client.js`’s `fetchBatchSystems()` to prefer the `/api/systems` endpoint (Cache-Control 86400, sorted key) and fall back to `/db/data.json`; treat `window.HEATSENSE_API` as an override during local testing.
- Ship/jump metadata lives in `db/ships.json`, NPC gate data is committed as `workers/systems/npc_gates.json`, and player gates are fetched via `/api/player-gates`, `workers/systems/player_gates.json`, or the `PLAYER_GATE_API` env var if live data is needed.

## Gate & route logic
- `handlers/route.js` checks NPC gates first (bidirectional, zero heat) using `npc_gates.json`, then player gates from payload → R2 cache → live API, and only calculates heat when no gate exists.
- The route response embeds `playerGateDiagnostics` (notes/authFailed/rateLimited/skippedSystems) so UI code can explain where gate data came from.
- The worker computation uses the exposed skill bonus formula (`effectiveC = baseC * (1 + skillLevel * 0.02)`) and the hard limits (`totalAfter < 149`, `warning` when low heat > 90).

## Conventions
- The client is vanilla ES modules—always append `.js` in imports, export named functions only, and avoid bundlers.
- Global debugging hooks live in `js/app.js` (`window.lastRouteResults`, `window.lastRouteJumps`) so use those when inspecting route state.
- Communication between layers is synchronous: `services` call `core` helpers, then pass results to `ui` renderers; keep DOM-only concerns inside `ui/`.
- Worker environment: define `R2_BUCKET`, `PLAYER_GATE_API`, and any staging override inside `wrangler.toml` so `services/data-loader.js` can reach R2; local worker dev uses `npx wrangler dev` to respect those bindings.

## Workflows & commands
- Frontend: `python -m http.server 8000` serves the static site; edit `index.html`, `css/styles.css`, and `js/app.js` directly (no build step).
- Worker: `cd workers/systems && npx wrangler dev` for local debugging, then `npx wrangler deploy` for production; keep the worker’s `package.json` synced with the handler scripts.
- Validation: `npm run test:route` exercises the route endpoint, `npm run lint` enforces formatting if `eslint.config.cjs` is present, and `node scripts/stamp-version.js` (or `npm run stamp:commit`) injects the git hash into `index.html` before release.

## Debug & observability
- Use `window.PLAYER_GATES` (populated by `player-gate-resolver.js`) when tracing why a jump used an NPC vs player gate.
- The worker exposes `playerGateDiagnostics` and includes `notes` strings like “Loaded player gates from R2” to confirm data freshness; rely on those when diagnosing stale gate problems.
- Route heat thresholds, gate hits, and warnings are logged in `services/player-gate-resolver.js`/`handlers/route.js`, so step through those files when behavior deviates from expectations.

## Integration reminders
- Avoid touching `db/data.json` manually; workers push canonical data via `workers/systems/handlers/admin.js` and `player_gates.json` is seeded from R2.
- When smoothing route heat, respect the application’s `window.HEATSENSE_API` override so frontend calls can point at a custom worker (useful for integration tests).
- Use the documented tuple order (`[id, class, temp, radius_km, coldest_au, coldest_ls, coldest_heat, status]`) whenever mirroring system data elsewhere—the entire pipeline assumes that schema.