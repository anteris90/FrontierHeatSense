/**
 * core/normalization.js
 * 
 * System name parsing and normalization utilities.
 * 
 * Responsibilities:
 * - Parse textarea input (plain text, HTML anchors, mixed)
 * - Normalize system names (diacritics, dash characters, whitespace)
 * - Handle EVE Frontier Map anchors (showinfo format with numeric IDs)
 * - Deduplicate while preserving order
 * - Extract system IDs from anchor href attributes
 */

/**
 * Normalize system name for stable lookup and display
 * - Unicode-normalizes, strips diacritics
 * - Replaces various dash characters with ASCII hyphen
 * - Collapses whitespace and uppercases
 * 
 * Examples:
 * "emh-k56" → "EMH-K56"
 * "IS0-B36" → "IS0-B36"
 * "O3H‑1FN" (Unicode dash) → "O3H-1FN"
 * 
 * @param {string} name - System name to normalize
 * @returns {string} Normalized uppercase system name
 */
function normalizeSystemName(name) {
  if (!name) return '';
  
  // Decompose diacritics
  let s = String(name).normalize('NFKD');
  
  // Remove combining diacritics
  s = s.replace(/\p{M}/gu, '');
  
  // Normalize different dash characters to ASCII hyphen
  s = s.replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-');
  
  // Remove HTML-ish garbage, keep letters, numbers, hyphen
  s = s.replace(/[^\p{L}\p{N}\-\s]/gu, ' ');
  
  // Collapse whitespace, trim, uppercase
  s = s.replace(/\s+/g, ' ').trim().toUpperCase();
  
  // Tighten spaces around hyphen
  s = s.replace(/\s*-\s*/g, '-');
  
  return s;
}

/**
 * Parse system input from textarea
 * Supports: plain names, HTML anchors (EF-Map format), mixed
 * 
 * Input formats:
 * - "EMH-K56" or "emh-k56" → extracted
 * - "<a href='showinfo:5//30004078'>EMH-K56</a>" → extracted with ID
 * - "EMH-K56, IS0-B36" → extracted as multiple
 * - Mixture of above
 * 
 * Returns normalized names, preserving order, deduplicating
 * Also exposes parsed IDs globally for downstream use:
 * - window.__lastParsedSystemNames
 * - window.__lastParsedSystemIds
 * 
 * @param {string} input - Textarea input (plain text or HTML)
 * @returns {array} Normalized system names in order, deduplicated
 */
function parseSystemInput(input) {
  // Parse input as HTML to handle EF-Map anchors
  const temp = document.createElement('div');
  temp.innerHTML = input || '';

  const nameRegex = /\b[A-Z0-9]{2,4}-[A-Z0-9]{2,4}\b/gi;
  const results = [];

  /**
   * Push normalized names from text string
   * @param {string} text - Text to search for system names
   * @param {string|null} id - Optional numeric system ID
   */
  function pushNameRaw(text, id = null) {
    if (!text) return;
    const matches = String(text).match(nameRegex);
    if (!matches) return;
    for (const m of matches) {
      results.push({ name: normalizeSystemName(m), id: id ? String(id) : null });
    }
  }

  /**
   * Walk DOM tree preserving order of anchors vs plain text
   */
  function walk(node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        // Plain text node
        pushNameRaw(child.textContent, null);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'A') {
        // Anchor element (EF-Map showinfo format)
        const inner = child.textContent || '';
        const href = child.getAttribute('href') || '';
        
        // Extract numeric system ID from href (e.g., showinfo:5//30004088)
        const idMatch = href.match(/(\d{6,9})/);
        const id = idMatch ? idMatch[1] : null;
        
        // Parse anchor text for system names
        const innerMatches = inner.match(nameRegex);
        if (innerMatches) {
          for (const m of innerMatches) {
            results.push({ name: normalizeSystemName(m), id: id ? String(id) : null });
          }
        } else {
          // Fallback: search any name-like token in anchor
          pushNameRaw(inner, id);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // Recurse into other elements
        walk(child);
      }
    }
  }

  walk(temp);

  // If no HTML structure detected, try parsing as plain text
  if (results.length === 0) {
    pushNameRaw(input, null);
  }

  // Deduplicate while preserving order
  const systems = [];
  const ids = [];
  for (const r of results) {
    if (!systems.includes(r.name)) {
      systems.push(r.name);
      ids.push(r.id || null);
    }
  }

  // Expose globally for downstream use
  window.__lastParsedSystemIds = ids;
  window.__lastParsedSystemNames = systems.slice();

  return systems;
}

export { normalizeSystemName, parseSystemInput };
