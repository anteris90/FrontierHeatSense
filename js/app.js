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
import { fetchSingleSystem, fetchBatchSystems, fetchRoute, createRouteShare, fetchRouteShare, API_BASE, API_BATCH } from './core/api-client.js';

import { selectShip, getSelectedShip, getShips, hasShipSelected, calculateSkillBonus, calculateEffectiveC, getShipParameters, loadShips } from './services/ship-manager.js';
import { loadPlayerGates } from './services/player-gate-resolver.js';

import { displayResult, displayMultipleResults, showError } from './ui/renderer.js';
import { mapRouteJumpsByName } from './ui/route-table.js';
import { bindSearchButton, bindReverseButton, bindShareButton, bindPasteHandler, bindKeyboardShortcuts, bindShipSelect, bindSkillSlider, bindTotalMassInput, updateSearchButton, updateShareButton, setResultsVisible, setErrorVisible, updateStatusMessage } from './ui/event-handlers.js';
import { populateShipSelect, updateShipDisplay, updateEffectiveCDisplay, updateSkillDisplay, resetSkillSlider, hideShipDetails } from './ui/ship-ui.js';

// ============================================
// Global State
// ============================================

let lastRouteResults = null;
let lastRouteJumps = [];
let lastRouteHints = [];
let shareButtonResetTimer = null;

const SHARE_ROUTE_PARAM = 'route';
const SHARE_SHIP_PARAM = 'ship';
const SHARE_MASS_PARAM = 'mass';
const SHARE_SKILL_PARAM = 'skill';
const SHARE_COMPACT_ROUTE_PARAM = 'r';
const SHARE_COMPACT_GATE_PARAM = 'g';
const SHARE_COMPACT_SHIP_PARAM = 's';
const SHARE_COMPACT_MASS_PARAM = 'm';
const SHARE_COMPACT_SKILL_PARAM = 'k';
const SHARE_SHORT_CODE_PARAM = 'x';

function setShareButtonState(enabled, text) {
  if (shareButtonResetTimer) {
    window.clearTimeout(shareButtonResetTimer);
    shareButtonResetTimer = null;
  }

  updateShareButton(enabled, text);
}

function flashShareButton(text) {
  setShareButtonState(true, text);
  shareButtonResetTimer = window.setTimeout(() => {
    updateShareButton(hasShareableRoute());
    shareButtonResetTimer = null;
  }, 1800);
}

function hasShareableRoute() {
  return Array.isArray(lastRouteResults) && lastRouteResults.length > 1 && lastRouteResults.every(result => !result.error);
}

function getShareRouteNames() {
  if (!hasShareableRoute()) {
    return [];
  }

  return lastRouteResults
    .map(result => result?.system?.name || result?.name)
    .filter(Boolean);
}

function getShareRouteHints() {
  if (!Array.isArray(lastRouteHints) || lastRouteHints.length === 0) {
    return [];
  }

  return lastRouteHints
    .filter(hint => hint?.from && hint?.to && Number.isFinite(hint?.jumpCount))
    .map(hint => ({
      from: normalizeSystemName(hint.from),
      to: normalizeSystemName(hint.to),
      jumpCount: Number(hint.jumpCount),
      gate: hint.gate || 'npc'
    }));
}

function encodeShipSelection(ship) {
  if (!ship) {
    return '';
  }

  const shipIndex = getShips().findIndex(candidate => candidate.name === ship.name);
  return shipIndex >= 0 ? shipIndex.toString(36) : ship.name;
}

function decodeShipSelection(value) {
  if (!value) {
    return '';
  }

  if (/^[0-9a-z]+$/i.test(value)) {
    const index = Number.parseInt(value, 36);
    const ship = getShips()[index];
    if (ship) {
      return ship.name;
    }
  }

  return value;
}

function encodeRouteNames(routeNames) {
  return routeNames.join('.');
}

