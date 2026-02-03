/**
 * Frontier HeatSense - Main Application Script
 *
 * This script handles all the client-side logic for the HeatSense web application,
 * including system heat calculations, route analysis, ship selection, and UI interactions.
 *
 * Architecture:
 * - Event-driven UI updates
 * - Modular functions for specific responsibilities
 * - Async API calls with error handling
 * - Progressive enhancement (works without ship data)
 *
 * Key modules:
 * - System lookup and normalization
 * - Route parsing and display
 * - Jump heat calculations
 * - Ship selection and configuration
 * - Accessibility features (paste handling, keyboard shortcuts)
 *
 * Dependencies:
 * - ships.json for ship data
 * - External API for system heat data
 *
 * @author HeatSense Team
 * @version 2.0
 */

let lastRouteResults = null;
// Read app version from meta tag and expose in footer
try {
  const meta = document.querySelector('meta[name="app-version"]');
  const v = (meta && meta.content) ? meta.content : 'v0.0.0';
  const el = document.getElementById('appVersion');
  if (el) el.textContent = v;
} catch (e) {
  // ignore in non-browser environments
}
/* ==========================================
  Configuration / Constants
  - `API_BASE` can be overridden from console for local/dev testing
  - `METERS_PER_LY` is used to convert API coordinates (meters) → light-years
  ========================================== */
// API base can be overridden in dev console: `window.HEATSENSE_API = 'https://...'`
const API_BASE = window.HEATSENSE_API || 'https://systems-test.heatsense.workers.dev';
const API_SINGLE = `${API_BASE}/api/system`;
const API_BATCH = `${API_BASE}/api/systems`;

// meters per light-year constant (shared reference for frontend)
const METERS_PER_LY = 9.4607e15;

/**
 * Normalize system name for stable lookup and display.
 * - Unicode-normalizes, strips diacritics
 * - replaces various dash characters with ASCII hyphen
 * - collapses whitespace and uppercases
 */
function normalizeSystemName(name) {
  if (!name) return '';
  // decompose diacritics
  let s = String(name).normalize('NFKD');
  // remove combining diacritics
  s = s.replace(/\p{M}/gu, '');
  // normalize different dash characters to ASCII hyphen
  s = s.replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-');
  // remove HTML-ish garbage, keep letters, numbers, hyphen
  s = s.replace(/[^\p{L}\p{N}\-\s]/gu, ' ');
  // collapse whitespace, trim, uppercase
  s = s.replace(/\s+/g, ' ').trim().toUpperCase();
  // tighten spaces around hyphen
  s = s.replace(/\s*-\s*/g, '-');
  return s;
}

