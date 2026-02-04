// player-gates.js
// Small helper to fetch player gates from a configured PLAYER_GATE_API
// - exposes `window.loadPlayerGates(opts)` which returns a map stringId -> [stringIds]
// - auto-runs on DOMContentLoaded when `window.PLAYER_GATE_API` and parsed IDs are available

async function safeFetchJson(url, opts = {}, retries = 3, baseBackoff = 200, maxBackoff = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) {
        // for 4xx (auth) return null immediately
        if (r.status >= 400 && r.status < 500) return null;
        // otherwise retry
        const backoff = Math.min(maxBackoff, baseBackoff * Math.pow(2, i));
        await new Promise(r => setTimeout(r, backoff + Math.random() * 100));
        continue;
      }
      return await r.json().catch(() => null);
    } catch (e) {
      const backoff = Math.min(maxBackoff, baseBackoff * Math.pow(2, i));
      await new Promise(r => setTimeout(r, backoff + Math.random() * 100));
      continue;
    }
  }
  return null;
}

async function loadPlayerGates(opts = {}) {
  const playerGateApi = opts.playerGateApi || window.PLAYER_GATE_API;
  const token = opts.token || sessionStorage.getItem('playerGateToken') || localStorage.getItem('playerGateToken') || null;
  const headers = token ? { Authorization: 'Bearer ' + token } : {};

  // Try backend shortcut first
  try {
    const bp = await fetch('/api/player-gates', { headers });
    if (bp && bp.ok) {
      const map = await bp.json().catch(() => null);
      window.PLAYER_GATES = map || {};
      if (window.lastRouteResults && window.renderRouteJumps) window.renderRouteJumps(window.lastRouteResults);
      else if (window.recalculateRoute) window.recalculateRoute();
      return window.PLAYER_GATES;
    }
  } catch (e) {
    // ignore and continue
  }

  if (!playerGateApi) {
    window.PLAYER_GATES = {};
    return window.PLAYER_GATES;
  }

  const base = String(playerGateApi).replace(/\/+$/, '');
  // attempt to find system ids to query
  let systemIds = Array.isArray(opts.systemIds) && opts.systemIds.length ? opts.systemIds.slice() : (Array.isArray(window.__lastParsedSystemIds) ? window.__lastParsedSystemIds.slice() : []);

  // If caller passed `opts.names` (normalized system names) or USE_LOCAL_SYSTEM_DATA is enabled,
  // try to resolve names to IDs using the local `/db/data.json` file (fast, single fetch).
  if ((!systemIds || systemIds.length === 0) && (Array.isArray(opts.names) && opts.names.length || window.USE_LOCAL_SYSTEM_DATA)) {
    try {
      const names = Array.isArray(opts.names) && opts.names.length ? opts.names : (Array.isArray(window.__lastParsedSystemNames) ? window.__lastParsedSystemNames : []);
      if (names && names.length) {
        const txt = await fetch('/db/data.json').then(r => r.ok ? r.json() : null).catch(() => null);
        if (txt && typeof txt === 'object') {
          const ids = [];
          for (const n of names) {
            const nn = String(n).toUpperCase().trim();
            if (txt[nn] && Array.isArray(txt[nn]) && txt[nn].length) ids.push(String(txt[nn][0]));
          }
          if (ids.length) systemIds = ids;
        }
      }
    } catch (e) {
      // ignore and fall back to other resolution methods
    }
  }
  if (!systemIds.length && Array.isArray(window.lastRouteResults) && window.lastRouteResults.length) {
    // try to pull ids from server-provided route entries (if present)
    const ids = [];
    for (const r of window.lastRouteResults) if (r.system && r.system.id) ids.push(String(r.system.id));
    if (ids.length) systemIds.push(...ids);
  }

  // limit work on client
  const MAX = opts.maxSystems || 50;
  if (systemIds.length > MAX) systemIds.length = MAX;

  const out = {};

  for (const sid of systemIds) {
    try {
      const sys = await safeFetchJson(`${base}/v2/solarsystems/${encodeURIComponent(sid)}`, { headers });
      if (!sys) continue;
      const originId = String(sys.id || sid);
      const assemblies = Array.isArray(sys.smartAssemblies) ? sys.smartAssemblies : [];
      const gateIds = [];
      for (const a of assemblies) {
        if (!a) continue;
        const typ = String(a.type || a.assemblyType || '').toLowerCase();
        if (typ.indexOf('smart') === -1 && typ.indexOf('gate') === -1) continue;
        const gid = String(a.id || a.assemblyId || a.guid || '');
        if (!gid) continue;
        gateIds.push(gid);
      }

      const dests = new Set();
      for (const gid of gateIds) {
        const asm = await safeFetchJson(`${base}/v2/smartassemblies/${encodeURIComponent(gid)}`, { headers });
        if (!asm) continue;
        if (asm.gate && asm.gate.destinationId) {
          dests.add(String(asm.gate.destinationId));
        }
        if (asm.gate && Array.isArray(asm.gate.inRange)) {
          for (const r of asm.gate.inRange) {
            if (r && (r.solarSystemId || (r.solarSystem && r.solarSystem.id))) {
              dests.add(String(r.solarSystemId || (r.solarSystem && r.solarSystem.id)));
            }
          }
        }
        if (Array.isArray(asm.destinations)) {
          for (const d of asm.destinations) dests.add(String(d));
        }
      }

      out[originId] = Array.from(dests).filter(x => x && x !== originId);
    } catch (e) {
      // ignore per-system errors
      continue;
    }
  }

  window.PLAYER_GATES = out;
  if (window.lastRouteResults && window.renderRouteJumps) window.renderRouteJumps(window.lastRouteResults);
  else if (window.recalculateRoute) window.recalculateRoute();
  if (typeof window.updatePlayerGateIndicator === 'function') {
    try { window.updatePlayerGateIndicator(); } catch (e) {}
  }
  return out;
}

// Expose globally
window.loadPlayerGates = loadPlayerGates;

// Auto-run when page loads if API is configured and parsed ids exist
window.addEventListener('DOMContentLoaded', () => {
  try {
    // prefer parsed names (from textarea) to resolve locally via /db/data.json
    const names = Array.isArray(window.__lastParsedSystemNames) ? window.__lastParsedSystemNames : null;
    if (names && names.length >= 2 && (window.USE_LOCAL_SYSTEM_DATA || window.PLAYER_GATE_API)) {
      loadPlayerGates({ names }).catch(() => {});
      return;
    }
    if (window.PLAYER_GATE_API && Array.isArray(window.__lastParsedSystemIds) && window.__lastParsedSystemIds.length >= 2) {
      // don't await — run in background
      loadPlayerGates({});
    }
  } catch (e) {}
});
