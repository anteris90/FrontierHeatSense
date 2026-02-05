/**
 * handlers/route.js
 * 
 * Route calculation endpoint:
 * - POST /api/route - Calculate optimal route with jump heat and gate detection
 * 
 * Input: { names: [...], totalMass?, hullMass?, baseC?, skillLevel?, playerGates? }
 * Output: { route: [...], total_distance_ly, can_complete_route, playerGateDiagnostics? }
 * 
 * Gates Priority:
 * 1. NPC gates (hardcoded, bidirectional)
 * 2. Player gates (dynamic, from API or R2)
 * 
 * Jump Heat Formula: (3 * totalMass * distanceLY) / (effectiveC * hullMass)
 * where effectiveC = baseC * (1 + skillLevel * 0.02)
 */

import { loadData, loadNpcGates, loadPlayerGatesR2 } from '../services/data-loader.js';
import { resolvePlayerGatesFromApi } from '../services/player-gate-resolver.js';

const METERS_PER_LY = 9.46073e15;
const STATUS_MAP = { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' };

/**
 * Normalize player gates from various input formats
 * Supports: array of [from, to] pairs, or object {from: [tos]}
 */
function normalizePlayerGatesInput(raw) {
  const playerGates = {};
  
  if (Array.isArray(raw)) {
    const tmp = Object.create(null);
    for (const it of raw) {
      let a, b;
      if (Array.isArray(it) && it.length >= 2) { 
        a = it[0]; 
        b = it[1]; 
      } else if (it && typeof it === 'object' && 'from' in it && 'to' in it) { 
        a = it.from; 
        b = it.to; 
      }
      if (a == null || b == null) continue;
      
      const sa = String(a);
      const sb = String(b);
      tmp[sa] = tmp[sa] || [];
      if (tmp[sa].indexOf(sb) === -1) tmp[sa].push(sb);
      tmp[sb] = tmp[sb] || [];
      if (tmp[sb].indexOf(sa) === -1) tmp[sb].push(sa);
    }
    Object.assign(playerGates, tmp);
  } else if (raw && typeof raw === 'object') {
    const tmp = Object.create(null);
    for (const k of Object.keys(raw)) {
      const vals = Array.isArray(raw[k]) ? raw[k] : [];
      const sk = String(k);
      tmp[sk] = tmp[sk] || [];
      for (const v of vals) {
        const sv = String(v);
        if (tmp[sk].indexOf(sv) === -1) tmp[sk].push(sv);
        tmp[sv] = tmp[sv] || [];
        if (tmp[sv].indexOf(sk) === -1) tmp[sv].push(sk);
      }
    }
    Object.assign(playerGates, tmp);
  }
  
  return playerGates;
}

/**
 * Resolve player gates in priority order:
 * 1. Request-provided mapping
 * 2. R2-cached mapping
 * 3. Dynamic API resolution
 */
async function resolvePlayerGates(body, env, D, diagnostics) {
  let playerGates = {};
  
  // Priority 1: Request-provided mapping
  if (body.playerGates) {
    playerGates = normalizePlayerGatesInput(body.playerGates);
    return playerGates;
  }
  
  // Priority 2: Try R2-cached mapping
  let resolvedFromR2 = false;
  try {
    const r2map = await loadPlayerGatesR2(env).catch(() => null);
    if (r2map && typeof r2map === 'object' && Object.keys(r2map).length) {
      playerGates = r2map;
      resolvedFromR2 = true;
      diagnostics.notes = diagnostics.notes || [];
      diagnostics.notes.push('Loaded player gates from R2');
      return playerGates;
    }
  } catch (e) {
    // Fall through to API resolution
  }
  
  // Priority 3: Dynamic API resolution
  if (!resolvedFromR2 && env.PLAYER_GATE_API) {
    try {
      const names = body.names || [];
      playerGates = await resolvePlayerGatesFromApi(names, D, env, diagnostics);
      if (Object.keys(playerGates).length) {
        diagnostics.notes = diagnostics.notes || [];
        diagnostics.notes.push('Resolved player gates from EVE Frontier API');
      }
    } catch (err) {
      diagnostics.notes = diagnostics.notes || [];
      diagnostics.notes.push(`Player gate resolution error: ${err.message}`);
    }
  } else if (!env.PLAYER_GATE_API) {
    diagnostics.notes = diagnostics.notes || [];
    diagnostics.notes.push('PLAYER_GATE_API not configured');
  }
  
  return playerGates;
}

/**
 * POST /api/route
 * Calculate route with jump heat and gate detection
 */
async function handleRoute(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const names = body.names || [];
  
  if (names.length < 2) {
    return Response.json({ error: 'Need at least 2 systems' }, { status: 400, headers: cors });
  }

  try {
    // Load data and gates
    const D = await loadData(env);
    const npcGates = await loadNpcGates(env).catch(() => ({}));
    
    // Initialize diagnostics
    const playerGateDiagnostics = { 
      skippedSystems: [], 
      authFailed: false, 
      rateLimited: false, 
      notes: [] 
    };
    
    // Resolve player gates with priority order
    const playerGates = await resolvePlayerGates(body, env, D, playerGateDiagnostics);
    
    // Ship parameters (defaults provided)
    const totalMass = body.totalMass || 79598125;
    const hullMass = body.hullMass || 74655480;
    const baseC = body.baseC || 2.5;
    const skillLevel = body.skillLevel || 0;
    const effectiveC = baseC * (1 + skillLevel * 0.02);
    
    // Build route data
    const routeData = [];
    let totalLY = 0;
    let canComplete = true;
    let prevEntry = null;
    
    for (let i = 0; i < names.length; i++) {
      const rawName = names[i];
      const name = rawName.toUpperCase().trim();
      const entry = D[name];
      
      if (!entry) {
        return Response.json({ error: `Not found: ${rawName}` }, { status: 404, headers: cors });
      }
      
      const lowHeat = entry[6];
      const st = entry[7];
      
      let jumpHeatGen = 0;
      let totalAfter = lowHeat;
      let canJumpThis = true;
      let gateType = null;
      let distLY = null;
      
      // Calculate jump to this system (if not first system)
      if (i > 0) {
        const fromId = String(prevEntry[0]);
        const toId = String(entry[0]);
        
        const npcList = (npcGates && npcGates[fromId]) ? npcGates[fromId] : [];
        const playerList = (playerGates && playerGates[fromId]) ? playerGates[fromId] : [];
        
        // Check for gate match
        const isNpcGate = Array.isArray(npcList) && npcList.indexOf(toId) !== -1;
        const isPlayerGate = Array.isArray(playerList) && playerList.indexOf(toId) !== -1;
        
        if (isNpcGate || isPlayerGate) {
          // Gate jump: no heat generation, no distance calculation needed
          gateType = isNpcGate ? 'npc' : 'player';
          jumpHeatGen = 0;
          totalAfter = lowHeat;
          canJumpThis = true;
          
          // Still compute distance for metrics if coordinates available
          if (entry.length >= 11 && prevEntry.length >= 11 && 
              isFinite(entry[8]) && isFinite(prevEntry[8])) {
            const dx = entry[8] - prevEntry[8];
            const dy = entry[9] - prevEntry[9];
            const dz = entry[10] - prevEntry[10];
            const distM = Math.sqrt(dx*dx + dy*dy + dz*dz);
            distLY = distM / METERS_PER_LY;
            totalLY += distLY;
          }
        } else {
          // Normal jump: calculate heat
          if (entry.length >= 11 && prevEntry.length >= 11 && 
              isFinite(entry[8]) && isFinite(prevEntry[8])) {
            const dx = entry[8] - prevEntry[8];
            const dy = entry[9] - prevEntry[9];
            const dz = entry[10] - prevEntry[10];
            const distM = Math.sqrt(dx*dx + dy*dy + dz*dz);
            distLY = distM / METERS_PER_LY;
            totalLY += distLY;
            
            jumpHeatGen = (3 * totalMass * distLY) / (effectiveC * hullMass);
            totalAfter = prevEntry[6] + jumpHeatGen;
            canJumpThis = Number.isFinite(totalAfter) ? (totalAfter <= 150) : null;
            
            if (canJumpThis === false) canComplete = false;
          } else {
            // Missing coordinates — cannot compute
            jumpHeatGen = null;
            totalAfter = lowHeat;
            canJumpThis = null;
            playerGateDiagnostics.skippedSystems.push({ name: rawName, reason: 'missing_coords' });
          }
        }
      }
      
      // Add to route
      routeData.push({
        name: rawName,
        id: entry[0],
        low_heat: Number(lowHeat),
        status: STATUS_MAP[st] || 'UNKNOWN',
        distance_ly: (distLY != null) ? Number(distLY) : null,
        jump_heat_gen: (jumpHeatGen == null) ? null : Number(jumpHeatGen),
        total_after_jump: (totalAfter == null) ? null : Number(totalAfter),
        can_jump: (canJumpThis == null) ? null : Boolean(canJumpThis),
        gate: gateType // 'npc' | 'player' | null
      });
      
      prevEntry = entry;
    }
    
    const respBody = {
      route: routeData,
      total_distance_ly: Number(totalLY),
      can_complete_route: canComplete,
      playerGateDiagnostics
    };
    
    return Response.json(respBody, { headers: cors });
  } catch (err) {
    console.error('Route error:', err);
    return Response.json({ error: err.message }, { status: 500, headers: cors });
  }
}

/**
 * Route requests to handler
 */
async function handleRouteEndpoint(pathname, request, env, cors) {
  if (pathname === '/api/route' && request.method === 'POST') {
    return await handleRoute(request, env, cors);
  }
  
  return null; // Not a route endpoint
}

export { handleRouteEndpoint };
