/**
 * Detour Planner Service
 * 
 * Finds alternative routes when direct jumps exceed heat threshold (149).
 * Uses physics-based calculations with full system database access.
 * 
 * Algorithm:
 * 1. Identify failed jumps (heat > 149)
 * 2. Calculate max jumpable distance from current system
 * 3. Search database for systems within range and closer to destination
 * 4. Validate detour jump heat < 140 (safety margin)
 * 5. Mark original system as excluded, insert detour system
 * 
 * @module detour-planner
 */

/**
 * Calculate maximum distance ship can jump given heat budget
 * Formula: maxDistance = (maxHeat - currentHeat) * effectiveC * hullMass / (3 * totalMass)
 */
function calculateMaxJumpDistance(currentHeat, shipParams) {
  const { totalMass, hullMass, effectiveC } = shipParams;
  const maxHeat = 149; // Ship overheats above this
  const heatBudget = maxHeat - currentHeat;
  
  if (heatBudget <= 0) return 0;
  
  return (heatBudget * effectiveC * hullMass) / (3 * totalMass);
}

/**
 * Calculate jump heat between two systems
 * Formula: jumpHeat = (3 * totalMass * distanceLY) / (effectiveC * hullMass)
 */
function calculateJumpHeat(distanceLY, shipParams) {
  const { totalMass, hullMass, effectiveC } = shipParams;
  return (3 * totalMass * distanceLY) / (effectiveC * hullMass);
}

/**
 * Calculate 3D distance between two systems in light-years
 */
function calculateDistance(sys1, sys2) {
  const dx = sys1.x - sys2.x;
  const dy = sys1.y - sys2.y;
  const dz = sys1.z - sys2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Find detour system for a failed jump
 * 
 * @param {Object} fromSystem - Current system with {id, name, x, y, z}
 * @param {Object} toSystem - Failed destination system
 * @param {Object} destSystem - Final route destination
 * @param {number} currentHeat - Accumulated heat before this jump
 * @param {Object} shipParams - {totalMass, hullMass, effectiveC}
 * @param {Object} systemDatabase - All systems indexed by normalized name
 * @returns {Object|null} Detour system or null if none found
 */
function planDetour(fromSystem, toSystem, destSystem, currentHeat, shipParams, systemDatabase) {
  // Calculate max distance we can jump with remaining heat budget
  const maxJumpDist = calculateMaxJumpDistance(currentHeat, shipParams);
  
  if (maxJumpDist <= 0) {
    return null; // No heat budget remaining
  }
  
  const distToFailed = calculateDistance(fromSystem, toSystem);
  const distFailedToDest = calculateDistance(toSystem, destSystem);
  
  let bestDetour = null;
  let bestScore = Infinity;
  const maxDetourHeat = 140; // Safety margin below 149
  
  // Search all systems in database
  for (const [, candidate] of Object.entries(systemDatabase)) {
    // Skip if it's one of the route systems
    if (candidate.id === fromSystem.id || candidate.id === toSystem.id || candidate.id === destSystem.id) {
      continue;
    }
    
    // Check if candidate is within jumpable range from current position
    const distToCandidate = calculateDistance(fromSystem, candidate);
    if (distToCandidate > maxJumpDist) {
      continue; // Too far to jump
    }
    
    // Calculate heat for jump to candidate
    const heatToCandidate = calculateJumpHeat(distToCandidate, shipParams);
    if (currentHeat + heatToCandidate > maxDetourHeat) {
      continue; // Would exceed safe heat threshold
    }
    
    // Check if candidate makes progress toward destination
    const distCandidateToDest = calculateDistance(candidate, destSystem);
    if (distCandidateToDest >= distFailedToDest) {
      continue; // Doesn't get us closer to final destination
    }
    
    // Score: prefer systems that minimize total detour distance
    const detourDistance = distToCandidate + distCandidateToDest;
    const directDistance = distToFailed + distFailedToDest;
    const score = detourDistance / directDistance; // Lower is better
    
    if (score < bestScore) {
      bestScore = score;
      bestDetour = {
        system: candidate,
        distance: distToCandidate,
        heat: heatToCandidate,
        score: score
      };
    }
  }
  
  return bestDetour;
}

/**
 * Apply detour logic to route jumps
 * Modifies routeData array in place to mark excluded systems and insert detours
 * 
 * @param {Array} routeJumps - Array of jump objects with heat calculations
 * @param {Array} routeData - Array of route system objects
 * @param {Object} shipParams - Ship parameters {totalMass, hullMass, effectiveC}
 * @param {Object} systemDatabase - Full system database indexed by normalized name
 * @returns {Array} Modified routeData with detour annotations
 */
export function applyDetours(routeJumps, routeData, shipParams, systemDatabase) {
  if (!routeJumps || routeJumps.length === 0) {
    return routeData;
  }
  
  const result = [];
  let accumulatedHeat = 0;
  
  for (let i = 0; i < routeJumps.length; i++) {
    const jump = routeJumps[i];
    const currentSystem = routeData[i];
    const nextSystem = routeData[i + 1];
    
    // Add current system to result
    result.push(currentSystem);
    
    // Check if this jump fails (heat > 149)
    if (jump.heatGenerated > 149) {
      const finalDestination = routeData[routeData.length - 1];
      
      // Try to find detour
      const detour = planDetour(
        currentSystem.system,
        nextSystem.system,
        finalDestination.system,
        accumulatedHeat,
        shipParams,
        systemDatabase
      );
      
      if (detour) {
        // Mark original failed system as excluded
        nextSystem._excluded = true;
        nextSystem._excludedReason = `Failed jump (${jump.heatGenerated.toFixed(2)} heat)`;
        
        // Insert detour system
        const detourEntry = {
          system: detour.system,
          _detour: true,
          _detourFrom: currentSystem.system.name,
          _detourAround: nextSystem.system.name,
          _detourDistance: detour.distance.toFixed(2),
          _detourHeat: detour.heat.toFixed(2)
        };
        
        result.push(detourEntry);
        
        // Update accumulated heat (jump to detour)
        accumulatedHeat += detour.heat;
      } else {
        // No detour found - mark as no-detour-available
        nextSystem._noDetourAvailable = true;
        nextSystem._failedHeat = jump.heatGenerated.toFixed(2);
        accumulatedHeat += jump.heatGenerated; // Still accumulates (for tracking)
      }
    } else {
      // Normal jump - accumulate heat
      accumulatedHeat += jump.heatGenerated;
    }
  }
  
  // Add final destination if not already added
  const lastSystem = routeData[routeData.length - 1];
  if (result[result.length - 1].system.id !== lastSystem.system.id) {
    result.push(lastSystem);
  }
  
  return result;
}
