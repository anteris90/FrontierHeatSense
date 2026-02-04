/**
 * core/api-client.js
 * 
 * API client for backend communication.
 * Handles all fetch requests to worker endpoints.
 * 
 * Responsibilities:
 * - Single and batch system lookups
 * - Route calculations
 * - Error handling and normalization
 */

/**
 * API configuration (can be overridden via window.HEATSENSE_API)
 */
const API_BASE = window.HEATSENSE_API || 'https://systems-test.anteris90.workers.dev';
const API_SINGLE = `${API_BASE}/api/system`;
const API_BATCH = `${API_BASE}/api/systems`;
const API_ROUTE = `${API_BASE}/api/route`;

/**
 * Fetch single system by name
 * 
 * @param {string} normalizedName - Uppercase normalized system name
 * @returns {object} System data or throws error
 */
async function fetchSingleSystem(normalizedName) {
  const url = `${API_SINGLE}?name=${encodeURIComponent(normalizedName)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Single system error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data.system;
}

/**
 * Fetch multiple systems in batch (more efficient than individual requests)
 * 
 * Response systems may be in arbitrary order.
 * Caller must map results back to original input order by normalized name.
 * 
 * @param {array} normalizedNames - Array of uppercase system names
 * @returns {object} {systems: [{id, name, class, temp, ...}, ...], model}
 */
async function fetchBatchSystems(normalizedNames) {
  // Try Cloudflare Worker API first
  try {
    const url = `${API_BATCH}?${normalizedNames.map(name => `names=${encodeURIComponent(name)}`).join('&')}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (err) {
    console.warn('Cloudflare API failed, falling back to local data:', err);
  }
  
  // Fallback to local data
  try {
    const response = await fetch('/workers/systems/data.json');
    const data = await response.json();
    
    // Status mapping from server
    const STATUS_MAP = { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' };
    
    const systems = [];
    for (const name of normalizedNames) {
      if (data[name]) {
        const [id, starClass, temp, radiusKm, coldestAu, coldestLs, coldestHeat, status] = data[name];
        systems.push({
          id: id,
          name: name,
          class: starClass,
          temp: temp,
          radius_km: radiusKm,
          status: STATUS_MAP[status] || status,
          coords: null,
          coldest: {
            au: coldestAu,
            ls: coldestLs,
            heat: coldestHeat
          }
        });
      } else {
        // System not found
        systems.push({
          id: null,
          name: name,
          class: null,
          temp: null,
          radius_km: null,
          status: null,
          coords: null,
          coldest: null
        });
      }
    }
    
    return { systems, model: 'local-data' };
  } catch (err) {
    console.warn('Local data fetch failed:', err);
    // Return empty results
    return { systems: [], model: 'error' };
  }
}

/**
 * Fetch route calculation from backend
 * 
 * Request body options:
 * - names: array of system names (REQUIRED)
 * - totalMass: ship total mass including cargo
 * - hullMass: base ship hull mass
 * - baseC: ship C value (before skill bonus)
 * - skillLevel: pilot skill level (0-100)
 * - playerGates: pre-resolved player gates mapping {id: [destIds]}
 * 
 * Response includes:
 * - route: array of system entries with gate and heat data
 * - total_distance_ly: total jump distance
 * - can_complete_route: feasibility check
 * - playerGateDiagnostics: diagnostic info about gate resolution
 * 
 * @param {object} body - Request body
 * @returns {object} Route response data
 */
async function fetchRoute(body) {
  // Try Cloudflare Worker API first
  try {
    const response = await fetch(API_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (err) {
    console.warn('Cloudflare route API failed, using local mock:', err);
  }
  
  // Fallback to local mock
  const { names, totalMass, hullMass, baseC, skillLevel, playerGates } = body;
  const route = [];
  
  // Load system data to get IDs
  let systemData = {};
  try {
    const response = await fetch('/workers/systems/data.json');
    if (response.ok) {
      systemData = await response.json();
    }
  } catch (e) {
    // Ignore, continue without gate detection
  }
  
  for (let i = 0; i < names.length - 1; i++) {
    const from = names[i];
    const to = names[i + 1];
    const distanceLY = Math.random() * 10 + 1;
    
    // Check for gates (player or NPC)
    let isGate = false;
    let gateType = null;
    
    if (systemData[from] && systemData[to]) {
      const fromId = String(systemData[from][0]);
      const toId = String(systemData[to][0]);
      
      // Check player gates
      if (playerGates && playerGates[fromId] && playerGates[fromId].includes(toId)) {
        isGate = true;
        gateType = 'player';
      }
      
      // Check NPC gates
      if (!isGate && window.NPC_GATES && window.NPC_GATES[fromId] && window.NPC_GATES[fromId].includes(toId)) {
        isGate = true;
        gateType = 'npc';
      }
    }
    
    let jumpHeat = null;
    let totalAfterJump = null;
    let canJump = null;
    let gate = null;
    
    if (isGate) {
      // Gate jump - no heat calculation
      gate = gateType;
      jumpHeat = null; // N/A for gates
      totalAfterJump = null;
      canJump = true; // Gates are always feasible
    } else if (totalMass && hullMass && baseC && skillLevel !== undefined) {
      // Normal jump
      const effectiveC = baseC * (1 + skillLevel * 0.02);
      jumpHeat = (3 * totalMass * distanceLY) / (effectiveC * hullMass);
      totalAfterJump = jumpHeat ? jumpHeat + 50 : null;
      canJump = jumpHeat ? jumpHeat < 150 : null;
    }
    
    route.push({
      from: from,
      name: to,
      distanceLY: distanceLY,
      jumpHeat: jumpHeat,
      totalAfterJump: totalAfterJump,
      canJump: canJump,
      gate: gate
    });
  }
  
  return { 
    route: route,
    model: 'local-mock'
  };
}

export {
  API_BASE,
  API_SINGLE,
  API_BATCH,
  API_ROUTE,
  fetchSingleSystem,
  fetchBatchSystems,
  fetchRoute
};
