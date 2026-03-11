/**
 * data-loader.js
 * 
 * Centralized R2 bucket data loading with in-memory caching.
 * Loads and parses JSON files: systems, NPC gates, player gates.
 * 
 * Caching Strategy:
 * - First request: fetch from R2 and cache
 * - Subsequent requests: return cached value (only cleared on admin reload)
 * 
 * Used by: route handler, admin handlers
 */

let cachedData = null;
let cachedNpcGates = null;
let cachedPlayerGates = null;
const SYSTEM_DATA_OBJECT_KEY = 'data-c5.json';

/**
 * Load NPC gates mapping from R2
 * Supports both array format [fromId, toId] and object format {fromId: [toIds]}
 * Automatically bidirectional: if A→B exists, B→A is created
 * 
 * @param {object} env - Worker environment with R2_BUCKET
 * @returns {object} Map of {systemId: [destSystemIds]}
 */
async function loadNpcGates(env) {
  if (cachedNpcGates) return cachedNpcGates;

  try {
    const obj = await env.R2_BUCKET.get('npc_gates.json');
    if (!obj) {
      cachedNpcGates = {};
      return cachedNpcGates;
    }
    const txt = await obj.text();
    const raw = JSON.parse(txt);

    const map = Object.create(null);

    // Support multiple input formats
    if (Array.isArray(raw)) {
      // Array of pairs: [[fromId, toId], ...]
      for (const item of raw) {
        let a, b;
        if (Array.isArray(item) && item.length >= 2) { 
          a = item[0]; 
          b = item[1]; 
        } else if (item && typeof item === 'object' && 'from' in item && 'to' in item) { 
          a = item.from; 
          b = item.to; 
        }
        if (a == null || b == null) continue;
        
        // Create bidirectional mapping
        map[a] = map[a] || new Set(); 
        map[a].add(b);
        map[b] = map[b] || new Set(); 
        map[b].add(a);
      }
    } else if (raw && typeof raw === 'object') {
      // Object format: {fromId: [toIds], ...}
      for (const k of Object.keys(raw)) {
        const arr = Array.isArray(raw[k]) ? raw[k] : [];
        map[k] = map[k] || new Set();
        for (const v of arr) map[k].add(v);
      }
    }

    // Convert Sets to arrays for output
    const out = Object.create(null);
    for (const k of Object.keys(map)) out[k] = Array.from(map[k]);
    cachedNpcGates = out;
    return cachedNpcGates;
  } catch (err) {
    cachedNpcGates = {};
    return cachedNpcGates;
  }
}

/**
 * Load player gates mapping from R2
 * Supports same formats as NPC gates
 * 
 * @param {object} env - Worker environment with R2_BUCKET
 * @returns {object|null} Map or null if not found
 */
async function loadPlayerGatesR2(env) {
  if (cachedPlayerGates) return cachedPlayerGates;
  try {
    const obj = await env.R2_BUCKET.get('player_gates.json');
    if (!obj) {
      cachedPlayerGates = null;
      return cachedPlayerGates;
    }
    const txt = await obj.text();
    const raw = JSON.parse(txt);
    const map = Object.create(null);
    
    // Support multiple input formats
    if (Array.isArray(raw)) {
      for (const item of raw) {
        let a, b;
        if (Array.isArray(item) && item.length >= 2) { 
          a = item[0]; 
          b = item[1]; 
        } else if (item && typeof item === 'object' && 'from' in item && 'to' in item) { 
          a = item.from; 
          b = item.to; 
        }
        if (a == null || b == null) continue;
        
        const sa = String(a); 
        const sb = String(b);
        map[sa] = map[sa] || new Set(); 
        map[sa].add(sb);
        map[sb] = map[sb] || new Set(); 
        map[sb].add(sa);
      }
    } else if (raw && typeof raw === 'object') {
      for (const k of Object.keys(raw)) {
        const arr = Array.isArray(raw[k]) ? raw[k] : [];
        const sk = String(k);
        map[sk] = map[sk] || new Set();
        for (const v of arr) map[sk].add(String(v));
      }
    }
    
    const out = Object.create(null);
    for (const k of Object.keys(map)) out[k] = Array.from(map[k]);
    cachedPlayerGates = out;
    return cachedPlayerGates;
  } catch (err) {
    cachedPlayerGates = null;
    return cachedPlayerGates;
  }
}

/**
 * Load system data from R2
 * Contains system IDs, names, classes, temperatures, coordinates, heat data
 * 
 * @param {object} env - Worker environment with R2_BUCKET
 * @returns {object} System lookup object keyed by normalized system name
 * @throws {Error} If the configured system data object is not found or invalid
 */
async function loadData(env) {
  if (cachedData) return cachedData;

  const object = await env.R2_BUCKET.get(SYSTEM_DATA_OBJECT_KEY);
  if (!object) throw new Error(`${SYSTEM_DATA_OBJECT_KEY} not found in R2`);

  const text = await object.text();
  cachedData = JSON.parse(text);

  if (!cachedData || typeof cachedData !== 'object') {
    throw new Error(`Invalid data format in ${SYSTEM_DATA_OBJECT_KEY}`);
  }

  return cachedData;
}

/**
 * Clear all cached data (used by admin reload endpoints)
 */
function clearAllCaches() {
  cachedData = null;
  cachedNpcGates = null;
  cachedPlayerGates = null;
}

/**
 * Clear only NPC gates cache
 */
function clearNpcGatesCache() {
  cachedNpcGates = null;
}

/**
 * Clear only player gates cache
 */
function clearPlayerGatesCache() {
  cachedPlayerGates = null;
}

export {
  loadData,
  loadNpcGates,
  loadPlayerGatesR2,
  clearAllCaches,
  clearNpcGatesCache,
  clearPlayerGatesCache
};
