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
const API_BASE = window.HEATSENSE_API || 'https://systems.heatsense.workers.dev';
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
  const response = await fetch(API_BATCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names: normalizedNames })
  });

  if (!response.ok) {
    throw new Error(`Batch error: ${response.status}`);
  }

  return await response.json();
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
  const response = await fetch(API_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Route request failed: ${response.status}`);
  }

  return await response.json();
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
