/**
 * handlers/systems.js
 * 
 * System lookup endpoints:
 * - GET /api/system?name=SYSTEM-NAME - Single system lookup
 * - POST /api/systems - Batch systems lookup with Cloudflare cache
 * 
 * Caching:
 * - Single: No HTTP caching (returns system data inline)
 * - Batch: HTTP 'Cache-Control: max-age=86400' stored in Cloudflare cache
 *   Stable cache key based on sorted system names ensures identical
 *   requests hit cache regardless of input order
 */

import { loadData } from '../services/data-loader.js';

const STATUS_MAP = { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' };

/**
 * Format a single system entry for API response
 */
function formatSystemEntry(name, entry) {
  return {
    name,
    id: entry[0],
    class: entry[1],
    temp: entry[2],
    radius_km: entry[3],
    coldest: { au: entry[4], ls: entry[5], heat: entry[6] },
    status: STATUS_MAP[entry[7]] || 'UNKNOWN',
    coords: entry.length >= 11 ? { x: entry[8], y: entry[9], z: entry[10] } : null
  };
}

/**
 * GET /api/system?name=SYSTEM-NAME
 * Single system lookup by normalized name
 */
async function handleSingleSystem(url, env, cors) {
  const name = url.searchParams.get('name')?.toUpperCase().trim();
  if (!name) {
    return Response.json({ error: 'Missing name' }, { status: 400, headers: cors });
  }

  const D = await loadData(env);
  const entry = D[name];
  
  if (!entry) {
    return Response.json({ error: 'Not found' }, { status: 404, headers: cors });
  }

  return Response.json({
    system: formatSystemEntry(name, entry),
    model: 'arctangent-v1.0'
  }, { headers: cors });
}

/**
 * POST /api/systems
 * Batch systems lookup with HTTP caching
 * 
 * Request body: { names: ['SYSTEM-1', 'SYSTEM-2', ...] }
 * Response: { systems: [...] }
 */
async function handleBatchSystems(request, env, cors) {
  const cache = caches.default;
  
  const body = await request.json().catch(() => ({}));
  const names = Array.isArray(body.names) ? body.names : [];

  if (!names.length) {
    return Response.json({ error: 'Missing or empty names[]' }, { status: 400, headers: cors });
  }

  // Create stable cache key based on sorted names
  // Ensures identical results hit cache regardless of input order
  const sorted = [...names].map(n => String(n).toUpperCase().trim()).sort();
  const cacheKey = new Request(
    "https://heatsense-cache/systems/" + sorted.join(","),
    { method: "GET" }
  );

  // Try cache first
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Not cached, fetch and process
  const D = await loadData(env);
  const results = [];

  for (const rawName of names) {
    const name = rawName.toUpperCase().trim();
    const entry = D[name];

    if (!entry) {
      results.push({ name: rawName, error: 'NOT_FOUND' });
      continue;
    }

    results.push(formatSystemEntry(rawName, entry));
  }

  const response = new Response(
    JSON.stringify({ systems: results, model: 'cloudflare-worker' }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
        ...cors
      }
    }
  );

  // Cache the response for future requests
  await cache.put(cacheKey, response.clone());

  return response;
}

/**
 * GET /api/highheat
 * Get all systems with heat >= 85 (DANGER and TRAP systems)
 */
async function handleHighHeat(env, cors) {
  const D = await loadData(env);
  const out = [];

  for (const name in D) {
    const e = D[name];
    const heat = Number(e[6]);   // heat value

    if (heat >= 85) {   // 🔥 DANGER+
      out.push({
        name,
        star: e[1],
        temp: e[2],
        au: e[4],
        ls: e[5],
        heat,
        status: heat >= 90 ? 'TRAP' : 'DANGER'
      });
    }
  }

  // Sort by heat DESC
  out.sort((a, b) => b.heat - a.heat);

  return Response.json(out, { headers: cors });
}

/**
 * Route system requests to appropriate handler
 */
async function handleSystems(pathname, request, env, cors) {
  const url = new URL(request.url);
  
  if (pathname === '/api/system' && request.method === 'GET') {
    return await handleSingleSystem(url, env, cors);
  }
  
  if (pathname === '/api/systems' && request.method === 'POST') {
    return await handleBatchSystems(request, env, cors);
  }
  
  if (pathname === '/api/highheat' && request.method === 'GET') {
    return await handleHighHeat(env, cors);
  }
  
  return null; // Not a system endpoint
}

export { handleSystems };
