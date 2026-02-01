# HeatSense Change Request – 06

You are a senior frontend engineer doing a surgical change.
Follow these rules exactly:
1. Only modify the parts explicitly mentioned in the change request.
2. Do NOT reformat, re-indent, or clean up unrelated code.
3. Do NOT remove comments.
4. Do NOT change class names, IDs, variable names, or string literals.
5. Produce ONLY a unified diff (-u) showing old → new lines.
6. If you are unsure about any implication — write a comment // RISK: ... and leave original code unchanged.

## 1. Request Type
Optimization

## 2. Goal
Enable short-term caching of API responses (/api/system and /api/systems) so repeated searches for the same system names (e.g. same route pasted multiple times) are served from cache for ~5 minutes.  
This reduces load on the Worker and makes the UI feel snappier for users checking the same route again.

Target behavior:
- Fresh request → full computation + response
- Repeat identical request within 5 min → fast cached response (HTTP 200 from cache)
- After 5 min → graceful revalidation if possible, but prioritize simplicity

## 3. Requirements

### Backend (Cloudflare Worker script)
- Endpoints affected: both /api/system (GET) and /api/systems (POST)
- Where to add: At the very end of the handler function, right before returning the Response object.
  Look for lines like:
  return new Response(JSON.stringify({...}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  or similar final return statements.
- Logic changes:
  1. Set Cache-Control header on the final response:
     Cache-Control: public, max-age=300
     → Tells browsers and intermediate caches (including Cloudflare edge) to cache for 300 seconds (5 min).
  2. Optional but recommended: also set s-maxage=300 (for edge cache only)
     → Cache-Control: public, max-age=300, s-maxage=300
  3. Do NOT use stale-while-revalidate=30 here — Cloudflare does NOT reliably support it when using Cache API (cache.put/match) or in many Worker setups as of Feb 2026. It is often ignored or behaves inconsistently.
  4. If the Worker already uses caches.default.put(...) or caches.default.match(...):
     - Keep existing cache logic
     - Add the Cache-Control header to the response BEFORE putting it in cache
     - Example:
       const response = new Response(body, init);
       response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
       // If using Cache API:
       const cloned = response.clone();
       await caches.default.put(request, cloned);
       return response;
  5. Ensure compression remains enabled (Cloudflare usually auto-adds br/gzip if Accept-Encoding is present — no action needed unless you strip headers).
- Performance constraints:
  - Do not cache errors (status >= 400) → only apply header for 200 OK responses
  - Do not cache if request has unique params (but since systems are deterministic by name, it's safe)
  - Keep added code to < 10 lines

### Frontend
- No changes required (browser fetch will respect Cache-Control by default for GET; POST caching is limited but s-maxage helps edge)

### Model
- Not relevant

## 4. Example I/O & Verification

**Input:** (same as before)  
POST to /api/systems with { names: ["O3H-1FN", "I9T-0FN"] }

**Expected Headers on first request:**  
cf-cache-status: DYNAMIC (or MISS)  
Cache-Control: public, max-age=300, s-maxage=300

**Expected on second identical request (within 5 min):**  
cf-cache-status: HIT  
Cache-Control: ... (same)  
Response time: much faster (~10–100 ms vs full computation)

**How to test locally/after deploy:**
- Use browser dev tools → Network tab → check cf-cache-status header
- Or curl -I https://systems-test.heatsense.workers.dev/api/system?name=O3H-1FN (repeat twice)

## 5. Safety & Risks
- RISK: If Worker uses custom Vary headers or ignores Cache-Control → caching won't work (rare)
- RISK: POST requests are not cached by browsers by default → edge caching (s-maxage) still helps for repeat users behind same CDN node
- Do NOT: Add stale-while-revalidate — it is NOT supported reliably in Workers Cache API (docs confirm as of Oct 2025)
- Do NOT: Change response body or status
- Do NOT: Add cache for non-200 responses

## 6. Exact Code Snippet to Add (template)

At the end of the handler, replace:

return new Response(...);

with something like:

const finalResponse = new Response(body, {
  ...init,
  headers: {
    ...init?.headers,
    'Cache-Control': 'public, max-age=300, s-maxage=300',
    // keep existing headers like Content-Type
  }
});

if (finalResponse.status === 200) {
  // Optional: edge cache put if not already present
  // const cloned = finalResponse.clone();
  // await caches.default.put(request, cloned);
}

return finalResponse;

## 7. Output Format for LLM Implementation
When implementing:
- Provide the FULL updated Worker script file (or the handler function if modular)
- OR a unified diff showing ONLY the added/changed lines
- Include comment: // Added caching headers per HeatSense optimization #06

Prepared for: HeatSense maintainer / LLM code generation