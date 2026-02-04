/**
 * fetch-retry.js
 * 
 * Reusable fetch utility with exponential backoff and jitter.
 * Handles transient failures (network errors, 5xx, 429) with retry logic.
 * 
 * Used by: player-gate resolver, batch system lookups
 */

/**
 * Fetch with exponential backoff and jitter
 * Retries on network errors, 429 (rate limit), and 5xx status codes
 * 
 * @param {string} url - URL to fetch
 * @param {object} opts - Fetch options (method, headers, body, etc.)
 * @param {number} retries - Max retry attempts (default 3)
 * @param {number} baseBackoff - Base backoff in ms (default 200)
 * @param {number} maxBackoff - Max backoff in ms (default 5000)
 * @returns {Response|null} Fetch response or null on auth failures (4xx)
 */
async function fetchWithRetry(url, opts = {}, retries = 3, baseBackoff = 200, maxBackoff = 5000) {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, opts);
      
      // Retry on 429 or 5xx
      if (res && (res.status === 429 || (res.status >= 500 && res.status < 600))) {
        if (attempt >= retries) return res;
        const backoff = Math.min(maxBackoff, baseBackoff * Math.pow(2, attempt));
        const jitter = backoff * (0.5 + Math.random() * 0.5);
        await new Promise(r => setTimeout(r, Math.round(jitter)));
        attempt++;
        continue;
      }
      
      return res;
    } catch (err) {
      // Network error — retry
      if (attempt >= retries) throw err;
      const backoff = Math.min(maxBackoff, baseBackoff * Math.pow(2, attempt));
      const jitter = backoff * (0.5 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, Math.round(jitter)));
      attempt++;
      continue;
    }
  }
}

export { fetchWithRetry };
