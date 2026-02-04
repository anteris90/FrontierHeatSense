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
import { calculateDistanceLY, calculateRouteJumps } from './core/calculations.js';
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
let lastRouteJumps = [];

// Expose for backward compatibility and debugging
window.lastRouteResults = lastRouteResults;
window.lastRouteJumps = lastRouteJumps;

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
      // Calculate route for multiple systems
      let routeJumps = [];
      let routeResp = null;
      if (results.length > 1) {
        // Load player gates for route calculation
        await loadPlayerGates({ names: results.map(r => r.name) });
        
        const body = {
          names: results.map(r => r.name)
          // Let server resolve player gates dynamically
          // playerGates: window.PLAYER_GATES || null
        };
        
        // Add ship data if selected
        if (hasShipSelected()) {
          const shipParams = getShipParameters();
          if (shipParams) {
            body.totalMass = shipParams.totalHullMass;
            body.hullMass = shipParams.hullMass;
            body.baseC = shipParams.baseC;
            body.skillLevel = shipParams.skillLevel;
          }
        }
        
        routeResp = await fetchRoute(body);
        routeJumps = routeResp.route || [];
      }

      lastRouteResults = results;
      lastRouteJumps = routeJumps;
      window.lastRouteResults = results;
      window.lastRouteJumps = routeJumps;
      displayMultipleResults(results, routeJumps, hasShipSelected(), routeResp?.total_distance_ly || null);
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
async function displayMultipleResults(results, routeJumps, hasShipData, totalDistanceLY) {
  const resultDiv = document.getElementById('result');
  const srStatus = document.getElementById('srStatus');

  const statusIcon = {
    SAFE: '✅',
    MODERATE: '⚠️',
    DANGEROUS: '🔥',
    CRITICAL: '☠️'
  };

  const systems = results.filter(r => !r.error).map(r => r.system);

  // Render route table
  const html = renderRouteTable(results, routeJumps, hasShipData, totalDistanceLY);
  resultDiv.innerHTML = html;
  resultDiv.style.display = 'block';

  // Update status
  const validCount = systems.length;
  if (validCount > 1) {
    srStatus.textContent = `Route: ${validCount} systems, ${routeJumps.length} jumps`;
  } else {
    srStatus.textContent = `${validCount} system(s) found`;
  }

  updatePlayerGateIndicator();
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

  // Trigger full refresh if we have existing results
  if (lastRouteResults && lastRouteResults.length > 1) {
    searchSystems().catch(err => console.warn('Ship selection refresh failed:', err));
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
    recalculateRoute();
  }
}

function handleMassChange() {
  // Recalculate route if exists
  if (lastRouteResults) {
    recalculateRoute();
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
window.renderRouteJumps = () => {
  // Disabled - let recalculateRoute handle the full update
  // This prevents race conditions when ship is selected
};
// Recalculate route with current ship selection
async function recalculateRoute() {
  if (!lastRouteResults || lastRouteResults.length <= 1) return;

  // Load player gates for route calculation
  await loadPlayerGates({ names: lastRouteResults.map(r => r.name) });

  const body = {
    names: lastRouteResults.map(r => r.name),
    playerGates: window.PLAYER_GATES || null
  };

  // Add ship data if selected
  if (hasShipSelected()) {
    const shipParams = getShipParameters();
    if (shipParams) {
      body.totalMass = shipParams.totalHullMass;
      body.hullMass = shipParams.hullMass;
      body.baseC = shipParams.baseC;
      body.skillLevel = shipParams.skillLevel;
    }
  }

  try {
    const routeResp = await fetchRoute(body);
    lastRouteJumps = routeResp.route || [];
    window.lastRouteJumps = lastRouteJumps;
    displayMultipleResults(lastRouteResults, lastRouteJumps, hasShipSelected(), routeResp.total_distance_ly);
  } catch (err) {
    console.warn('Recalculate route failed:', err);
  }
}

window.recalculateRoute = recalculateRoute;

// ============================================
// Event Binding & Initialization
// ============================================

function initialize() {
  // Enable local system data for development
  window.USE_LOCAL_SYSTEM_DATA = true;

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