function encodeRouteHints(routeHints) {
  return routeHints
    .filter(hint => hint?.from && hint?.to && Number.isFinite(hint?.jumpCount))
    .map(hint => `${normalizeSystemName(hint.from)}>${normalizeSystemName(hint.to)}:${Math.max(1, Math.round(hint.jumpCount))}`)
    .join(',');
}

function decodeRouteNames(routeValue) {
  if (!routeValue) {
    return [];
  }

  if (routeValue.includes('.')) {
    return routeValue
      .split('.')
      .map(name => normalizeSystemName(name))
      .filter(Boolean);
  }

  return parseSystemInput(routeValue);
}

function decodeRouteHints(routeHintValue) {
  if (!routeHintValue) {
    return [];
  }

  return String(routeHintValue)
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const separatorIndex = entry.indexOf('>');
      const countIndex = entry.lastIndexOf(':');

      if (separatorIndex <= 0 || countIndex <= separatorIndex + 1) {
        return null;
      }

      const from = normalizeSystemName(entry.slice(0, separatorIndex));
      const to = normalizeSystemName(entry.slice(separatorIndex + 1, countIndex));
      const jumpCount = Number.parseInt(entry.slice(countIndex + 1), 10);

      if (!from || !to || !Number.isFinite(jumpCount)) {
        return null;
      }

      return { from, to, jumpCount, gate: 'npc' };
    })
    .filter(Boolean);
}

function buildShareUrl() {
  const routeNames = getShareRouteNames();
  const routeHints = getShareRouteHints();
  if (routeNames.length < 2) {
    return null;
  }

  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  const shareParams = new URLSearchParams();
  shareParams.set(SHARE_COMPACT_ROUTE_PARAM, encodeRouteNames(routeNames));
  if (routeHints.length) {
    shareParams.set(SHARE_COMPACT_GATE_PARAM, encodeRouteHints(routeHints));
  }

  const selectedShip = getSelectedShip();
  if (selectedShip) {
    shareParams.set(SHARE_COMPACT_SHIP_PARAM, encodeShipSelection(selectedShip));

    const shipParams = getShipParameters();
    if (shipParams) {
      const roundedMass = Math.round(shipParams.totalHullMass);
      if (roundedMass !== selectedShip.hullMass) {
        shareParams.set(SHARE_COMPACT_MASS_PARAM, roundedMass.toString(36));
      }

      if (shipParams.skillLevel > 0) {
        shareParams.set(SHARE_COMPACT_SKILL_PARAM, shipParams.skillLevel.toString(36));
      }
    }
  }

  url.hash = shareParams.toString();

  return url.toString();
}

function buildShortShareFallbackPayload() {
  const routeNames = getShareRouteNames();
  if (routeNames.length < 2) {
    return null;
  }

  const selectedShip = getSelectedShip();
  const shipParams = selectedShip ? getShipParameters() : null;
  const routeHints = getShareRouteHints();

  return {
    routeNames,
    routeHints,
    shipName: selectedShip?.name || '',
    totalMass: shipParams?.totalHullMass ?? null,
    skillLevel: shipParams?.skillLevel ?? null
  };
}

async function buildPreferredShareUrl() {
  const payload = buildShortShareFallbackPayload();
  if (!payload) {
    return null;
  }

  try {
    const share = await createRouteShare(payload);
    if (share?.code) {
      const url = new URL(window.location.href);
      url.search = `?${SHARE_SHORT_CODE_PARAM}=${encodeURIComponent(share.code)}`;
      url.hash = '';
      return url.toString();
    }
  } catch (error) {
    console.warn('Short share link unavailable, falling back to compact link:', error);
  }

  return buildShareUrl();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn('Clipboard API copy failed, falling back to execCommand:', error);
    }
  }

  const tempInput = document.createElement('textarea');
  tempInput.value = text;
  tempInput.setAttribute('readonly', 'readonly');
  tempInput.style.position = 'fixed';
  tempInput.style.opacity = '0';
  tempInput.style.pointerEvents = 'none';
  document.body.appendChild(tempInput);
  tempInput.select();
  tempInput.setSelectionRange(0, tempInput.value.length);

  const success = document.execCommand('copy');
  document.body.removeChild(tempInput);

  if (!success) {
    throw new Error('Clipboard unavailable');
  }
}

