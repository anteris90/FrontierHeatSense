/**
 * services/detour-planner.js
 * 
 * Detour planning logic for routes with failed jumps.
 * 
 * When a system jump exceeds heat limits:
 * 1. Mark original system as excluded
 * 2. Find viable alternative (detour) system
 * 3. Insert detour into route with rejoin path
 * 
 * Strategy:
 * - Search nearby systems within radius (50 LY)
 * - Prefer systems that can rejoin original route quickly
 * - Ensure detour path stays below heat threshold (140)
 */

const METERS_PER_LY = 9.46073e15;
const DETOUR_HEAT_THRESHOLD = 140;
const MAX_TOTAL_HEAT = 149;

/**
 * Calculate maximum jump distance based on heat budget
 * @param {number} currentHeat - Current heat level
 * @param {number} totalMass - Total ship mass
 * @param {number} effectiveC - Effective C-value
 * @param {number} hullMass - Hull mass
 * @param {number} maxHeat - Maximum allowed heat (default 149)
 * @returns {number} Maximum jumpable distance in LY
 */
function calculateMaxJumpDistance(currentHeat, totalMass, effectiveC, hullMass, maxHeat = MAX_TOTAL_HEAT) {
  if (currentHeat >= maxHeat) return 0;
  const heatBudget = maxHeat - currentHeat;
  return (heatBudget * effectiveC * hullMass) / (3 * totalMass);
}

/**
 * Calculate 3D distance between two systems in light years
 */
function calculateDistance(sys1, sys2) {
  if (sys1.length < 11 || sys2.length < 11) return null;
  if (!isFinite(sys1[8]) || !isFinite(sys2[8])) return null;
  
  const dx = sys1[8] - sys2[8];
  const dy = sys1[9] - sys2[9];
  const dz = sys1[10] - sys2[10];
  const distM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return distM / METERS_PER_LY;
}

/**
 * Calculate jump heat generation
 */
function calculateJumpHeat(distanceLY, totalMass, effectiveC, hullMass) {
  if (!distanceLY || !totalMass || !effectiveC || !hullMass) return null;
  return (3 * totalMass * distanceLY) / (effectiveC * hullMass);
}

/**
 * Check if there's a gate connection between two systems
 */
function hasGateConnection(fromId, toId, npcGates, playerGates) {
  const fromIdStr = String(fromId);
  const toIdStr = String(toId);
  
  const npcList = (npcGates && npcGates[fromIdStr]) ? npcGates[fromIdStr] : [];
  const isNpcGate = Array.isArray(npcList) && npcList.indexOf(toIdStr) !== -1;
  
  const playerList = (playerGates && playerGates[fromIdStr]) ? playerGates[fromIdStr] : [];
  const isPlayerGate = Array.isArray(playerList) && playerList.indexOf(toIdStr) !== -1;
  
  return isNpcGate || isPlayerGate ? (isNpcGate ? 'npc' : 'player') : null;
}

/**
 * Find viable detour system to bypass a failed jump
 * 
 * @param {number} failedIndex - Index in route where jump fails
 * @param {array} routeData - Current route array
 * @param {object} D - System database
 * @param {object} npcGates - NPC gate mappings
 * @param {object} playerGates - Player gate mappings
 * @param {object} shipParams - Ship configuration
 * @returns {object|null} Detour plan or null if no viable detour found
 */
