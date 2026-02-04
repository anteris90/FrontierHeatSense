/**
 * app.js - Application Orchestration Layer
 * 
 * Frontier HeatSense - Main Application Script
 * 
 * Coordinates all modules:
 * - core: normalization, calculations, api-client
 * - services: ship-manager, player-gate-resolver
 * - ui: renderer, route-table, event-handlers, ship-ui
 * 
 * This file handles:
 * 1. Module initialization
 * 2. Event binding
 * 3. State management
 * 4. Search and route orchestration
 * 5. Player gate resolution coordination
 * 
 * @author HeatSense Team
 * @version 2.0
 */

// ============================================
// Imports (ES6 modules)
// ============================================

import { normalizeSystemName, parseSystemInput } from './core/normalization.js';
import { calculateDistanceLY, calculateRouteJumps, mapRouteJumpsBySystem } from './core/calculations.js';
import { fetchSingleSystem, fetchBatchSystems, fetchRoute, API_BASE, API_BATCH } from './core/api-client.js';

import { selectShip, getShips, hasShipSelected, calculateSkillBonus, calculateEffectiveC, getShipParameters, loadShips } from './services/ship-manager.js';
import { loadPlayerGates } from './services/player-gate-resolver.js';

import { displayResult, showError } from './ui/renderer.js';
import { renderRouteTable, mapRouteJumpsByName } from './ui/route-table.js';
import { bindSearchButton, bindPasteHandler, bindKeyboardShortcuts, bindShipSelect, bindSkillSlider, bindTotalMassInput, updateSearchButton, setResultsVisible, setErrorVisible, updateStatusMessage } from './ui/event-handlers.js';
import { populateShipSelect, updateShipDisplay, updateEffectiveCDisplay, updateSkillDisplay, resetSkillSlider, hideShipDetails } from './ui/ship-ui.js';

// ============================================
// Global State
// ============================================

let lastRouteResults = null;

// Expose for backward compatibility and debugging
window.lastRouteResults = lastRouteResults;

// ============================================
// Initialization
// ============================================

// Set app version in footer
try {
  const meta = document.querySelector('meta[name="app-version"]');
  const v = (meta && meta.content) ? meta.content : 'v0.0.0';
  const el = document.getElementById('appVersion');
  if (el) el.textContent = v;
} catch (e) {
  // ignore in non-browser environments
}

// ============================================
// Module: System Search & Lookup
// ============================================

/**
 * Main search function
 * Fetches system data, parses route, calculates jumps, renders results
 */
async function searchSystems() {
  const input = document.getElementById('systemInput').value.trim();
  const btn = document.getElementById('searchBtn');
  const resultDiv = document.getElementById('result');
  const errorDiv = document.getElementById('error');
  const srStatus = document.getElementById('srStatus');

  resultDiv.style.display = 'none';
  errorDiv.style.display = 'none';
  srStatus.textContent = '';

  if (!input) {
    showError('Please enter at least one system name');
    return;
  }

  const systemNames = parseSystemInput(input);
  document.getElementById('systemInput').value = systemNames.join(', ');

  if (systemNames.length === 0) {
    showError('No valid system names found');
    return;
  }

  updateSearchButton(true, 'Checking...');
  resultDiv.innerHTML = `<div class="loading">🔍 Checking ${systemNames.length} system(s)...</div>`;
  resultDiv.style.display = 'block';
  updateStatusMessage(`Checking ${systemNames.length} system(s).`);

  try {
    let results = [];
    let model = 'arctangent-v1.0';

    if (systemNames.length > 1) {
      // Batch request for multiple systems
      const response = await fetchBatchSystems(systemNames);
      const systemMap = new Map();

      for (const s of response.systems) {
        systemMap.set(normalizeSystemName(s.name), s);
      }

      results = [];
      for (const name of systemNames) {
        const s = systemMap.get(normalizeSystemName(name));

        if (!s) {
          results.push({ name, error: 'System not found' });
          continue;
        }

        const normalizedSystem = {
          id: s.id,
          name: s.name,
          star_class: s.class,
          temperature: s.temp,
          radius_km: s.radius_km,
          status: s.status,
          coords: s.coords,
          coldest_point: {
            distance_au: s.coldest.au,
            distance_ls: s.coldest.ls,
            heat: s.coldest.heat
          }
        };

        results.push({ name: s.name, system: normalizedSystem, model: response.model || model });
      }
    } else {
      // Single system lookup
      const name = systemNames[0];
      const nameForApi = normalizeSystemName(name);
      const system = await fetchSingleSystem(nameForApi);

      const normalizedSystem = {
        id: system.id,
        name: system.name,
        star_class: system.class,
        temperature: system.temp,
        radius_km: system.radius_km,
        status: system.status,
        coords: system.coords,
        coldest_point: {
          distance_au: system.coldest.au,
          distance_ls: system.coldest.ls,
          heat: system.coldest.heat
        }
      };

      results.push({ name, system: normalizedSystem, model });
    }

    if (results.length === 1 && !results[0].error) {
      displayResult(results[0].system, results[0].model);
    } else {
      lastRouteResults = results;
      window.lastRouteResults = results;
      await displayMultipleResults(results);
    }
    
    updateStatusMessage(`Results ready for ${results.length} system(s).`);
  } catch (error) {
    console.error('Search error:', error);
    showError(error.message);
    updateStatusMessage(`Error: ${error.message}`);
  } finally {
    updateSearchButton(false, 'Check Heat');
  }
}