async function copyRouteLink() {
  const shareUrl = await buildPreferredShareUrl();
  if (!shareUrl) {
    flashShareButton('NO ROUTE');
    updateStatusMessage('Calculate a route with at least two systems before copying a short link.');
    return;
  }

  try {
    await copyTextToClipboard(shareUrl);
    flashShareButton('LINK COPIED');
    updateStatusMessage('Short link copied to clipboard.');
  } catch (error) {
    console.warn('Copy route link failed:', error);
    updateStatusMessage('Unable to copy short link automatically.');
    flashShareButton('COPY FAILED');
  }
}

function getSharedRouteState() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  const shortCode = searchParams.get(SHARE_SHORT_CODE_PARAM) || '';
  const compactRouteValue = hashParams.get(SHARE_COMPACT_ROUTE_PARAM);
  const compactGateValue = hashParams.get(SHARE_COMPACT_GATE_PARAM);
  const legacyRouteValue = searchParams.get(SHARE_ROUTE_PARAM);
  const routeNames = decodeRouteNames(compactRouteValue || legacyRouteValue || '');
  const routeHints = decodeRouteHints(compactGateValue || '');
  const compactShipValue = hashParams.get(SHARE_COMPACT_SHIP_PARAM);
  const legacyShipValue = searchParams.get(SHARE_SHIP_PARAM);
  const compactMassValue = hashParams.get(SHARE_COMPACT_MASS_PARAM);
  const legacyMassValue = searchParams.get(SHARE_MASS_PARAM);
  const compactSkillValue = hashParams.get(SHARE_COMPACT_SKILL_PARAM);
  const legacySkillValue = searchParams.get(SHARE_SKILL_PARAM);

  return {
    shortCode,
    routeNames,
    routeHints,
    shipName: decodeShipSelection(compactShipValue || legacyShipValue || ''),
    totalMass: compactMassValue ? String(Number.parseInt(compactMassValue, 36)) : legacyMassValue,
    skillLevel: compactSkillValue ? String(Number.parseInt(compactSkillValue, 36)) : legacySkillValue
  };
}

async function hydrateSharedRouteFromUrl() {
  let sharedState = getSharedRouteState();

  if (sharedState.shortCode) {
    try {
      const remoteState = await fetchRouteShare(sharedState.shortCode);
      sharedState = {
        shortCode: sharedState.shortCode,
        routeNames: Array.isArray(remoteState?.routeNames) ? remoteState.routeNames : [],
        routeHints: Array.isArray(remoteState?.routeHints) && remoteState.routeHints.length
          ? remoteState.routeHints
          : (Array.isArray(sharedState.routeHints) ? sharedState.routeHints : []),
        shipName: remoteState?.shipName ? String(remoteState.shipName) : '',
        totalMass: remoteState?.totalMass != null ? String(remoteState.totalMass) : null,
        skillLevel: remoteState?.skillLevel != null ? String(remoteState.skillLevel) : null
      };
    } catch (error) {
      console.warn('Failed to resolve short share code:', error);
      updateStatusMessage('Unable to resolve shared short link.');
      return;
    }
  }

  if (sharedState.routeNames.length === 0) {
    return;
  }

  const inputEl = document.getElementById('systemInput');
  if (inputEl) {
    inputEl.value = sharedState.routeNames.join(', ');
  }

  window.__systemInputRouteHints = Array.isArray(sharedState.routeHints)
    ? sharedState.routeHints.slice()
    : [];
  lastRouteHints = Array.isArray(sharedState.routeHints)
    ? sharedState.routeHints.slice()
    : [];
  window.lastRouteHints = lastRouteHints;

  if (sharedState.shipName) {
    const shipSelect = document.getElementById('shipSelect');
    if (shipSelect) {
      shipSelect.value = sharedState.shipName;
    }
    handleShipSelection(sharedState.shipName);

    const totalMassInput = document.getElementById('totalHullMass');
    if (totalMassInput && sharedState.totalMass != null && sharedState.totalMass !== '') {
      totalMassInput.value = sharedState.totalMass;
    }

    const parsedSkillLevel = Number(sharedState.skillLevel);
    const skillSlider = document.getElementById('skillSlider');
    if (skillSlider && Number.isFinite(parsedSkillLevel)) {
      skillSlider.value = String(parsedSkillLevel);
      handleSkillChange(parsedSkillLevel);
    }
  }

  await searchSystems();
}