function planDetour(failedIndex, routeData, D, npcGates, playerGates, shipParams) {
  if (failedIndex < 1 || failedIndex >= routeData.length) return null;
  
  const { totalMass, hullMass, effectiveC } = shipParams;
  
  const prevSystem = routeData[failedIndex - 1];
  const failedSystem = routeData[failedIndex];
  const nextSystem = failedIndex + 1 < routeData.length ? routeData[failedIndex + 1] : null;
  
  // Get system entries from database
  const prevEntry = D[prevSystem.name.toUpperCase().trim()];
  const failedEntry = D[failedSystem.name.toUpperCase().trim()];
  if (!prevEntry || !failedEntry) return null;
  
  // Calculate maximum jumpable distance from previous system
  const maxJumpDistanceFromPrev = calculateMaxJumpDistance(
    prevSystem.low_heat, 
    totalMass, 
    effectiveC, 
    hullMass, 
    DETOUR_HEAT_THRESHOLD
  );
  
  if (maxJumpDistanceFromPrev <= 0) {
    // No heat budget available for any jump
    return null;
  }
  
  // Collect candidate detour systems within jumpable radius
  const candidates = [];
  
  for (const [systemName, systemEntry] of Object.entries(D)) {
    // Skip route systems
    const isInRoute = routeData.some(r => r.name.toUpperCase().trim() === systemName);
    if (isInRoute) continue;
    
    // Check distance from previous system
    const distFromPrev = calculateDistance(prevEntry, systemEntry);
    if (!distFromPrev || distFromPrev > maxJumpDistanceFromPrev) continue;
    
    // Check if jump from previous system is viable
    const gate1 = hasGateConnection(prevEntry[0], systemEntry[0], npcGates, playerGates);
    let jumpHeat1, totalHeat1;
    
    if (gate1) {
      jumpHeat1 = 0;
      totalHeat1 = systemEntry[6]; // Just the system's low heat
    } else {
      jumpHeat1 = calculateJumpHeat(distFromPrev, totalMass, effectiveC, hullMass);
      if (!jumpHeat1) continue;
      totalHeat1 = prevSystem.low_heat + jumpHeat1;
    }
    
    if (totalHeat1 >= DETOUR_HEAT_THRESHOLD) continue;
    
    // Try to rejoin at next system (if exists)
    let rejoinIndex = null;
    let rejoinDistance = null;
    let rejoinJumpHeat = null;
    let rejoinTotalHeat = null;
    let rejoinGate = null;
    
    if (nextSystem) {
      const nextEntry = D[nextSystem.name.toUpperCase().trim()];
      if (nextEntry) {
        rejoinDistance = calculateDistance(systemEntry, nextEntry);
        rejoinGate = hasGateConnection(systemEntry[0], nextEntry[0], npcGates, playerGates);
        
        if (rejoinGate) {
          rejoinJumpHeat = 0;
          rejoinTotalHeat = nextEntry[6];
        } else if (rejoinDistance) {
          rejoinJumpHeat = calculateJumpHeat(rejoinDistance, totalMass, effectiveC, hullMass);
          if (rejoinJumpHeat) {
            rejoinTotalHeat = systemEntry[6] + rejoinJumpHeat;
          }
        }
        
        if (rejoinTotalHeat && rejoinTotalHeat < DETOUR_HEAT_THRESHOLD) {
          rejoinIndex = failedIndex + 1;
        }
      }
    }
    
    // If can't rejoin at next, try system after that
    if (!rejoinIndex && failedIndex + 2 < routeData.length) {
      const nextNextSystem = routeData[failedIndex + 2];
      const nextNextEntry = D[nextNextSystem.name.toUpperCase().trim()];
      if (nextNextEntry) {
        rejoinDistance = calculateDistance(systemEntry, nextNextEntry);
        rejoinGate = hasGateConnection(systemEntry[0], nextNextEntry[0], npcGates, playerGates);
        
        if (rejoinGate) {
          rejoinJumpHeat = 0;
          rejoinTotalHeat = nextNextEntry[6];
        } else if (rejoinDistance) {
          rejoinJumpHeat = calculateJumpHeat(rejoinDistance, totalMass, effectiveC, hullMass);
          if (rejoinJumpHeat) {
            rejoinTotalHeat = systemEntry[6] + rejoinJumpHeat;
          }
        }
        
        if (rejoinTotalHeat && rejoinTotalHeat < DETOUR_HEAT_THRESHOLD) {
          rejoinIndex = failedIndex + 2;
        }
      }
    }
    
    // Must be able to rejoin route
    if (!rejoinIndex) continue;
    
    candidates.push({
      systemEntry,
      systemName,
      distFromPrev,
      jumpHeat1,
      totalHeat1,
      gate1,
      rejoinIndex,
      rejoinDistance,
      rejoinJumpHeat,
      rejoinTotalHeat,
      rejoinGate,
      // Score: prefer shorter total detour distance
      score: distFromPrev + (rejoinDistance || 0)
    });
  }
  
  if (candidates.length === 0) return null;
  
  // Sort by score (shorter detour preferred)
  candidates.sort((a, b) => a.score - b.score);
  
  const best = candidates[0];
  
  return {
    detourSystemName: best.systemName,
    detourSystemEntry: best.systemEntry,
    insertAfterIndex: failedIndex - 1, // Insert after previous system
    rejoinAtIndex: best.rejoinIndex,
    jumpToDetour: {
      distance_ly: best.distFromPrev,
      jump_heat_gen: best.jumpHeat1,
      total_after_jump: best.totalHeat1,
      gate: best.gate1
    },
    jumpFromDetour: {
      distance_ly: best.rejoinDistance,
      jump_heat_gen: best.rejoinJumpHeat,
      total_after_jump: best.rejoinTotalHeat,
      gate: best.rejoinGate
    }
  };
}