/**
 * Display multiple systems in route table format
 * Coordinates with server for route calculation and player gate resolution
 */
async function displayMultipleResults(results) {
  const resultDiv = document.getElementById('result');
  const srStatus = document.getElementById('srStatus');

  const statusIcon = {
    SAFE: '✅',
    MODERATE: '⚠️',
    DANGEROUS: '🔥',
    CRITICAL: '☠️'
  };

  const systems = results.filter(r => !r.error).map(r => r.system);
  let routeJumps = [];

  // Try server-side route calculation
  try {
    const namesForApi = systems.map(s => normalizeSystemName(s.name));
    const body = { names: namesForApi };

    // Preflight: attempt player gate resolution if configured
    try {
      if (!window.PLAYER_GATES && typeof window.loadPlayerGates === 'function' && (window.USE_LOCAL_SYSTEM_DATA || window.PLAYER_GATE_API)) {
        updateStatusMessage('Resolving player gates (client preflight)...');
        updatePlayerGateIndicator();
        
        const namesForResolve = Array.isArray(window.__lastParsedSystemNames) && window.__lastParsedSystemNames.length 
          ? window.__lastParsedSystemNames 
          : namesForApi;
        
        try {
          const resolved = await window.loadPlayerGates({ names: namesForResolve });
          if (resolved && Object.keys(resolved).length) {
            window.PLAYER_GATES = resolved;
          }
        } catch (e) {
          console.warn('Preflight player gate resolution failed:', e && e.message);
        }
        updateStatusMessage('');
        updatePlayerGateIndicator();
      }
    } catch (e) {
      console.warn('Player gate preflight error:', e && e.message);
    }

    // Add parsed IDs if available (from EF-Map anchors)
    let parsedIds = Array.isArray(window.__lastParsedSystemIds) ? window.__lastParsedSystemIds.slice() : [];
    
    // Fallback to resolved system IDs
    if ((!parsedIds || parsedIds.length < 2) && Array.isArray(systems) && systems.length >= 2) {
      const sysIds = systems.map(s => s.id).filter(Boolean).map(String);
      if (sysIds.length >= 2) parsedIds = sysIds;
    }

    // Build inferred player gates from parsed IDs
    if (Array.isArray(parsedIds) && parsedIds.length >= 2) {
      const inferred = Object.create(null);
      for (let i = 0; i < Math.min(parsedIds.length, namesForApi.length) - 1; i++) {
        const a = parsedIds[i];
        const b = parsedIds[i + 1];
        if (a && b) {
          const sa = String(a);
          const sb = String(b);
          inferred[sa] = inferred[sa] || [];
          if (inferred[sa].indexOf(sb) === -1) inferred[sa].push(sb);
        }
      }
      if (Object.keys(inferred).length) {
        body.playerGates = inferred;
      }
    }

    // Add ship data if available
    if (hasShipSelected()) {
      const skillLevel = Number(document.getElementById('skillSlider')?.value) || 0;
      const totalMass = Number(document.getElementById('totalHullMass')?.value);
      const shipParams = getShipParameters(skillLevel, totalMass);
      
      if (shipParams) {
        body.totalMass = shipParams.totalHullMass;
        body.hullMass = shipParams.hullMass;
        body.baseC = shipParams.baseC;
        body.skillLevel = skillParams.skillLevel;
      }
    }

    // Include cached player gates if available
    if (window.PLAYER_GATES) {
      body.playerGates = window.PLAYER_GATES;
    }

    // Request route from server
    const resp = await fetchRoute(body);
    
    // Expose diagnostics globally
    window.__lastPlayerGateDiagnostics = resp.playerGateDiagnostics || null;

    if (Array.isArray(resp.route)) {
      const serverMap = new Map();
      for (const e of resp.route) {
        serverMap.set(normalizeSystemName(String(e.name)), e);
      }

      // Build jump entries
      for (let i = 0; i < systems.length - 1; i++) {
        const from = systems[i];
        const to = systems[i + 1];
        const normTo = normalizeSystemName(to.name);
        const serverEntry = serverMap.get(normTo) || {};
        const distanceLY = calculateDistanceLY(from, to);

        routeJumps.push({
          from: from.name,
          to: to.name,
          distanceLY,
          lowHeat: from.coldest_point.heat,
          jumpHeat: hasShipSelected() && serverEntry.jump_heat_gen != null ? Number(serverEntry.jump_heat_gen) : null,
          totalAfterJump: hasShipSelected() && serverEntry.total_after_jump != null ? Number(serverEntry.total_after_jump) : null,
          warning: from.coldest_point.heat > 90,
          canJump: hasShipSelected() && serverEntry.can_jump != null ? Boolean(serverEntry.can_jump) : null,
          gate: serverEntry.gate || null
        });
      }

      // Client-side fallback for gate detection
      try {
        const inferred = window.__lastInferredPlayerGates || window.PLAYER_GATES || null;
        if (inferred && typeof inferred === 'object') {
          for (let i = 0; i < routeJumps.length; i++) {
            const fromSys = systems[i];
            const toSys = systems[i + 1];
            if (!fromSys || !toSys) continue;

            const fromId = fromSys.id != null ? String(fromSys.id) : null;
            const toId = toSys.id != null ? String(toSys.id) : null;
            const fromName = normalizeSystemName(fromSys.name || '');
            const toName = normalizeSystemName(toSys.name || '');

            const candidates = [fromId, fromName, fromSys.name];
            let matched = false;

            for (const key of candidates) {
              if (!key) continue;
              const list = inferred[key] || inferred[String(key)];
              if (!list || !Array.isArray(list)) continue;

              for (const item of list) {
                const s = item == null ? null : String(item);
                if (!s) continue;
                if ((toId && s === toId) || (toName && s === toName) || s === String(Number(toId))) {
                  matched = true;
                  break;
                }
              }
              if (matched) break;
            }

            if (matched) {
              routeJumps[i].gate = 'player';
              routeJumps[i].jumpHeat = null;
              routeJumps[i].totalAfterJump = routeJumps[i].lowHeat || null;
              routeJumps[i].canJump = true;
            }
          }
        }
      } catch (e) {
        console.warn('Player gate fallback failed:', e && e.message);
      }
    }
  } catch (err) {
    console.warn('Route request failed:', err && err.message);
    // Continue with client-side calculation if available
  }

  // Render results
  const html = renderRouteTable(results, routeJumps, hasShipSelected());
  resultDiv.innerHTML = html;
  resultDiv.style.display = 'block';
  resultDiv.focus();
}

