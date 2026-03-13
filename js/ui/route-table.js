/**
 * ui/route-table.js
 * 
 * Render route analysis and jump tables.
 * 
 * Responsibilities:
 * - Route overview with trap detection
 * - Per-jump analysis with heat calculations
 * - Gate detection highlighting
 * - Feasibility indicators
 */

/**
 * Render route table with multiple systems
 * Shows system heat, jump feasibility, gate detection, trap warnings
 * 
 * @param {array} results - Search results with system data
 * @param {array} routeJumps - Jump analysis from server
 * @param {boolean} hasShipData - Whether ship is selected
 * @param {object} routeSummary - Route summary metrics for the header
 * @returns {string} HTML table
 */
function renderRouteTable(results, routeJumps, hasShipData, routeSummary = {}) {
  const statusIcon = {
    SAFE: '✅',
    MODERATE: '⚠️',
    DANGEROUS: '🔥',
    CRITICAL: '☠️'
  };

  const totalDistanceLY = Number.isFinite(routeSummary.totalDistanceLY)
    ? routeSummary.totalDistanceLY
    : null;
  const totalJumpDistanceLY = Number.isFinite(routeSummary.totalJumpDistanceLY)
    ? routeSummary.totalJumpDistanceLY
    : null;

  const jumpMap = mapRouteJumpsByName(routeJumps);
  const successCount = results.filter(r => !r.error).length;
  const lookupWarningCount = results.length - successCount;
  const trapCount = results.filter(
    r => !r.error && r.system?.coldest_point?.heat >= 85
  ).length;
  const trapSummary = trapCount > 0
    ? `⚠️ ${trapCount} TRAP(s) detected`
    : 'CLEAR';
  const warningSummary = lookupWarningCount > 0
    ? ` | ${lookupWarningCount} lookup warning(s)`
    : '';
  const travelSummary = [];

  if (totalDistanceLY != null) {
    travelSummary.push(`📏 ${totalDistanceLY.toFixed(2)} LY total`);
  }
  if (totalJumpDistanceLY != null) {
    travelSummary.push(`⛭ ${totalJumpDistanceLY.toFixed(2)} LY jump`);
  }

  let html = `
    ${
      !hasShipData
        ? `<div class="input-hint" style="margin:6px 0 10px">
             💡 Tip: Select a ship to enable Jump Heat, Post‑Jump Heat, and jump feasibility calculations.
           </div>`
        : ''
    }

    <div class="route-summary" aria-label="Route summary">
      <div class="route-summary-row">
        <span class="route-summary-label">INIT_SYSTEMS</span>
        <span class="route-summary-value">${successCount} / ${results.length} systems found</span>
      </div>
      <div class="route-summary-row">
        <span class="route-summary-label">INIT_ERRORS</span>
        <span class="route-summary-value ${trapCount > 0 ? 'route-summary-alert' : 'route-summary-clear'}">${trapSummary}${warningSummary}</span>
      </div>
      <div class="route-summary-row">
        <span class="route-summary-label">INIT_TRAVEL</span>
        <span class="route-summary-value route-summary-travel">${travelSummary.length > 0 ? travelSummary.join(' | ') : 'Travel data unavailable'}</span>
      </div>
    </div>

    <table class="route-table">
      <thead>
        <tr>
          <th>System</th>
          <th>Distance (LY)</th>
          <th>Heat</th>
          <th>Jump Heat</th>
          <th>Post‑Jump Heat</th>
          <th>Jump</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
  `;

  function formatDistanceCell(jump) {
    if (!jump) return '—';
    if (jump.distance_label) {
      return Number.isFinite(jump.hidden_jump_count)
        ? `${jump.distance_label} (${jump.hidden_jump_count})`
        : jump.distance_label;
    }
    if (jump.distance_ly != null) return jump.distance_ly.toFixed(2);
    return '—';
  }

  for (const result of results) {
    let jumpStatus = '—';
    let jumpColor = '#888';

    if (result.error) {
      // System not found
      const jump = jumpMap[result.name];
      html += `
        <tr>
          <td data-label="System">${result.name}</td>
          <td data-label="Star" style="color:#ff6666">❌ ${result.error}</td>
          <td data-label="Heat">—</td>
          <td data-label="Distance (LY)">${formatDistanceCell(jump)}</td>
          <td data-label="Jump Heat">${hasShipData ? (jump?.jump_heat_gen != null ? jump.jump_heat_gen.toFixed(2) : '—') : '-'}</td>
          <td data-label="Post‑Jump Heat">${hasShipData ? (jump?.total_after_jump != null ? jump.total_after_jump.toFixed(2) : '—') : '-'}</td>
          <td data-label="Jump" style="font-weight:bold;color:${jumpColor}">
            ${hasShipData ? jumpStatus : '-'}
          </td>
          <td data-label="Status" style="color:#ff6666">ERROR</td>
        </tr>
      `;
      continue;
    }

    // Normal system row
    const sys = result.system;
    if (!sys) continue; // Safety check
    
    const jump = jumpMap[sys.name];
    const isTrap = (sys.coldest_point?.heat >= 85) || sys.status === 'CRITICAL';
    const statusEmoji = statusIcon[sys.status] || 'ℹ️';
    const jumpGateType = jump?.ui_gate || jump?.gate || null;

    // Determine jump status
    if (jump && jump.can_jump !== null) {
      if (isTrap) {
        jumpStatus = 'WARN';
        jumpColor = '#ffaa66';
      } else if (jump.total_after_jump >= 149) {
        jumpStatus = 'FAIL';
        jumpColor = '#FF6B6B';
      } else if (jump.can_jump) {
        jumpStatus = 'OK';
        jumpColor = '#7CFF7C';
      } else {
        jumpStatus = 'FAIL';
        jumpColor = '#FF6B6B';
      }
    }

    // Check if gate jump
    const isGateJump = jumpGateType === 'npc' || jumpGateType === 'player';
    if (isGateJump) {
      jumpStatus = (jumpGateType === 'npc') ? 'GATE (NPC)' : 'GATE (SMART)';
      jumpColor = '#66CCFF';
    }

    // Warning for smart gates
    let gateWarningHtml = '';
    if (isGateJump && jumpGateType === 'player') {
      gateWarningHtml = ' <span title="Smart gate — availability may vary (owner-controlled)" style="color:#ffcc00">⚠️</span>';
    }

    html += `
      <tr>
        <td data-label="System"><strong>${sys.name || 'Unknown'}</strong></td>

        <td data-label="Distance (LY)">${formatDistanceCell(jump)}</td>

        <td data-label="Heat" class="heat-cell" style="color:${
          (sys.coldest_point?.heat >= 70) ? '#ff6666' : (sys.coldest_point?.heat >= 50) ? '#ffaa66' : '#7CFF7C'
        }">${sys.coldest_point?.heat?.toFixed(1) || '—'}</td>
        <td data-label="Jump Heat">${!hasShipData ? '-' : (isGateJump ? '—' : (jump?.jump_heat_gen != null ? jump.jump_heat_gen.toFixed(2) : '—'))}</td>
        <td data-label="Post‑Jump Heat">${!hasShipData ? '-' : (isGateJump ? '—' : (jump?.total_after_jump != null ? jump.total_after_jump.toFixed(2) : '—'))}</td>

        <td data-label="Jump" style="font-weight:bold;color:${jumpColor}">
          ${hasShipData ? (jumpStatus + gateWarningHtml) : '-'}
        </td>

        <td data-label="Status">
          ${isTrap ? '<span class="trap-indicator trap-yes">⚠️ TRAP!</span>' : `${statusEmoji} ${sys.status}`}
        </td>
      </tr>
    `;
  }

  html += `</tbody></table>`;
  return html;
}

/**
 * Map route jumps by target system name for quick lookup
 * @param {array} routeJumps - Jump entries
 * @returns {object} Lookup map
 */
function mapRouteJumpsByName(routeJumps) {
  const map = {};
  if (Array.isArray(routeJumps)) {
    // Create departure-based mapping: map[systemName] = jump data for leaving that system
    for (let i = 0; i < routeJumps.length - 1; i++) {
      const currentSystem = routeJumps[i];
      const nextJump = routeJumps[i + 1];
      if (currentSystem && currentSystem.name && nextJump) {
        map[currentSystem.name] = nextJump;
      }
    }
  }
  return map;
}

export { renderRouteTable, mapRouteJumpsByName };