function buildRouteSummary(routeJumps, totalDistanceLY) {
  const summary = {
    totalDistanceLY: Number.isFinite(totalDistanceLY) ? totalDistanceLY : null,
    totalJumpDistanceLY: null
  };

  if (!Array.isArray(routeJumps) || routeJumps.length === 0) {
    return summary;
  }

  summary.totalJumpDistanceLY = routeJumps.reduce((sum, jump) => {
    if (jump?.ui_gate || jump?.gate) {
      return sum;
    }

    const distanceLY = Number.isFinite(jump?.distance_ly)
      ? jump.distance_ly
      : (Number.isFinite(jump?.distanceLY) ? jump.distanceLY : null);

    return distanceLY != null ? sum + distanceLY : sum;
  }, 0);

  return summary;
}

// Expose for backward compatibility and debugging
window.lastRouteResults = lastRouteResults;
window.lastRouteJumps = lastRouteJumps;
window.lastRouteHints = lastRouteHints;

function cloneRouteJumpEntries(routeJumps) {
  return Array.isArray(routeJumps) ? routeJumps.map(jump => (jump ? { ...jump } : jump)) : [];
}

function reverseRouteHints(routeHints) {
  if (!Array.isArray(routeHints)) return [];

  return routeHints.map(hint => ({
    ...hint,
    from: hint.to,
    to: hint.from
  }));
}

function consumeRouteHints(systemNames) {
  const inputRouteHints = Array.isArray(window.__systemInputRouteHints) ? window.__systemInputRouteHints : [];
  const parsedHints = Array.isArray(window.__lastParsedRouteHints) ? window.__lastParsedRouteHints : [];
  const pendingHints = Array.isArray(window.__pendingRouteHints) ? window.__pendingRouteHints : [];
  const routeHints = inputRouteHints.length
    ? inputRouteHints
    : (parsedHints.length ? parsedHints : pendingHints);

  window.__pendingRouteHints = [];

  if (!Array.isArray(systemNames) || systemNames.length < 2 || !routeHints.length) return [];

  const systemSet = new Set(systemNames.map(name => normalizeSystemName(name)));
  return routeHints.filter(hint => systemSet.has(normalizeSystemName(hint.from)) && systemSet.has(normalizeSystemName(hint.to)));
}