// ============================================
// Module: Ship Management
// ============================================

async function initializeShips() {
  await loadShips();
  const ships = getShips();
  populateShipSelect(ships);
}

function handleShipSelection(shipName) {
  const ship = selectShip(shipName);
  
  if (ship) {
    updateShipDisplay(ship);
    resetSkillSlider();
  } else {
    hideShipDetails();
  }

  // Recalculate route if exists
  if (lastRouteResults) {
    displayMultipleResults(lastRouteResults);
  }
}

function handleSkillChange(skillLevel) {
  if (!hasShipSelected()) return;
  
  const bonus = calculateSkillBonus(skillLevel);
  const effectiveC = calculateEffectiveC(skillLevel);
  
  updateSkillDisplay(skillLevel, bonus);
  updateEffectiveCDisplay(effectiveC);

  // Recalculate route if exists
  if (lastRouteResults) {
    displayMultipleResults(lastRouteResults);
  }
}

function handleMassChange() {
  // Recalculate route if exists
  if (lastRouteResults) {
    displayMultipleResults(lastRouteResults);
  }
}

// ============================================
// Module: Player Gates UI Indicator
// ============================================

function ensurePlayerGateIndicator() {
  if (document.getElementById('playerGateIndicator')) {
    return document.getElementById('playerGateIndicator');
  }

  const el = document.createElement('div');
  el.id = 'playerGateIndicator';
  el.style.position = 'fixed';
  el.style.right = '12px';
  el.style.top = '12px';
  el.style.zIndex = '9999';
  el.style.padding = '8px 10px';
  el.style.background = 'rgba(0,0,0,0.75)';
  el.style.color = '#cff';
  el.style.borderRadius = '6px';
  el.style.fontSize = '13px';
  el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.6)';
  el.style.cursor = 'pointer';
  el.title = 'Click to toggle local system->id lookup';
  
  el.addEventListener('click', () => {
    window.USE_LOCAL_SYSTEM_DATA = !window.USE_LOCAL_SYSTEM_DATA;
    updatePlayerGateIndicator();
  });
  
  document.body.appendChild(el);
  return el;
}

