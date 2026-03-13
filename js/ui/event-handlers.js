/**
 * ui/event-handlers.js
 * 
 * UI event binding and handling.
 * 
 * Responsibilities:
 * - Search button click
 * - System input textarea events (paste, keydown)
 * - Ship selection changes
 * - Skill level slider changes
 */

/**
 * Bind search button click handler
 * 
 * @param {function} onSearch - Callback to execute on search
 * @returns {boolean} Success
 */
function bindSearchButton(onSearch) {
  const btnEl = document.getElementById('searchBtn');
  if (!btnEl) return false;
  
  btnEl.removeEventListener('click', onSearch);
  btnEl.addEventListener('click', onSearch);
  return true;
}

/**
 * Bind reverse route button click handler
 * 
 * @param {function} onReverse - Callback to execute on reverse
 * @returns {boolean} Success
 */
function bindReverseButton(onReverse) {
  const btnEl = document.getElementById('reverseBtn');
  if (!btnEl) return false;
  
  btnEl.removeEventListener('click', onReverse);
  btnEl.addEventListener('click', onReverse);
  return true;
}

/**
 * Bind share button click handler
 *
 * @param {function} onShare - Callback to execute on share
 * @returns {boolean} Success
 */
function bindShareButton(onShare) {
  const btnEl = document.getElementById('shareBtn');
  if (!btnEl) return false;

  btnEl.removeEventListener('click', onShare);
  btnEl.addEventListener('click', onShare);
  return true;
}

/**
 * Bind paste handler for system input
 * Handles: plain text, HTML anchors (EF-Map format), mixed
 * 
 * @param {function} onPaste - Callback (pasted array) => void
 * @param {function} parseInput - System input parser
 */
function bindPasteHandler(onPaste, parseInput) {
  const textarea = document.getElementById('systemInput');
  if (!textarea) return;

  function mergeRouteHints(...hintGroups) {
    const merged = [];
    const seen = new Set();

    for (const group of hintGroups) {
      if (!Array.isArray(group)) continue;
      for (const hint of group) {
        if (!hint?.from || !hint?.to) continue;
        const key = `${String(hint.from).toUpperCase()}=>${String(hint.to).toUpperCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ ...hint });
      }
    }

    return merged;
  }

  textarea.addEventListener('paste', function(e) {
    e.preventDefault();
    
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const existingPendingHints = Array.isArray(window.__pendingRouteHints) ? window.__pendingRouteHints : [];
    const pasted = parseInput(text);
    const pastedRouteHints = Array.isArray(window.__lastParsedRouteHints) ? window.__lastParsedRouteHints.slice() : [];

    // Trigger player gate resolution if available
    try {
      if (window.loadPlayerGates && (window.USE_LOCAL_SYSTEM_DATA || window.PLAYER_GATE_API)) {
        const parsed = pasted && Array.isArray(pasted) ? pasted.map(s => String(s)) : [];
        if (parsed.length >= 2) {
          window.loadPlayerGates({ names: parsed }).catch(() => {});
        }
      }
    } catch (e) {}

    // Merge with existing systems
    const current = parseInput(this.value || '');
    const currentRouteHints = Array.isArray(window.__lastParsedRouteHints) ? window.__lastParsedRouteHints.slice() : [];
    const merged = current.slice();
    window.__pendingRouteHints = mergeRouteHints(existingPendingHints, currentRouteHints, pastedRouteHints);
    window.__systemInputRouteHints = window.__pendingRouteHints.slice();
    
    for (const s of pasted) {
      if (!merged.includes(s)) merged.push(s);
    }

    // If nothing parsed, fall back to appending raw text
    if (merged.length === 0 && text.trim()) {
      const fallback = (this.value || '').trim();
      this.value = fallback ? `${fallback}, ${text.trim()}` : text.trim();
    } else {
      this.value = merged.join(', ');
    }

    // Move cursor to end
    this.selectionStart = this.selectionEnd = this.value.length;

    // Call paste callback
    if (onPaste) onPaste(pasted);
  });
}

/**
 * Bind Ctrl+Enter (or Cmd+Enter) to search
 * 
 * @param {function} onSearch - Search callback
 */
function bindKeyboardShortcuts(onSearch) {
  const textarea = document.getElementById('systemInput');
  if (!textarea) return;

  textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (onSearch) onSearch();
    }
  });
}

/**
 * Bind ship selection dropdown
 * 
 * @param {function} onShipSelected - Callback (shipName) => void
 */
function bindShipSelect(onShipSelected) {
  const shipSelect = document.getElementById('shipSelect');
  if (!shipSelect) return;

  shipSelect.addEventListener('change', function() {
    if (onShipSelected) onShipSelected(this.value);
  });
}

/**
 * Bind skill slider changes
 * 
 * @param {function} onSkillChanged - Callback (skillLevel) => void
 */
function bindSkillSlider(onSkillChanged) {
  const slider = document.getElementById('skillSlider');
  if (!slider) return;

  slider.addEventListener('input', function() {
    if (onSkillChanged) onSkillChanged(Number(this.value));
  });
}

/**
 * Bind total hull mass input changes
 * 
 * @param {function} onMassChanged - Callback (totalMass) => void
 */
function bindTotalMassInput(onMassChanged) {
  const input = document.getElementById('totalHullMass');
  if (!input) return;

  input.addEventListener('input', function() {
    if (onMassChanged) onMassChanged(Number(this.value));
  });
}

/**
 * Update search button state
 * 
 * @param {boolean} loading - Whether currently loading
 * @param {string} text - Button text
 */
function updateSearchButton(loading, text) {
  const btnEl = document.getElementById('searchBtn');
  if (!btnEl) return;
  
  btnEl.disabled = loading;
  btnEl.textContent = text || 'CHECK HEAT';
}

/**
 * Update share button state
 *
 * @param {boolean} enabled - Whether the button should be enabled
 * @param {string} text - Optional button text override
 */
function updateShareButton(enabled, text) {
  const btnEl = document.getElementById('shareBtn');
  if (!btnEl) return;

  btnEl.disabled = !enabled;
  btnEl.textContent = text || 'SHARE ROUTE';
}

/**
 * Update result visibility
 * 
 * @param {boolean} visible - Show or hide
 */
function setResultsVisible(visible) {
  const resultDiv = document.getElementById('result');
  if (resultDiv) resultDiv.style.display = visible ? 'block' : 'none';
}

/**
 * Update error visibility
 * 
 * @param {boolean} visible - Show or hide
 */
function setErrorVisible(visible) {
  const errorDiv = document.getElementById('error');
  if (errorDiv) errorDiv.style.display = visible ? 'block' : 'none';
}

/**
 * Update status message
 * 
 * @param {string} message - Status text
 */
function updateStatusMessage(message) {
  const srStatus = document.getElementById('srStatus');
  if (srStatus) srStatus.textContent = message;
}

export {
  bindSearchButton,
  bindReverseButton,
  bindShareButton,
  bindPasteHandler,
  bindKeyboardShortcuts,
  bindShipSelect,
  bindSkillSlider,
  bindTotalMassInput,
  updateSearchButton,
  updateShareButton,
  setResultsVisible,
  setErrorVisible,
  updateStatusMessage
};
