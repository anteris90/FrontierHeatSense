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
 * @param {number} totalDistanceLY - Total route distance in light years
 * @returns {string} HTML table
 */
function renderRouteTable(results, routeJumps, hasShipData, totalDistanceLY) {
  const statusIcon = {
    SAFE: '✅',
    MODERATE: '⚠️',
    DANGEROUS: '🔥',
    CRITICAL: '☠️'
  };

  const jumpMap = mapRouteJumpsByName(routeJumps);
  const jumpByName = new Map();
  if (Array.isArray(routeJumps)) {
    for (const jump of routeJumps) {
      if (jump && jump.name) {
        jumpByName.set(String(jump.name).toUpperCase(), jump);
      }
    }
  }
  const successCount = results.filter(r => !r.error).length;
  const trapCount = results.filter(r => {
    if (r.error) return false;
    const heat = r.system?.coldest_point?.heat;
    if (heat == null || heat < 85) return false;
    const jump = jumpByName.get(String(r.name || '').toUpperCase());
    if (jump && String(jump.gate).toLowerCase() === 'npc') return false;
    return true;
  }).length;

  const actualJumpDistance = Array.isArray(routeJumps)
    ? routeJumps.reduce((sum, jump) => {
        if (!jump || jump.distance_ly == null) return sum;
        if (jump.gate) return sum;
        return sum + Number(jump.distance_ly);
      }, 0)
    : 0;

  const failedJumpCount = Array.isArray(routeJumps)
    ? routeJumps.reduce((count, jump) => {
        if (!jump) return count;
        if (jump.gate) return count;
        if (jump.can_jump === false || (jump.total_after_jump != null && jump.total_after_jump >= 149)) {
          return count + 1;
        }
        return count;
      }, 0)
    : 0;

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
      ${totalDistanceLY != null
        ? ` | <span style="color:#ffaa77">📏 Total Distance: ${totalDistanceLY.toFixed(2)} LY</span>`
        : ''}
      ${actualJumpDistance > 0
        ? ` | <span style="color:#ffcc88">🚀 Jump Distance: ${actualJumpDistance.toFixed(2)} LY</span>`
        : ''}
      ${failedJumpCount != null
        ? ` | <span style="color:#ff7777">❌ Failed Jumps: ${failedJumpCount}</span>`
        : ''}
    </p>

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

  for (const result of results) {
    let jumpStatus = '—';
    let jumpColor = '#888';
    
    // Check for detour or excluded flags
    const isExcluded = result._excluded === true;
    const isDetour = result._detour === true;

    if (result.error) {
      // System not found
      const jump = jumpMap[result.name];
      html += `
        <tr${isExcluded ? ' class="excluded-system"' : ''}>
          <td data-label="System"${isExcluded ? ' style="text-decoration:line-through;opacity:0.6"' : ''}>${result.name}</td>
          <td data-label="Star" style="color:#ff6666">❌ ${result.error}</td>
          <td data-label="Heat">—</td>
          <td data-label="Distance (LY)">${jump?.distance_ly != null ? jump.distance_ly.toFixed(2) : '—'}</td>
          <td data-label="Jump Heat">${hasShipData ? (jump?.jump_heat_gen != null ? jump.jump_heat_gen.toFixed(2) : '—') : '—'}</td>
          <td data-label="Post‑Jump Heat">${hasShipData ? (jump?.total_after_jump != null ? jump.total_after_jump.toFixed(2) : '—') : '—'}</td>
          <td data-label="Jump" style="font-weight:bold;color:${jumpColor}">
            ${hasShipData ? jumpStatus : '—'}
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
    
    // Row styling for detours and excluded systems
    const rowClass = isExcluded ? 'excluded-system' : (isDetour ? 'detour-system' : '');
    const nameStyle = isExcluded ? 'text-decoration:line-through;opacity:0.6;' : '';
    const namePrefix = isDetour ? '🔀 ' : '';
    const detourLabel = isDetour ? ' <span style="color:#ffaa00;font-size:0.85em">(DETOUR)</span>' : '';

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
    const isGateJump = !!(jump && (String(jump.gate).toLowerCase() === 'npc' || String(jump.gate).toLowerCase() === 'player'));
    if (isGateJump) {
      jumpStatus = (jump.gate === 'npc') ? 'GATE (NPC)' : 'GATE (SMART)';
      jumpColor = '#66CCFF';
    }

    const suppressTrap = isGateJump && jump && String(jump.gate).toLowerCase() === 'npc';

    // Warning for smart gates
    let gateWarningHtml = '';
    if (isGateJump && jump && jump.gate === 'player') {
      gateWarningHtml = ' <span title="Smart gate — availability may vary (owner-controlled)" style="color:#ffcc00">⚠️</span>';
    }
    html += `
      <tr${rowClass ? ` class="${rowClass}"` : ''}>
        <td data-label="System" style="${nameStyle}"><strong>${namePrefix}${sys.name || 'Unknown'}${detourLabel}</strong></td>

        <td data-label="Distance (LY)">${jump?.distance_ly != null ? jump.distance_ly.toFixed(2) : '—'}</td>

        <td data-label="Heat" class="heat-cell" style="color:${
          (sys.coldest_point?.heat >= 70) ? '#ff6666' : (sys.coldest_point?.heat >= 50) ? '#ffaa66' : '#7CFF7C'
        }">${sys.coldest_point?.heat?.toFixed(1) || '—'}</td>
        <td data-label="Jump Heat">${!hasShipData ? '—' : ((jump && jump.gate) ? '—' : (jump?.jump_heat_gen != null ? jump.jump_heat_gen.toFixed(2) : '—'))}</td>
        <td data-label="Post‑Jump Heat">${!hasShipData ? '—' : ((jump && jump.gate) ? '—' : (jump?.total_after_jump != null ? jump.total_after_jump.toFixed(2) : '—'))}</td>

        <td data-label="Jump" style="font-weight:bold;color:${jumpColor}">
          ${hasShipData ? (jumpStatus + gateWarningHtml) : '—'}
        </td>

        <td data-label="Status">
          ${suppressTrap ? `${statusEmoji} ${sys.status}` : (isTrap ? '<span class="trap-indicator trap-yes">⚠️ TRAP!</span>' : `${statusEmoji} ${sys.status}`)}
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