function updatePlayerGateIndicator() {
  const el = ensurePlayerGateIndicator();
  const pg = window.PLAYER_GATES;
  const diag = window.__lastPlayerGateDiagnostics;
  const useLocal = !!window.USE_LOCAL_SYSTEM_DATA;

  if (!pg || Object.keys(pg).length === 0) {
    if (diag && diag.authFailed) {
      el.textContent = 'PlayerGates: auth failed';
      el.style.background = 'rgba(80,0,0,0.85)';
      return el;
    }
    el.textContent = `PlayerGates: none (${useLocal ? 'local' : 'api'} off)`;
    el.style.background = 'rgba(40,40,40,0.9)';
    return el;
  }

  const pairs = Object.keys(pg).reduce((acc, k) => acc + (Array.isArray(pg[k]) ? pg[k].length : 0), 0);
  el.textContent = `PlayerGates: ${pairs} mapping(s) — ${useLocal ? 'local' : 'api'}`;
  el.style.background = 'rgba(0,80,80,0.9)';
  return el;
}

// Expose globally for use
window.updatePlayerGateIndicator = updatePlayerGateIndicator;
window.loadPlayerGates = loadPlayerGates;
window.renderRouteJumps = (results) => displayMultipleResults(results);
window.recalculateRoute = () => { if (lastRouteResults) displayMultipleResults(lastRouteResults); };

// ============================================
// Event Binding & Initialization
// ============================================

function initialize() {
  // Bind search
  bindSearchButton(searchSystems);

  // Bind paste handler
  bindPasteHandler((pasted) => {
    // Placeholder for paste-specific logic if needed
  }, parseSystemInput);

  // Bind keyboard shortcuts
  bindKeyboardShortcuts(searchSystems);

  // Initialize ships
  initializeShips().catch(err => console.warn('Failed to init ships:', err));

  // Bind ship events
  bindShipSelect(handleShipSelection);
  bindSkillSlider(handleSkillChange);
  bindTotalMassInput(handleMassChange);

  // Auto-run player gate resolution on DOMContentLoaded
  try {
    const names = Array.isArray(window.__lastParsedSystemNames) ? window.__lastParsedSystemNames : null;
    if (names && names.length >= 2 && (window.USE_LOCAL_SYSTEM_DATA || window.PLAYER_GATE_API)) {
      loadPlayerGates({ names }).catch(() => {});
      return;
    }
    if (window.PLAYER_GATE_API && Array.isArray(window.__lastParsedSystemIds) && window.__lastParsedSystemIds.length >= 2) {
      loadPlayerGates({}).catch(() => {});
    }
  } catch (e) {
    // Ignore initialization errors
  }
}

// Auto-initialize when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