/* ---------- UI: Event bindings ---------- */
// Primary action: run lookup / route analysis
document.getElementById('searchBtn').addEventListener('click', searchSystems);

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

  btn.disabled = true;
  btn.textContent = 'Checking...';
  resultDiv.innerHTML = `<div class="loading">🔍 Checking ${systemNames.length} system(s)...</div>`;
  resultDiv.style.display = 'block';
  srStatus.textContent = `Checking ${systemNames.length} system(s).`;

  // Main try/catch wraps network + rendering logic so UI state is restored
  try {
    let results = [];
    let model = 'arctangent-v1.0'; // Fallback

    if (systemNames.length > 1) {
      // Batch request for multiple systems: POST names and rehydrate
      const response = await fetch(API_BATCH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: systemNames })
      });

      if (!response.ok) {
        throw new Error(`Batch error: ${response.status}`);
      }

      const data = await response.json();
      // NOTE: API may return systems in arbitrary order. We'll map by
      // normalized name and reconstruct the route in the input order.
      // data.systems → map by normalized name (API order not guaranteed)
      const systemMap = new Map();

      for (const s of data.systems) {
        systemMap.set(normalizeSystemName(s.name), s);
      }

      // populate outer `results` (avoid shadowing the variable)
      results = [];

      // 🔑 Process in the input order
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

        results.push({ name: s.name, system: normalizedSystem, model: data.model || model });
      }
    } else {
      // Single system fallback — query the single-name endpoint
      const name = systemNames[0];
      const nameForApi = normalizeSystemName(name);
      const url = `${API_SINGLE}?name=${encodeURIComponent(nameForApi)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Single error: ${response.status}`);
      }

      const data = await response.json();

      // API may return an `error` field for missing records
      if (data.error) {
        results.push({ name, error: data.error });
      } else {
        const s = data.system;
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

        results.push({ name, system: normalizedSystem, model: data.model || model });
      }
    }

    if (results.length === 1 && !results[0].error) {
      displayResult(results[0].system, results[0].model);
    } else {
      lastRouteResults = results;
      displayMultipleResults(results);
    }
    srStatus.textContent = `Results ready for ${results.length} system(s).`;
  } catch (error) {
    // Keep console message for serious failures only
    console.error('Search error:', error);
    showError(error.message);
    srStatus.textContent = `Error: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check Heat';
  }
}

function parseSystemInput(input) {
  let text = input;

  const temp = document.createElement('div');
  temp.innerHTML = text;
  text = temp.textContent || temp.innerText || text;

  // 1️⃣ Drop obvious route summary lines (e.g. "FROM → TO") so they
  //    don't become parsed system names. Also remove common noise like
  //    parentheses, HTML, Gate annotations and numeric measurements.
  text = text
    .split('\n')
    .filter(line =>
      !/^[A-Z0-9]{2,5}-[A-Z0-9]{2,5}\s*→\s*[A-Z0-9]{2,5}-[A-Z0-9]{2,5}$/i
        .test(line.trim())
    )
    .join('\n')
    .replace(/→/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\*/g, ' ')
    .replace(/Gate:|SmartGate:|Jump:/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\d]+\.[\d]+/g, ' ')
    .replace(/\s+/g, ' ');

  // 2️⃣ Normalize text and extract systems IN ORDER (preserve first occurrence)
  //    This step decomposes Unicode, strips diacritics and normalizes dash
  //    characters so the regex reliably matches EVE-style system names.
  text = text.normalize('NFKD').replace(/\p{M}/gu, '');
  text = text.replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-');

  const regex = /\b[A-Z0-9]{2,4}-[A-Z0-9]{2,4}\b/gi;
  const matches = text.match(regex);

  const systems = [];

  if (matches) {
    for (const m of matches) {
      const name = normalizeSystemName(m);
      if (!systems.includes(name)) {
        systems.push(name);
      }
    }
  }

  return systems;
}

function displayResult(system, model) {
  const resultDiv = document.getElementById('result');
  const isTrap = system.coldest_point.heat >= 85 || system.status === 'CRITICAL';

  const statusConfig = {
    'SAFE': { class: 'status-safe', emoji: '✅', label: 'Safe' },
    'MODERATE': { class: 'status-moderate', emoji: '⚠️', label: 'Moderate' },
    'DANGEROUS': { class: 'status-dangerous', emoji: '🔥', label: 'Dangerous' },
    'CRITICAL': { class: 'status-critical', emoji: '☠️', label: 'Critical' }
  };

  const config = statusConfig[system.status] || statusConfig['SAFE'];

  let trapWarningHTML = '';
  if (isTrap) {
    trapWarningHTML = `
      <div class="trap-warning">
        <div class="trap-title">⚠️ IT'S A TRAP?! ⚠️</div>
        <div class="trap-message">
          Even at the coldest accessible point (${system.coldest_point.distance_au.toFixed(2)} AU), 
          this system has dangerously high heat (${system.coldest_point.heat.toFixed(1)})!<br>
          <strong>WARNING:</strong> You may not be able to escape if your ship overheats.
        </div>
      </div>
    `;
  }

  resultDiv.innerHTML = `
    <div class="system-name">${system.name}</div>
    
    <div class="heat-display">
      <div class="heat-value">${system.coldest_point.heat.toFixed(1)}</div>
      <div class="heat-label">Heat Units at Coldest Point</div>
    </div>
    
    <div class="status-badge ${config.class}">
      ${config.emoji} ${config.label}
    </div>
    
    ${trapWarningHTML}
    
    <div class="details">
      <div class="detail-row">
        <span class="detail-label">Star Type:</span>
        <span class="detail-value">${system.star_class} (${system.temperature}K)</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Star Radius:</span>
        <span class="detail-value">${(system.radius_km / 1000000).toFixed(1)} M km</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Coldest Point:</span>
        <span class="detail-value">${system.coldest_point.distance_au.toFixed(2)} AU (${system.coldest_point.distance_ls.toFixed(0)} LS)</span>
      </div>
    </div>
    
    <div class="info-box">
      Read more: <a href="https://thoughtfolio.xyz/All+to+Avoid+Heat+Traps%2C+Exponential+Heat-Signature+Decay+Model" target="_blank" rel="noreferrer" style="color:#6cf">Ergod's Research Paper</a>
    </div>
  `;
  
  resultDiv.style.display = 'block';
  resultDiv.focus();
}

/**
 * Renders route jump analysis table
 * @param {Array} routeJumps
 * @returns {string} HTML
 */
function renderRouteJumps(routeJumps) {
  if (!routeJumps || !routeJumps.length) return '';

  let html = `
    <h2 style="margin-top:30px">Route Jump Analysis</h2>
    <table class="route-table">
      <thead>
        <tr>
          <th>Jump</th>
          <th>Distance (LY)</th>
          <th>Low Heat</th>
          <th>Jump Heat</th>
          <th>Post‑Jump Heat</th>
          <th>Status</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const j of routeJumps) {
    let status = 'OK';
    let color = '#aaffaa';

  if (j.canJump === null) {
    status = 'N/A';
    color = '#888';
} 
  else if (j.totalAfterJump >= 149) {
    status = 'FAIL';
    color = '#ff5555';
} 
  else if (j.warning) {
    status = 'WARN';
    color = '#ffaa66';
}

    html += `
      <tr>
        <td><strong>${j.from}</strong> → ${j.to}</td>
        <td>${j.distanceLY.toFixed(2)}</td>
        <td>${j.lowHeat.toFixed(1)}</td>
        <td>${j.jumpHeat == null ? 'N/A' : j.jumpHeat.toFixed(2)}</td>
        <td style="color:${color};font-weight:bold">
          ${j.totalAfterJump == null ? 'N/A' : j.totalAfterJump.toFixed(2)}
        </td>
        <td style="color:${color};font-weight:bold">
          ${status}
        </td>
        <td style="font-size:0.9em;color:#ccc">
          ${j.reason || '-'}
        </td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  `;

  return html;
}

