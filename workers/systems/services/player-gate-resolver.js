/**
 * player-gate-resolver.js
 * 
 * Resolves player gates (SmartGates) from EVE Frontier World API.
 * Fetches solar systems → collects SmartGate assemblies → resolves destinations.
 * 
 * Priority order:
 * 1. Request-provided playerGates mapping
 * 2. R2-cached player_gates.json (fallback)
 * 3. Dynamic fetch from EVE Frontier World API
 * 
 * Used by: route handler
 */

import { fetchWithRetry } from '../utils/fetch-retry.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

/**
 * Resolve player gates from EVE Frontier World API
 * 
 * Flow:
 * 1. Fetch each system → collect SmartGate assembly IDs
 * 2. Fetch each SmartGate assembly → resolve destination system ID
 * 3. Build mapping: originSystemId → [destSystemIds]
 * 
 * @param {array} names - System names to resolve
 * @param {object} D - System data object (name → entry)
 * @param {object} env - Worker environment with PLAYER_GATE_API config
 * @param {object} diagnostics - Diagnostics object to populate with notes
 * @returns {object} Mapping {systemId: [destSystemIds]} or empty object
 */
async function resolvePlayerGatesFromApi(names, D, env, diagnostics = {}) {
  if (!env.PLAYER_GATE_API) {
    diagnostics.notes = diagnostics.notes || [];
    diagnostics.notes.push('PLAYER_GATE_API not configured');
    return {};
  }

  // Configuration from environment variables
  const PLAYER_GATE_MAX_SYSTEMS = Number(env.PLAYER_GATE_MAX_SYSTEMS) || 500;
  const PLAYER_GATE_CONCURRENCY = Number(env.PLAYER_GATE_CONCURRENCY) || 8;
  const PLAYER_GATE_RETRIES = Number(env.PLAYER_GATE_RETRIES) || 3;
  const PLAYER_GATE_BASE_BACKOFF_MS = Number(env.PLAYER_GATE_BASE_BACKOFF_MS) || 200;
  const PLAYER_GATE_MAX_BACKOFF_MS = Number(env.PLAYER_GATE_MAX_BACKOFF_MS) || 5000;

  // Protect against extremely large route requests
  if (names.length > PLAYER_GATE_MAX_SYSTEMS) {
    throw new Error(`Route too large: max ${PLAYER_GATE_MAX_SYSTEMS} systems per request. Please split your route.`);
  }

  try {
    const base = String(env.PLAYER_GATE_API).replace(/\/$/, '');
    
    // Resolve system names to IDs
    const ids = names
      .map(n => (D[n.toUpperCase().trim()] ? String(D[n.toUpperCase().trim()][0]) : null))
      .filter(Boolean);

    // Caches to avoid duplicate fetches
    const sysCache = Object.create(null);
    const asmCache = Object.create(null);
    const result = Object.create(null);

    // Optional auth token from environment
    const authHeaders = {};
    if (env.PLAYER_GATE_TOKEN) {
      authHeaders['Authorization'] = `Bearer ${env.PLAYER_GATE_TOKEN}`;
    }

    /**
     * Safe fetch with retry, auth handling, and diagnostics
     */
    const safeFetch = async (url) => {
      const r = await fetchWithRetry(
        url,
        { method: 'GET', headers: { 'Accept': 'application/json', ...authHeaders } },
        PLAYER_GATE_RETRIES,
        PLAYER_GATE_BASE_BACKOFF_MS,
        PLAYER_GATE_MAX_BACKOFF_MS
      );
      
      if (!r) return null;
      
      if (r.status === 401 || r.status === 403) {
        diagnostics.authFailed = true;
        return null;
      }
      if (r.status === 429) diagnostics.rateLimited = true;
      if (!r.ok) return null;
      
      try { 
        return await r.json(); 
      } catch (e) { 
        return null; 
      }
    };

    /**
     * Fetch solar system with caching
     */
    const fetchSys = async (sid) => {
      if (sysCache[sid]) return sysCache[sid];
      const sysUrl = `${base}/solarsystems/${sid}`;
      const j = await safeFetch(sysUrl);
      sysCache[sid] = j;
      return j;
    };

    /**
     * Fetch SmartGate assembly with caching
     */
    const fetchAsm = async (aid) => {
      if (asmCache[aid]) return asmCache[aid];
      const url = `${base}/smartassemblies/${encodeURIComponent(aid)}`;
      const j = await safeFetch(url);
      asmCache[aid] = j;
      return j;
    };

    // Phase 1: Fetch all systems concurrently
    const systemsJson = await mapWithConcurrency(ids, fetchSys, PLAYER_GATE_CONCURRENCY);

    // Phase 2: Collect gate assembly IDs from systems
    const gateTasks = [];
    const originByGate = Object.create(null);
    
    for (let idx = 0; idx < ids.length; idx++) {
      const sid = ids[idx];
      const sysJson = systemsJson[idx];
      
      if (!sysJson) { 
        diagnostics.skippedSystems = diagnostics.skippedSystems || [];
        diagnostics.skippedSystems.push(sid);
        continue; 
      }
      
      const originId = String(sysJson.id || sid);
      const assemblies = Array.isArray(sysJson.smartAssemblies) ? sysJson.smartAssemblies : [];
      
      for (const asm of assemblies) {
        if (!asm || String(asm.type).toLowerCase() !== 'smartgate') continue;
        
        const gateId = String(asm.id);
        if (!gateId) continue;
        
        if (!originByGate[gateId]) originByGate[gateId] = [];
        if (originByGate[gateId].indexOf(originId) === -1) {
          originByGate[gateId].push(originId);
        }
        gateTasks.push(gateId);
      }
    }

    // Phase 3: Fetch unique gate assemblies concurrently
    const uniqueGateIds = Array.from(new Set(gateTasks));
    const asmResults = await mapWithConcurrency(uniqueGateIds, fetchAsm, PLAYER_GATE_CONCURRENCY);

    /**
     * Resolve destination system ID from a SmartGate assembly
     * Handles nested resolution with depth limit to prevent infinite loops
     */
    const resolveDestSystem = async (asmJsonOrId, visited = new Set(), depth = 0) => {
      if (!asmJsonOrId || depth > 8) return null;
      
      let asmJson = null;
      try {
        if (typeof asmJsonOrId === 'string' || typeof asmJsonOrId === 'number') {
          const aid = String(asmJsonOrId);
          if (visited.has(aid)) return null;
          visited.add(aid);
          
          asmJson = await fetchAsm(aid).catch(() => null);
          
          // If not an assembly, try fetching as system ID
          if (!asmJson) {
            const sys = await fetchSys(aid).catch(() => null);
            if (sys && sys.id) return String(sys.id);
            return null;
          }
        } else {
          const key = asmJsonOrId.id || asmJsonOrId;
          if (visited.has(key)) return null;
          visited.add(key);
          asmJson = asmJsonOrId;
        }
      } catch (err) {
        return null;
      }

      try {
        // Check inRange for direct system references (preferred)
        if (asmJson.gate && Array.isArray(asmJson.gate.inRange) && asmJson.gate.inRange.length) {
          for (const r of asmJson.gate.inRange) {
            if (!r) continue;
            if (r.solarSystem && r.solarSystem.id) return String(r.solarSystem.id);
            if (r.solarSystemId) return String(r.solarSystemId);
            
            // Handle nested assembly references
            if (r.smartAssemblyId) {
              const nested = await fetchAsm(String(r.smartAssemblyId)).catch(() => null);
              if (nested) {
                const got = await resolveDestSystem(nested, visited, depth + 1);
                if (got) return String(got);
              }
            }
          }
        }

        // Check destinationId (may be system or assembly)
        if (asmJson.gate && asmJson.gate.destinationId) {
          const destId = String(asmJson.gate.destinationId);
          
          // Try as system first
          const maybeSys = await fetchSys(destId).catch(() => null);
          if (maybeSys && maybeSys.id) return String(maybeSys.id);
          
          // Else try as assembly
          const destAsm = await fetchAsm(destId).catch(() => null);
          if (destAsm) {
            const got = await resolveDestSystem(destAsm, visited, depth + 1);
            if (got) return String(got);
          }
        }
      } catch (err) {
        diagnostics.notes = diagnostics.notes || [];
        diagnostics.notes.push(`resolveDestSystem error: ${String(err && err.message ? err.message : err)}`);
      }

      return null;
    };

    // Phase 4: Resolve each gate to destination and build mapping
    for (let i = 0; i < uniqueGateIds.length; i++) {
      const gid = uniqueGateIds[i];
      const asmJson = asmResults[i];
      if (!asmJson) continue;

      const destSystemId = await resolveDestSystem(asmJson).catch(() => null);
      if (!destSystemId) continue;

      const origins = originByGate[gid] || [];
      for (const aOrigin of origins) {
        const a = String(aOrigin);
        const b = String(destSystemId);
        result[a] = result[a] || [];
        if (result[a].indexOf(b) === -1) result[a].push(b);
        result[b] = result[b] || [];
        if (result[b].indexOf(a) === -1) result[b].push(a);
      }
    }

    if (Object.keys(result).length) {
      diagnostics.found = Object.keys(result).length;
    }
    
    return result;
  } catch (err) {
    diagnostics.notes = diagnostics.notes || [];
    diagnostics.notes.push(String(err && err.message ? err.message : err));
    return {};
  }
}

export { resolvePlayerGatesFromApi };
