# Player Gate Investigation Report

Date: 2026-02-04

## Summary of changes made

- UI
  - Renamed UI column to **Post‑Jump Heat** in `js/app.js`.
  - Adjusted rendering so gate jumps show no numeric `Jump Heat` and show `lowHeat` as the post-jump value.
  - Added client-side fallback that marks jumps as `player` when `window.__lastInferredPlayerGates` or `window.PLAYER_GATES` indicates a mapping.
  - Added `js/player-gates.js` (helper) exposing `window.loadPlayerGates(opts)` to fetch/transform PLAYER_GATE_API results.
  - Minor mobile CSS tweaks in `css/styles.css`.

- Worker
  - Hardened `workers/systems/worker.js` player-gate resolution:
    - Safe fetch + retries/backoff, optional `PLAYER_GATE_TOKEN` support.
    - Depth-limited destination resolution to avoid loops.
    - Diagnostic info collected in `playerGateDiagnostics` and included in `/api/route` response.
    - Guarded coords check (skip computing jump heat when coords missing).
    - Route response fields returned as numeric/null (not stringified).

- Repo
  - Created stamped commits and pushed changes to branch `testing-2-gates`.

## Current observed problem

- NPC gates are detected and displayed correctly.
- Player gates (example route: `EMH-K56` → `IS0-B36`) are not being recognized as gates by the UI; the row still displays a numeric `Jump Heat` and `OK` status, instead of showing `GATE (PLAYER)` and suppressing jump heat.

## Likely causes

1. The worker did not include `gate: 'player'` for the route entry returned by `/api/route`.
   - Possible reasons: missing/invalid `PLAYER_GATE_API` or `PLAYER_GATE_TOKEN`, API responses lacking expected fields, 401/403/429 errors, or destination resolution failure.
2. Frontend inference did not run or `window.__lastInferredPlayerGates` / `window.PLAYER_GATES` are empty or use a different ID format (number vs string) than route entries.
3. Worker resolved to an assembly id instead of system id (destination resolution failed to produce a system id), so mapping missed the `to` system.
4. Race/timing: client didn't attach inferred mapping to the request (or server path `resolvePlayerGates` failed and returned route without player gates).

## Immediate debug steps (what to check now)

1. Inspect `/api/route` response in DevTools (Network → POST `/api/route`):
   - Confirm whether any `route` entry contains `"gate":"player"`.
   - Check for `playerGateDiagnostics` in the response (it may contain `authFailed`, `rateLimited`, `skippedSystems`, or notes).
2. In browser console, inspect client-side inferred mappings:
   - `console.log(window.__lastInferredPlayerGates)`
   - `console.log(window.PLAYER_GATES)`
   - Ensure keys are string system IDs (e.g. `"30004078": ["30004088"]`).
3. If possible, paste the full `/api/route` JSON response (route array + diagnostics) here so I can analyze why the worker didn't mark the jump as a gate.

## Quick workarounds

- Force a client-side mapping for testing (run in console, replace IDs as needed):

```javascript
window.PLAYER_GATES = window.PLAYER_GATES || {};
window.PLAYER_GATES["30004078"] = window.PLAYER_GATES["30004078"] || [];
if (window.PLAYER_GATES["30004078"].indexOf("30004088") === -1) window.PLAYER_GATES["30004078"].push("30004088");
if (window.lastRouteResults && window.displayMultipleResults) displayMultipleResults(window.lastRouteResults);
```

- Or call the client resolver (if `PLAYER_GATE_API` is accessible from browser):

```javascript
window.loadPlayerGates({ playerGateApi: window.PLAYER_GATE_API }).then(console.log);
```

## Recommended fixes / next steps I can implement

1. Surface `playerGateDiagnostics` in the UI near the route header so failures (auth/rate-limit) are visible; I can add this quickly.
2. Add more robust destination resolution in worker: when `destinationId` points to an assembly, aggressively resolve its `gate.inRange` searching for system ids and log failures.
3. Ensure consistent ID types (always use string IDs) between worker outputs and client inference.
4. Add a small automated test that POSTs the EMH-K56→IS0-B36 payload to `/api/route` and logs the response to speed debugging.

## Proposed immediate action (pick one)

- A: I add a diagnostic panel to the UI that displays `playerGateDiagnostics` from `/api/route` so you can see why player gates failed.
- B: You paste a captured `/api/route` response for `EMH-K56` → `IS0-B36` and I'll analyze and patch the worker accordingly.
- C: I implement additional worker resolution fallbacks (deeper assembly resolution and extra logging) and push a patch.

---

Files referenced:
- `js/app.js`
- `js/player-gates.js`
- `css/styles.css`
- `workers/systems/worker.js`



