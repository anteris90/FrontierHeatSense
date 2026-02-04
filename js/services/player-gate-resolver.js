/**
 * services/player-gate-resolver.js
 * 
 * Client-side player gate resolution.
 * Fetches and caches player gate mappings from various sources.
 * 
 * Resolution Priority:
 * 1. Backend cached endpoint (/api/player-gates) - fast
 * 2. Direct Frontier API resolution - slower but dynamic
 * 3. Local /db/data.json lookup - for client-side only
 * 
 * Also exposes window.loadPlayerGates() for backward compatibility
 */

/**
 * Fetch with retry and exponential backoff
 * 
 * @param {string} url - URL to fetch
 * @param {object} opts - Fetch options
 * @param {number} retries - Max retry attempts
 * @param {number} baseBackoff - Base backoff in ms
 * @param {number} maxBackoff - Max backoff in ms
 * @returns {object|null} Parsed JSON or null
 */
async function safeFetchJson(url, opts = {}, retries = 3, baseBackoff = 200, maxBackoff = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) {
        // Auth errors: return null immediately
        if (r.status >= 400 && r.status < 500) return null;
        // Retry 5xx and other errors
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

/**
 * Load player gates from various sources
 * 
 * Options:
 * - playerGateApi: Override window.PLAYER_GATE_API
 * - token: Auth token for API
 * - systemIds: Numeric system IDs to resolve
 * - names: System names to resolve (via local /db/data.json)
 * - maxSystems: Max systems to process (default 50)
 * 
 * Results cached in window.PLAYER_GATES
 * 
 * @param {object} opts - Resolution options
 * @returns {object} Mapping {systemId: [destSystemIds]}
 */
async function loadPlayerGates(opts = {}) {
  const playerGateApi = opts.playerGateApi || window.PLAYER_GATE_API;
  const token = opts.token || sessionStorage.getItem('playerGateToken') || localStorage.getItem('playerGateToken') || null;
  const headers = token ? { Authorization: 'Bearer ' + token } : {};

  // Try backend shortcut first (fast, cached in R2)
  try {
    const bp = await fetch('/api/player-gates', { headers });
    if (bp && bp.ok) {
      const map = await bp.json().catch(() => null);
      window.PLAYER_GATES = map || {};
      
      // Update UI if route exists
      if (window.lastRouteResults && window.renderRouteJumps) {
        window.renderRouteJumps(window.lastRouteResults);
      } else if (window.recalculateRoute) {
        window.recalculateRoute();
      }
      
      return window.PLAYER_GATES;
    }
  } catch (e) {
    // Backend unavailable, continue to local fallback
  }

  // Local fallback for testing
  try {
    const localGates = await fetch('/workers/systems/player_gates.json');
    if (localGates && localGates.ok) {
      const map = await localGates.json().catch(() => null);
      window.PLAYER_GATES = map || {};
      
      // Update UI
      if (window.lastRouteResults && window.renderRouteJumps) {
        window.renderRouteJumps(window.lastRouteResults);
      } else if (window.recalculateRoute) {
        window.recalculateRoute();
      }
      
      if (typeof window.updatePlayerGateIndicator === 'function') {
        try { window.updatePlayerGateIndicator(); } catch (e) {}
      }
      
      return window.PLAYER_GATES;
    }
  } catch (e) {
    // Local fallback failed, continue to API
  }

  if (!playerGateApi) {
    window.PLAYER_GATES = {};
    return window.PLAYER_GATES;
  }

  const base = String(playerGateApi).replace(/\/+$/, '');
  
  // Collect system IDs to resolve
  let systemIds = Array.isArray(opts.systemIds) && opts.systemIds.length 
    ? opts.systemIds.slice() 
    : (Array.isArray(window.__lastParsedSystemIds) ? window.__lastParsedSystemIds.slice() : []);

  // Try to resolve names to IDs via local data.json (fast, single fetch)
  if ((!systemIds || systemIds.length === 0) && (Array.isArray(opts.names) && opts.names.length || window.USE_LOCAL_SYSTEM_DATA)) {
    try {
      const names = Array.isArray(opts.names) && opts.names.length 
        ? opts.names 
        : (Array.isArray(window.__lastParsedSystemNames) ? window.__lastParsedSystemNames : []);
      
      if (names && names.length) {
        const txt = await fetch('/db/data.json').then(r => r.ok ? r.json() : null).catch(() => null);
        if (txt && typeof txt === 'object') {
          const ids = [];
          for (const n of names) {
            const nn = String(n).toUpperCase().trim();
            if (txt[nn] && Array.isArray(txt[nn]) && txt[nn].length) {
              ids.push(String(txt[nn][0]));
            }
          }
          if (ids.length) systemIds = ids;
        }
      }
    } catch (e) {
      // Fall back to other resolution
    }
  }

  // Fallback: try to pull IDs from last route results
  if (!systemIds.length && Array.isArray(window.lastRouteResults) && window.lastRouteResults.length) {
    const ids = [];
    for (const r of window.lastRouteResults) {
      if (r.system && r.system.id) ids.push(String(r.system.id));
    }
    if (ids.length) systemIds.push(...ids);
  }

  // Limit to prevent excessive client work
  const MAX = opts.maxSystems || 50;
  if (systemIds.length > MAX) systemIds.length = MAX;

  const out = {};

  // Resolve each system's gates
  for (const sid of systemIds) {
    try {
      const sys = await safeFetchJson(`${base}/v2/solarsystems/${encodeURIComponent(sid)}`, { headers });
      if (!sys) continue;
      
      const originId = String(sys.id || sid);
      const assemblies = Array.isArray(sys.smartAssemblies) ? sys.smartAssemblies : [];
      const gateIds = [];
      
      // Collect SmartGate assembly IDs
      for (const a of assemblies) {
        if (!a) continue;
        const typ = String(a.type || a.assemblyType || '').toLowerCase();
        if (typ.indexOf('smart') === -1 && typ.indexOf('gate') === -1) continue;
        const gid = String(a.id || a.assemblyId || a.guid || '');
        if (gid) gateIds.push(gid);
      }

      // Resolve each gate to destination
      const dests = new Set();
      for (const gid of gateIds) {
        const asm = await safeFetchJson(`${base}/v2/smartassemblies/${encodeURIComponent(gid)}`, { headers });
        if (!asm) continue;
        
        // Check inRange (preferred)
        if (asm.gate && Array.isArray(asm.gate.inRange)) {
          for (const r of asm.gate.inRange) {
            if (r && (r.solarSystemId || (r.solarSystem && r.solarSystem.id))) {
              dests.add(String(r.solarSystemId || r.solarSystem.id));
            }
          }
        }
        
        // Check destinationId
        if (asm.gate && asm.gate.destinationId) {
          dests.add(String(asm.gate.destinationId));
        }
        
        // Check destinations array
        if (Array.isArray(asm.destinations)) {
          for (const d of asm.destinations) dests.add(String(d));
        }
      }

      out[originId] = Array.from(dests).filter(x => x && x !== originId);
    } catch (e) {
      // Skip failed systems
      continue;
    }
  }

  window.PLAYER_GATES = out;
  
  // Update UI
  if (window.lastRouteResults && window.renderRouteJumps) {
    window.renderRouteJumps(window.lastRouteResults);
  } else if (window.recalculateRoute) {
    window.recalculateRoute();
  }
  
  if (typeof window.updatePlayerGateIndicator === 'function') {
    try { window.updatePlayerGateIndicator(); } catch (e) {}
  }

  return out;
}

export { loadPlayerGates, safeFetchJson };