/**
 * Apply detours to route data
 * Marks failed systems as excluded and inserts detour systems
 * 
 * @param {array} routeData - Route array with jump analysis
 * @param {object} D - System database
 * @param {object} npcGates - NPC gate mappings
 * @param {object} playerGates - Player gate mappings
 * @param {object} shipParams - Ship configuration
 * @returns {array} Enhanced route with detours
 */
function applyDetours(routeData, D, npcGates, playerGates, shipParams) {
  const STATUS_MAP = { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' };
  
  // Find all failed jumps
  const failures = [];
  for (let i = 1; i < routeData.length; i++) {
    const entry = routeData[i];
    if (entry.can_jump === false && !entry.gate) {
      failures.push(i);
    }
  }
  
  if (failures.length === 0) return routeData;
  
  // Process failures in reverse order to maintain indices
  const enhancedRoute = [...routeData];
  let insertionOffset = 0;
  
  for (const failedIndex of failures) {
    const adjustedIndex = failedIndex + insertionOffset;
    
    const detourPlan = planDetour(failedIndex, routeData, D, npcGates, playerGates, shipParams);
    
    if (detourPlan) {
      // Mark failed system as excluded
      enhancedRoute[adjustedIndex]._excluded = true;
      
      // Mark next system as excluded if detour skips it
      if (detourPlan.rejoinAtIndex > failedIndex + 1) {
        for (let i = failedIndex + 1; i < detourPlan.rejoinAtIndex; i++) {
          enhancedRoute[i + insertionOffset]._excluded = true;
        }
      }
      
      // Create detour system entry
      const detourEntry = detourPlan.detourSystemEntry;
      const detourSystem = {
        name: detourPlan.detourSystemName,
        id: detourEntry[0],
        low_heat: Number(detourEntry[6]),
        status: STATUS_MAP[detourEntry[7]] || 'UNKNOWN',
        distance_ly: detourPlan.jumpToDetour.distance_ly,
        jump_heat_gen: detourPlan.jumpToDetour.jump_heat_gen,
        total_after_jump: detourPlan.jumpToDetour.total_after_jump,
        can_jump: true,
        gate: detourPlan.jumpToDetour.gate,
        _detour: true,
        _detourRejoinDistance: detourPlan.jumpFromDetour.distance_ly,
        _detourRejoinHeat: detourPlan.jumpFromDetour.jump_heat_gen,
        _detourRejoinGate: detourPlan.jumpFromDetour.gate
      };
      
      // Insert detour after previous system
      enhancedRoute.splice(adjustedIndex, 0, detourSystem);
      insertionOffset++;
      
      // Update next jump data (from detour to rejoin point)
      const rejoinIndex = detourPlan.rejoinAtIndex + insertionOffset;
      if (rejoinIndex < enhancedRoute.length) {
        enhancedRoute[rejoinIndex].distance_ly = detourPlan.jumpFromDetour.distance_ly;
        enhancedRoute[rejoinIndex].jump_heat_gen = detourPlan.jumpFromDetour.jump_heat_gen;
        enhancedRoute[rejoinIndex].total_after_jump = detourPlan.jumpFromDetour.total_after_jump;
        enhancedRoute[rejoinIndex].can_jump = detourPlan.jumpFromDetour.total_after_jump < DETOUR_HEAT_THRESHOLD;
        enhancedRoute[rejoinIndex].gate = detourPlan.jumpFromDetour.gate;
      }
    } else {
      // No detour found - mark system with diagnostic flag
      enhancedRoute[adjustedIndex]._noDetourAvailable = true;
    }
  }
  
  return enhancedRoute;
}

export { planDetour, applyDetours };
