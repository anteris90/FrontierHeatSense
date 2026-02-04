/**
 * ui/renderer.js
 * 
 * Render results to DOM.
 * Handles both single system views and route analysis tables.
 * 
 * Responsibilities:
 * - Single system display
 * - Multiple systems route table
 * - Error messages
 * - Jump analysis table
 * - Player gate indicators
 */

/**
 * Display single system details
 * 
 * @param {object} system - System data
 * @param {string} model - Model version string
 */
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
 * Display error message
 * 
 * @param {string} message - Error message
 */
function showError(message) {
  const errorDiv = document.getElementById('error');
  const resultDiv = document.getElementById('result');
  
  resultDiv.style.display = 'none';
  errorDiv.innerHTML = `<strong>❌ Error:</strong> ${message}<br><small>Make sure the system name is correct. Try exact names like "O3H-1FN".</small>`;
  errorDiv.style.display = 'block';
  errorDiv.focus();
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export { displayResult, showError, escapeHtml };
