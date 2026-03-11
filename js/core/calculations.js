/**
 * core/calculations.js
 * 
 * Physics calculations for heat and distance in EVE Frontier.
 * 
 * Responsibilities:
 * - 3D coordinate distance calculations
 * - Jump heat generation calculations
 * - Route jump analysis
 * - Feasibility checks
 */

const METERS_PER_LY = 9.4607e15;
const MAX_TOTAL_HEAT = 149;

/**
 * Calculate distance in light-years between two systems
 * Based on 3D Cartesian coordinates (meters)
 * 
 * Formula: distance = sqrt((x1-x2)² + (y1-y2)² + (z1-z2)²) / METERS_PER_LY
 * 
 * @param {object} a - Source system {coords: {x, y, z}}
 * @param {object} b - Target system {coords: {x, y, z}}
 * @returns {number} Distance in light-years, or 0 if coords missing
 */
function calculateDistanceLY(a, b) {
  if (!a?.coords || !b?.coords) return 0;

  const dx = a.coords.x - b.coords.x;
  const dy = a.coords.y - b.coords.y;
  const dz = a.coords.z - b.coords.z;

  const distanceMeters = Math.sqrt(dx*dx + dy*dy + dz*dz);
  return distanceMeters / METERS_PER_LY;
}

/**
 * Calculate jump heat generated and total heat after jump
 * 
 * Formula: jumpHeat = (3 * totalMass * distanceLY) / (C * hullMass)
 * where C = baseC * (1 + skillLevel * 0.02)
 * 
 * Jump constraints:
 * - Total heat must stay below 149 to complete jump (canJump = true)
 * - Warning threshold: lowHeat > 90
 * 
 * @param {object} params - Calculation parameters
 * @param {number} params.lowHeat - System's coldest heat
 * @param {number} params.distanceLY - Jump distance in light-years
 * @param {number} params.totalHullMass - Ship mass with cargo
 * @param {number} params.hullMass - Base ship hull mass
 * @param {number} params.C - Effective C value (after skill bonus)
 * @returns {object} {jumpHeat, totalAfterJump, warning, canJump}
 */
function calculateJumpHeat({
  lowHeat,
  distanceLY,
  totalHullMass,
  hullMass,
  C
}) {
  const jumpHeat = (3 * totalHullMass * distanceLY) / (C * hullMass);
  const totalAfterJump = lowHeat + jumpHeat;
  const warning = lowHeat > 90;
  const canJump = totalAfterJump < MAX_TOTAL_HEAT;

  return {
    jumpHeat,
    totalAfterJump,
    warning,
    canJump
  };
}

/**
 * Calculate the maximum safe jump distance from a system for the current ship.
 *
 * Rearranged from the jump heat formula using the current heat ceiling:
 * maxDistanceLY = ((maxTotalHeat - lowHeat) * C * hullMass) / (3 * totalHullMass)
 *
 * @param {object} params - Calculation parameters
 * @param {number} params.lowHeat - System's coldest heat
 * @param {number} params.totalHullMass - Ship mass with cargo
 * @param {number} params.hullMass - Base ship hull mass
 * @param {number} params.C - Effective C value (after skill bonus)
 * @param {number} [params.maxTotalHeat=MAX_TOTAL_HEAT] - Maximum allowed post-jump heat
 * @returns {number|null} Max safe jump distance in light-years
 */
function calculateMaxJumpDistanceLY({
  lowHeat,
  totalHullMass,
  hullMass,
  C,
  maxTotalHeat = MAX_TOTAL_HEAT
}) {
  if (![lowHeat, totalHullMass, hullMass, C, maxTotalHeat].every(Number.isFinite)) {
    return null;
  }

  if (totalHullMass <= 0 || hullMass <= 0 || C <= 0) {
    return null;
  }

  const availableHeat = maxTotalHeat - lowHeat;
  if (availableHeat <= 0) {
    return 0;
  }

  return (availableHeat * C * hullMass) / (3 * totalHullMass);
}

/**
 * Calculate the sum of all maximum safe jump distances for a route.
 *
 * Each segment uses the departure system's coldest heat. The last system has no
 * outbound jump, so it is excluded.
 *
 * @param {array} systems - Route systems in order
 * @param {object} shipParams - { hullMass, totalHullMass, C }
 * @returns {number|null} Total max safe jump distance in light-years
 */
function calculateMaxTotalRouteJumpDistance(systems, shipParams = {}) {
  if (!Array.isArray(systems) || systems.length < 2) {
    return null;
  }

  let totalMaxDistanceLY = 0;

  for (let i = 0; i < systems.length - 1; i++) {
    const lowHeat = systems[i]?.coldest_point?.heat;
    const maxDistanceLY = calculateMaxJumpDistanceLY({
      lowHeat,
      totalHullMass: shipParams.totalHullMass,
      hullMass: shipParams.hullMass,
      C: shipParams.C
    });

    if (maxDistanceLY == null) {
      return null;
    }

    totalMaxDistanceLY += maxDistanceLY;
  }

  return totalMaxDistanceLY;
}

/**
 * Calculate jump-by-jump heat data for a complete route
 * 
 * Each jump entry contains:
 * - from/to system names
 * - distance in LY
 * - source system low heat
 * - generated jump heat
 * - total heat after jump
 * - feasibility (canJump)
 * - warning status
 * 
 * @param {array} systems - Array of system objects in route order
 * @param {object} shipParams - {hullMass, totalHullMass, C}
 * @returns {array} Jump entries
 */
function calculateRouteJumps(systems, shipParams = {}) {
  const results = [];
  const hasShipData = shipParams && shipParams.hullMass;

  for (let i = 0; i < systems.length - 1; i++) {
    const from = systems[i];
    const to = systems[i + 1];
    const distanceLY = calculateDistanceLY(from, to);

    let jump = {
      jumpHeat: null,
      totalAfterJump: null,
      warning: from.coldest_point.heat > 90,
      canJump: null
    };

    if (hasShipData) {
      jump = calculateJumpHeat({
        lowHeat: from.coldest_point.heat,
        distanceLY,
        totalHullMass: shipParams.totalHullMass,
        hullMass: shipParams.hullMass,
        C: shipParams.C
      });
    }

    results.push({
      from: from.name,
      to: to.name,
      distanceLY,
      lowHeat: from.coldest_point.heat,
      ...jump
    });
  }

  return results;
}

/**
 * Create lookup map from route jumps by source system name
 * Useful for quick access to jump info by system
 * 
 * @param {array} routeJumps - Jump entries from calculateRouteJumps
 * @returns {object} {systemName: jumpEntry, ...}
 */
function mapRouteJumpsBySystem(routeJumps) {
  const map = {};
  routeJumps.forEach(j => {
    map[j.from] = j;
  });
  return map;
}

export {
  METERS_PER_LY,
  MAX_TOTAL_HEAT,
  calculateDistanceLY,
  calculateJumpHeat,
  calculateMaxJumpDistanceLY,
  calculateMaxTotalRouteJumpDistance,
  calculateRouteJumps,
  mapRouteJumpsBySystem
};