function applyRouteHints(routeResp, routeHints) {
  const route = cloneRouteJumpEntries(routeResp?.route);
  if (!route.length || !Array.isArray(routeHints) || routeHints.length === 0) {
    return {
      route,
      totalDistanceLY: routeResp?.total_distance_ly ?? null
    };
  }

  const hintMap = new Map(
    routeHints.map(hint => [`${normalizeSystemName(hint.from)}=>${normalizeSystemName(hint.to)}`, hint])
  );

  let totalDistanceLY = Number.isFinite(routeResp?.total_distance_ly)
    ? Number(routeResp.total_distance_ly)
    : null;

  for (let index = 1; index < route.length; index++) {
    const previousEntry = route[index - 1];
    const currentEntry = route[index];
    if (!previousEntry?.name || !currentEntry?.name) continue;

    const hintKey = `${normalizeSystemName(previousEntry.name)}=>${normalizeSystemName(currentEntry.name)}`;
    const hint = hintMap.get(hintKey);
    if (!hint) continue;

    if (totalDistanceLY != null && Number.isFinite(currentEntry.distance_ly)) {
      totalDistanceLY = Math.max(0, totalDistanceLY - Number(currentEntry.distance_ly));
    }

    currentEntry.distance_label = 'GATE';
    currentEntry.ui_gate = 'npc';
    currentEntry.hidden_jump_count = hint.jumpCount;
    currentEntry.route_hint = 'npc_gate_span';
  }

  return { route, totalDistanceLY };
}

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
  setShareButtonState(false);

  if (!input) {
    showError('Please enter at least one system name');
    return;
  }

  const systemNames = parseSystemInput(input);
  lastRouteHints = consumeRouteHints(systemNames);
  window.lastRouteHints = lastRouteHints;
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

        if (!s || s.error) {
          results.push({ name, error: s?.error || 'System not found' });
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
      setShareButtonState(false);
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
        const hintedRoute = applyRouteHints(routeResp, lastRouteHints);
        routeJumps = hintedRoute.route;
        routeResp = { ...routeResp, route: routeJumps, total_distance_ly: hintedRoute.totalDistanceLY };
      }

      lastRouteResults = results;
      lastRouteJumps = routeJumps;
      window.lastRouteResults = results;
      window.lastRouteJumps = routeJumps;
      displayMultipleResults(
        results,
        routeJumps,
        hasShipSelected(),
        buildRouteSummary(routeJumps, routeResp?.total_distance_ly)
      );
      setShareButtonState(hasShareableRoute());
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
 * Reverse route order and recalculate
 * Takes current input, reverses system order, updates input field, and searches
 */
function reverseRoute() {
  const inputEl = document.getElementById('systemInput');
  if (!inputEl) return;
  
  const currentInput = inputEl.value.trim();
  if (!currentInput) return;
  
  // Parse current systems
  const systemNames = parseSystemInput(currentInput);
  if (systemNames.length <= 1) return; // Nothing to reverse

  const reversedHints = reverseRouteHints(lastRouteHints);
  window.__pendingRouteHints = reversedHints;
  window.__systemInputRouteHints = reversedHints;
  lastRouteHints = reversedHints;
  window.lastRouteHints = lastRouteHints;
  
  // Reverse the order
  const reversedNames = systemNames.reverse();
  
  // Update the input field with reversed systems
  inputEl.value = reversedNames.join(', ');
  
  // Trigger search with reversed route
  searchSystems().catch(err => console.warn('Reverse route search failed:', err));
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
    const hintedRoute = applyRouteHints(routeResp, lastRouteHints);
    lastRouteJumps = hintedRoute.route;
    window.lastRouteJumps = lastRouteJumps;
    displayMultipleResults(
      lastRouteResults,
      lastRouteJumps,
      hasShipSelected(),
      buildRouteSummary(lastRouteJumps, hintedRoute.totalDistanceLY)
    );
    setShareButtonState(hasShareableRoute());
  } catch (err) {
    console.warn('Recalculate route failed:', err);
  }
}

window.recalculateRoute = recalculateRoute;

// ============================================
// Event Binding & Initialization
// ============================================

async function initialize() {
  // Enable local system data for development
  window.USE_LOCAL_SYSTEM_DATA = true;

  // Bind search
  bindSearchButton(searchSystems);
  
  // Bind reverse route button
  bindReverseButton(reverseRoute);
  bindShareButton(() => {
    copyRouteLink().catch(err => console.warn('Copy route link failed:', err));
  });
  setShareButtonState(false);

  // Bind paste handler
  bindPasteHandler((pasted) => {
    // Placeholder for paste-specific logic if needed
  }, parseSystemInput);

  // Bind keyboard shortcuts
  bindKeyboardShortcuts(searchSystems);

  // Initialize ships
  await initializeShips();

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

  await hydrateSharedRouteFromUrl();
}

// Auto-initialize when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize().catch(err => console.warn('Initialization failed:', err));
  });
} else {
  initialize().catch(err => console.warn('Initialization failed:', err));
}
