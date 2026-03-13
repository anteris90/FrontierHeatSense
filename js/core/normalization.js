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
  
  // Remove HTML-ish garbage, keep letters, numbers, hyphen, pipe, colon, dot
  s = s.replace(/[^\p{L}\p{N}\-\s:|\\.]/gu, ' ');
  
  // Collapse whitespace, trim, uppercase
  s = s.replace(/\s+/g, ' ').trim().toUpperCase();
  
  // Convert spaces to pipes when they appear to be separators between short system name parts
  s = s.replace(/(\b[A-Z0-9]{2,4})\s([A-Z0-9]{2,4}\b)/g, (match, p1, p2) => p1 + '|' + p2);
  
  // Tighten spaces around separators (hyphen, pipe, colon, dot)
  s = s.replace(/\s*([-:|\\.])\s*/g, (match, sep) => sep);
  
  return s;
}

const SYSTEM_NAME_PATTERN = '[A-Z0-9]+(?:[-:.|][A-Z0-9]+)+';

/**
 * Extract anonymous NPC gate spans from copied route text.
 * Example: "IV3-BDJ (2)→ IMC-9KJ"
 *
 * @param {string} input - Raw textarea input
 * @returns {array} [{ from, to, jumpCount, gate: 'npc' }]
 */
function extractNpcGateRouteHints(input) {
  if (!input) return [];

  const normalizedText = String(input)
    .replace(/<[^>]*>/g, ' ')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-');

  const hintRegex = new RegExp(
    `\\b(${SYSTEM_NAME_PATTERN})\\b\\s*\\((\\d+)\\)\\s*(?:→|->|&rarr;|&#8594;)\\s*\\b(${SYSTEM_NAME_PATTERN})\\b`,
    'gi'
  );

  const hints = [];
  const seen = new Set();
  let match;

  while ((match = hintRegex.exec(normalizedText)) !== null) {
    const from = normalizeSystemName(match[1]);
    const to = normalizeSystemName(match[3]);
    const jumpCount = Number.parseInt(match[2], 10);
    const key = `${from}=>${to}`;

    if (!from || !to || !Number.isFinite(jumpCount) || seen.has(key)) continue;

    seen.add(key);
    hints.push({ from, to, jumpCount, gate: 'npc' });
  }

  return hints;
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
 * - window.__lastParsedRouteHints
 * 
 * @param {string} input - Textarea input (plain text or HTML)
 * @returns {array} Normalized system names in order, deduplicated
 */
function parseSystemInput(input) {
  // Parse input as HTML to handle EF-Map anchors
  const temp = document.createElement('div');
  temp.innerHTML = input || '';

  const nameRegex = new RegExp(`\\b${SYSTEM_NAME_PATTERN}\\b`, 'gi');
  const results = [];
  const routeHints = extractNpcGateRouteHints(input);

  /**
   * Push normalized names from text string
   * @param {string} text - Text to search for system names
   * @param {string|null} id - Optional numeric system ID
   */
  function pushNameRaw(text, id = null) {
    if (!text) return;
    
    // Skip text that looks like route descriptions (contains arrows or route indicators)
    if (text.includes('→') || text.includes('Gate:') || text.includes('Jump:')) return;
    
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
  window.__lastParsedRouteHints = routeHints;

  return systems;
}

export { normalizeSystemName, parseSystemInput, extractNpcGateRouteHints };