async function displayMultipleResults(results) {
  // Check if ship is selected
  const hasShipData = selectedShip !== null;

  const statusIcon = {
    SAFE: '✅',
    MODERATE: '⚠️',
    DANGEROUS: '🔥',
    CRITICAL: '☠️'
  };

  // --- systems list (in input order) ---
  const systems = results
    .filter(r => !r.error)
    .map(r => r.system);

  // --- route jump calculation (only when ship data is explicitly provided) ---
  let routeJumps = [];

  // Request authoritative route data from the worker (includes gate detection)
  try {
    const namesForApi = systems.map(s => normalizeSystemName(s.name));

    const body = { names: namesForApi };
    // Try to auto-resolve player gates in the frontend if a World API is provided
    // Use window.PLAYER_GATE_API (set in page or by deploy) to allow client-side resolution.
    async function resolvePlayerGatesClient(names) {
      const base = window.PLAYER_GATE_API && String(window.PLAYER_GATE_API).replace(/\/$/, '');
      if (!base) throw new Error('No PLAYER_GATE_API configured for client-side resolution');

      // limit systems to avoid excessive client work
      const MAX_CLIENT_SYSTEMS = 50;
      if (names.length > MAX_CLIENT_SYSTEMS) throw new Error('Too many systems for client-side player gate resolution');

      // 1) fetch system IDs via batch endpoint
      const res = await fetch(API_BATCH, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names })
      });
      if (!res.ok) throw new Error('Failed to fetch system IDs');
      const data = await res.json();
      const ids = (data.systems || []).map(s => s.id).filter(Boolean).map(String);
      if (!ids.length) throw new Error('No system IDs found');

      // helper to fetch JSON with retries (simple)
      async function fetchJson(url) {
        for (let i = 0; i < 3; i++) {
          try {
            const r = await fetch(url, { method: 'GET' });
            if (!r.ok) continue;
            return await r.json();
          } catch (e) {
            await new Promise(r => setTimeout(r, 200 * Math.pow(2, i)));
            continue;
          }
        }
        return null;
      }

      // 2) fetch systems -> collect smartAssemblies
      const originByGate = Object.create(null);
      const gateIds = [];
      for (const sid of ids) {
        const sys = await fetchJson(`${base}/v2/solarsystems/${sid}?format=json`);
        if (!sys) continue;
        const originId = String(sys.id || sid);
        const assemblies = Array.isArray(sys.smartAssemblies) ? sys.smartAssemblies : [];
        for (const asm of assemblies) {
          if (!asm || String(asm.type).toLowerCase() !== 'smartgate') continue;
          const gid = String(asm.id);
          if (!gid) continue;
          originByGate[gid] = originByGate[gid] || [];
          if (originByGate[gid].indexOf(originId) === -1) originByGate[gid].push(originId);
          gateIds.push(gid);
        }
      }

      const uniqueGateIds = Array.from(new Set(gateIds));
      const tmp = Object.create(null);

      // 3) resolve each gate assembly to destination system id
      for (const gid of uniqueGateIds) {
        const asm = await fetchJson(`${base}/v2/smartassemblies/${encodeURIComponent(gid)}?format=json`);
        if (!asm || !asm.gate) continue;
        let destSystemId = null;
        if (Array.isArray(asm.gate.inRange) && asm.gate.inRange.length) {
          const r = asm.gate.inRange[0];
          destSystemId = (r && r.solarSystem && r.solarSystem.id) ? r.solarSystem.id : (r && r.solarSystemId) ? r.solarSystemId : null;
        }
        if (!destSystemId && asm.gate.destinationId) {
          const destAsm = await fetchJson(`${base}/v2/smartassemblies/${encodeURIComponent(String(asm.gate.destinationId))}?format=json`);
          if (destAsm && destAsm.gate && Array.isArray(destAsm.gate.inRange) && destAsm.gate.inRange.length) {
            const rr = destAsm.gate.inRange[0];
            destSystemId = (rr && rr.solarSystem && rr.solarSystem.id) ? rr.solarSystem.id : (rr && rr.solarSystemId) ? rr.solarSystemId : null;
          }
        }
        if (!destSystemId) continue;
        const origins = originByGate[gid] || [];
        for (const o of origins) {
          const a = String(o);
          const b = String(destSystemId);
          tmp[a] = tmp[a] || [];
          if (tmp[a].indexOf(b) === -1) tmp[a].push(b);
          tmp[b] = tmp[b] || [];
          if (tmp[b].indexOf(a) === -1) tmp[b].push(a);
        }
      }

      return tmp;
    }

    // Attempt client-side resolution if configured; otherwise instruct backend to resolve
    let resolvedPlayerGates = null;
    if (window.PLAYER_GATE_API) {
      try {
        srStatus.textContent = 'Resolving player gates (client)...';
        resolvedPlayerGates = await resolvePlayerGatesClient(namesForApi);
        srStatus.textContent = 'Player gates resolved (client).';
      } catch (err) {
        console.warn('Client-side player gate resolution failed:', err && err.message);
        srStatus.textContent = 'Client-side player gate resolution failed; falling back to server.';
        resolvedPlayerGates = null;
      }
    }

    if (resolvedPlayerGates && Object.keys(resolvedPlayerGates).length) {
      body.playerGates = resolvedPlayerGates;
    } else {
      // Ask server to resolve player gates as a fallback
      body.resolvePlayerGates = true;
    }
    if (hasShipData) {
      body.totalMass = Number(totalHullMassInput.value) || selectedShip.hullMass;
      body.hullMass = selectedShip.hullMass;
      body.baseC = selectedShip.baseC;
      body.skillLevel = Number(skillSlider.value) || 0;
    }

    // include player gates if provided globally (window.PLAYER_GATES) as JSON-friendly structure
    if (window.PLAYER_GATES) body.playerGates = window.PLAYER_GATES;

    const resp = await fetch(`${API_BASE}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      if (Array.isArray(data.route)) {
        // Map server route entries by normalized name (entry.name → jump info for that system)
        const serverMap = new Map();
        for (const e of data.route) {
          serverMap.set(normalizeSystemName(String(e.name)), e);
        }

        // Build routeJumps entries between consecutive systems
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
            jumpHeat: hasShipData && serverEntry.jump_heat_gen != null ? Number(serverEntry.jump_heat_gen) : null,
            totalAfterJump: hasShipData && serverEntry.total_after_jump != null ? Number(serverEntry.total_after_jump) : null,
            warning: from.coldest_point.heat > 90,
            canJump: hasShipData && serverEntry.can_jump != null ? Boolean(serverEntry.can_jump) : null,
            gate: serverEntry.gate || null
          });
        }
      }
    } else {
      const err = await resp.json().catch(() => null);
      showError(err && err.error ? err.error : `Route request failed: ${resp.status}`);
      routeJumps = [];
    }
  } catch (err) {
    // fallback to local calculation if server request fails
    if (hasShipData) routeJumps = calculateRouteJumps(systems);
  }

  const jumpMap = mapRouteJumpsBySystem(routeJumps);

// --- meta ---
const resultDiv = document.getElementById('result');
const successCount = results.filter(r => !r.error).length;
const trapCount = results.filter(
    r => !r.error && r.system?.coldest_point?.heat >= 85
  ).length;

  // --- HTML header ---
  let html = `
    ${
      !hasShipData
        ? `<div class="input-hint" style="margin:6px 0 10px">
             💡 Tip: Select a ship to evaluate jump feasibility.
           </div>`
        : ''
    }

    <p style="text-align:center;margin:15px 0;font-size:1.1em;color:#ffaa77">
      ${successCount} / ${results.length} systems found
      ${trapCount > 0
        ? ` | <span style="color:#ff6666">⚠️ ${trapCount} TRAP(s) detected!</span>`
        : ''}
    </p>

    <table class="route-table">
      <thead>
        <tr>
          <th>System</th>
          <th>Distance (LY)</th>
          <th>Heat</th>
          <th>Jump Heat</th>
          <th>Total After</th>
          <th>Jump</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
  `;

  // --- rows ---
  for (const result of results) {
    // default labels for jump/status columns — used for both error and success rows
    let jumpStatus = 'N/A';
    let jumpColor = '#888';

    if (result.error) {
      // system not found — still show placeholder jump info when ship data exists
      const jump = jumpMap[result.name];

      html += `
        <tr>
          <td data-label="System">${result.name}</td>
          <td data-label="Star" style="color:#ff6666">❌ ${result.error}</td>
          <td data-label="Heat">—</td>
          <td data-label="Distance (LY)">${jump?.distanceLY != null ? jump.distanceLY.toFixed(2) : '—'}</td>
          <td data-label="Jump Heat">${hasShipData ? (jump?.jumpHeat != null ? jump.jumpHeat.toFixed(2) : '—') : 'N/A'}</td>
          <td data-label="Total After">${hasShipData ? (jump?.totalAfterJump != null ? jump.totalAfterJump.toFixed(2) : '—') : 'N/A'}</td>
          <td data-label="Jump" style="font-weight:bold;color:${jumpColor}">
            ${hasShipData ? jumpStatus : 'N/A'}
          </td>
          <td data-label="Status" style="color:#ff6666">ERROR</td>
        </tr>
      `;
      continue;
    }

    // Normal system row
    const sys = result.system;
    const jump = jumpMap[sys.name];
    const isTrap = sys.coldest_point.heat >= 85 || sys.status === 'CRITICAL';
    const statusEmoji = statusIcon[sys.status] || 'ℹ️';

    if (jump && jump.canJump !== null) {
      if (isTrap) {
        // TRAP systems always show as WARN
        jumpStatus = 'WARN';
        jumpColor = '#ffaa66';
      } else if (jump.totalAfterJump >= 149) {
        // Total after jump >= 149 is FAIL
        jumpStatus = 'FAIL';
        jumpColor = '#FF6B6B';
      } else if (jump.canJump) {
        jumpStatus = 'OK';
        jumpColor = '#7CFF7C';
      } else {
        jumpStatus = 'FAIL';
        jumpColor = '#FF6B6B';
      }
    }

    // If this jump is a gate (npc/player), override display values
    const isGateJump = !!(jump && jump.gate);
    if (isGateJump) {
      jumpStatus = (jump.gate === 'npc') ? 'GATE (NPC)' : 'GATE (PLAYER)';
      jumpColor = '#66CCFF';
    }

    // Show a warning for player gates (may be offline / owner-controlled)
    let gateWarningHtml = '';
    if (isGateJump && jump && jump.gate === 'player') {
      gateWarningHtml = ' <span title="Player gate — availability may vary (owner-controlled)" style="color:#ffcc00">⚠️</span>';
    }

    html += `
      <tr>
        <td data-label="System"><strong>${sys.name}</strong></td>

        <td data-label="Distance (LY)">${isGateJump ? 'GATE' : (jump?.distanceLY != null ? jump.distanceLY.toFixed(2) : '—')}</td>

        <td data-label="Heat" class="heat-cell" style="color:${
          sys.coldest_point.heat >= 70
            ? '#ff6666'
            : sys.coldest_point.heat >= 30
              ? '#ffaa66'
              : '#aaffaa'
        }">
          ${sys.coldest_point.heat.toFixed(1)}
        </td>
        <td data-label="Jump Heat">${!hasShipData ? 'N/A' : (isGateJump ? 'N/A' : (jump?.jumpHeat != null ? jump.jumpHeat.toFixed(2) : 'N/A'))}</td>
        <td data-label="Total After">${!hasShipData ? 'N/A' : (isGateJump ? (jump?.lowHeat != null ? jump.lowHeat.toFixed(2) : 'N/A') : (jump?.totalAfterJump != null ? jump.totalAfterJump.toFixed(2) : 'N/A'))}</td>

        <td data-label="Jump" style="font-weight:bold;color:${jumpColor}">
          ${jumpStatus}${gateWarningHtml}
        </td>

        <td data-label="Status">
          ${isTrap ? '<span class="trap-indicator trap-yes">⚠️ TRAP!</span>' : `${statusEmoji} ${sys.status}`}
        </td>
      </tr>
    `;
  }

  html += `</tbody></table>`;

  resultDiv.innerHTML = html;
  resultDiv.style.display = 'block';
  resultDiv.focus();
}



function showError(message) {
  const errorDiv = document.getElementById('error');
  const resultDiv = document.getElementById('result');
  resultDiv.style.display = 'none';
  errorDiv.innerHTML = `<strong>❌ Error:</strong> ${message}<br><small>Make sure the system name is correct. Try exact names like "O3H-1FN".</small>`;
  errorDiv.style.display = 'block';
  errorDiv.focus();
}

// paste handler + auto clean
document.getElementById('systemInput').addEventListener('paste', function(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  const pasted = parseSystemInput(text);
  // existing systems in the textarea
  const current = parseSystemInput(this.value || '');
  // Merge while preserving order and avoiding duplicates
  const merged = current.slice();
  for (const s of pasted) {
    if (!merged.includes(s)) merged.push(s);
  }
  // If nothing parsed from pasted text, fall back to appending raw text
  if (merged.length === 0 && text.trim()) {
    // try to append raw trimmed text separated by comma
    const fallback = (this.value || '').trim();
    this.value = fallback ? `${fallback}, ${text.trim()}` : text.trim();
  } else {
    this.value = merged.join(', ');
  }
  // move cursor to end
  this.selectionStart = this.selectionEnd = this.value.length;
  // Auto-run the search after paste so user workflow is: paste -> check
  try {
    // small delay so textarea value updates propagate
    setTimeout(() => { if (typeof searchSystems === 'function') searchSystems(); }, 60);
  } catch (e) {
    // ignore if searchSystems not available in context
  }
});

// Ctrl+Enter support
document.getElementById('systemInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    searchSystems();
  }
});

// === SHIP MODULE ===
// Compact ship selector for jump calculations

const shipSelect = document.getElementById('shipSelect');
const shipDetails = document.getElementById('shipDetails');
const shipBaseStats = document.getElementById('shipBaseStats');
const hullMassDisplay = document.getElementById('hullMassDisplay');
const baseCDisplay = document.getElementById('baseCDisplay');
const totalHullMassInput = document.getElementById('totalHullMass');
const skillSlider = document.getElementById('skillSlider');
const skillValue = document.getElementById('skillValue');
const skillBonus = document.getElementById('skillBonus');

let SHIPS = [];
let selectedShip = null;

// Load ships from CSV
fetch('./db/ships.json')
  .then(r => r.json())
  .then(data => {
    SHIPS = Array.isArray(data) ? data : [];
    populateShips();
  });

// Populate ship dropdown
function populateShips() {
  SHIPS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = s.name;
    shipSelect.appendChild(opt);
  });
}

// Update effective C value based on skill level
function updateEffectiveC() {
  if (!selectedShip) return;
  
  const skill = Number(skillSlider.value);
  const bonus = skill * 2;
  const effectiveC = selectedShip.baseC * (1 + skill * 0.02);
  
  skillValue.textContent = skill;
  skillBonus.textContent = bonus;
  baseCDisplay.textContent = effectiveC.toFixed(3);
}

// Handle ship selection
shipSelect.addEventListener('change', () => {
  const shipName = shipSelect.value;
  selectedShip = shipName ? SHIPS.find(s => s.name === shipName) : null;

  if (selectedShip) {
    // Show ship details
    shipDetails.style.display = 'block';
    shipBaseStats.style.display = 'grid';
    hullMassDisplay.textContent = selectedShip.hullMass.toLocaleString();
    baseCDisplay.textContent = selectedShip.baseC.toFixed(3);
    totalHullMassInput.value = selectedShip.hullMass;
    
    // Reset skill to 0 when selecting a new ship
    skillSlider.value = 0;
    updateEffectiveC();
  } else {
    // Hide ship details
    shipDetails.style.display = 'none';
  }

  // Recalculate route jumps if route exists
  if (lastRouteResults) {
    displayMultipleResults(lastRouteResults);
  }
});

// Handle skill slider changes
skillSlider.addEventListener('input', () => {
  updateEffectiveC();
  
  // Recalculate route jumps if route exists
  if (lastRouteResults) {
    displayMultipleResults(lastRouteResults);
  }
});

// Handle total hull mass changes
totalHullMassInput.addEventListener('input', () => {
  // Recalculate route jumps if route exists
  if (lastRouteResults) {
    displayMultipleResults(lastRouteResults);
  }
});


/**
 * Calculates jump heat and jump feasibility between two systems
 *
 * @param {number} lowHeat        - coldest heat of the starting system
 * @param {number} distanceLY     - distance in light-years
 * @param {number} totalHullMass  - effective ship mass (with cargo etc.)
 * @param {number} hullMass       - base hull mass of the ship
 * @param {number} C              - ship C value (after skill bonus)
 *
 * @returns {object}
 */
function calculateJumpHeat({
  lowHeat,
  distanceLY,
  totalHullMass,
  hullMass,
  C
}) {
  const jumpHeat =
    (3 * totalHullMass * distanceLY) /
    (C * hullMass);

  const totalAfterJump = lowHeat + jumpHeat;

  const warning = lowHeat > 90;
  const canJump = totalAfterJump < 149;

  return {
    jumpHeat,
    totalAfterJump,
    warning,
    canJump
  };
}

/**
 * Calculates distance in light-years between two systems
 * based on their 3D coordinates
 *
 * @param {Object} a - source system (with coords.x/y/z)
 * @param {Object} b - target system (with coords.x/y/z)
 * @returns {number} distance in LY
 */
function calculateDistanceLY(a, b) {
  if (!a?.coords || !b?.coords) return 0;

  const dx = a.coords.x - b.coords.x;
  const dy = a.coords.y - b.coords.y;
  const dz = a.coords.z - b.coords.z;

  const distanceMeters = Math.sqrt(dx*dx + dy*dy + dz*dz);

  // convert meters -> light-years
  return distanceMeters / METERS_PER_LY;
}

/**
 * Calculates jump-by-jump heat data for a route
 * @param {Array} systems - array of system objects in route order
 * @returns {Array}
 */
function calculateRouteJumps(systems) {
  const results = [];

  // Check if ship is selected
  const hasShipData = selectedShip !== null;

  // Use ship values with skill bonus and cargo
  const hullMass = hasShipData ? selectedShip.hullMass : 0;
  const totalHullMass = hasShipData ? Number(totalHullMassInput.value) || selectedShip.hullMass : 0;
  const skill = hasShipData ? Number(skillSlider.value) : 0;
  const C = hasShipData ? selectedShip.baseC * (1 + skill * 0.02) : 0;

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
        totalHullMass,
        hullMass,
        C
      });
    }

    results.push({
      from: from.name,
      to: to.name,
      distanceLY,
      lowHeat: from.coldest_point.heat,
      ...jump
    });

    // if (hasShipData && jump.canJump === false) break;
  }

  return results;
}

function mapRouteJumpsBySystem(routeJumps) {
  const map = {};
  routeJumps.forEach(j => {
    map[j.from] = j;
  });
  return map;
}