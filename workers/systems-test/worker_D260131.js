// HeatSense Worker - Arctangent v1.0 | MAE 1.45
// All comments and variable names in English only

const VERSION = "arctangent-v1.0";
const MAE = 1.45;
const METERS_PER_LY = 9.46073e15; // 1 light-year in meters

// Cache for loaded data (prevents repeated R2 fetches)
let cachedData = null;

/**
 * Loads system data from R2 (data.json) with caching
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Object>} Parsed D object { name: [id, class, temp, radius, au, ls, heat, status, x, y, z] }
 */
async function loadData(env) {
  if (cachedData) return cachedData;

  const object = await env.R2_BUCKET.get('data.json');
  if (!object) {
    throw new Error('data.json not found in R2 bucket');
  }

  const text = await object.text();
  cachedData = JSON.parse(text);

  if (!cachedData || typeof cachedData !== 'object') {
    throw new Error('Invalid data format in data.json');
  }

  return cachedData;
}

export default {
  /**
   * Main request handler for the Worker
   * @param {Request} request - Incoming request
   * @param {Object} env - Environment bindings (R2_BUCKET)
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check endpoint
    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        version: VERSION,
        mae: MAE
      }, { headers: corsHeaders });
    }

    let D;
    try {
      D = await loadData(env);
    } catch (err) {
      return Response.json(
        { error: `Failed to load system data: ${err.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    // Single system lookup: GET /api/system?name=SYSTEM_NAME
    if (url.pathname === '/api/system') {
      const name = url.searchParams.get('name')?.toUpperCase().trim();
      if (!name) {
        return Response.json({ error: 'Missing system name' }, { status: 400, headers: corsHeaders });
      }

      const entry = D[name];
      if (!entry) {
        return Response.json({ error: 'System not found' }, { status: 404, headers: corsHeaders });
      }

      const statusMap = { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' };

      return Response.json({
        system: {
          id: entry[0],
          name,
          star_class: entry[1],
          temperature: entry[2],
          radius_km: entry[3],
          coldest_point: {
            distance_au: entry[4],
            distance_ls: entry[5],
            heat: entry[6]
          },
          status: statusMap[entry[7]] || 'UNKNOWN',
          coords: entry.length >= 11 ? {
            x: entry[8],
            y: entry[9],
            z: entry[10]
          } : null
        },
        model: VERSION
      }, { headers: corsHeaders });
    }

    // Route calculation: POST /api/route
    if (url.pathname === '/api/route' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const names = body.names || [];
      if (names.length < 2) {
        return Response.json({ error: 'At least 2 systems required' }, { status: 400, headers: corsHeaders });
      }

      const jumps = [];
      let totalLY = 0;
      let prevEntry = null;

      for (let i = 0; i < names.length; i++) {
        const name = names[i].toUpperCase().trim();
        const entry = D[name];
        if (!entry) {
          return Response.json({ error: `System not found: ${names[i]}` }, { status: 404, headers: corsHeaders });
        }

        let distanceLY = null;

        if (i > 0 && prevEntry && entry.length >= 11 && prevEntry.length >= 11) {
          const dx = entry[8] - prevEntry[8];
          const dy = entry[9] - prevEntry[9];
          const dz = entry[10] - prevEntry[10];
          const distM = Math.sqrt(dx*dx + dy*dy + dz*dz);
          distanceLY = distM / METERS_PER_LY;
          totalLY += distanceLY;
        }

        jumps.push({
          from: i === 0 ? null : names[i - 1],
          to: names[i],
          distance_ly: distanceLY !== null ? Number(distanceLY.toFixed(3)) : null,
          low_heat: Number(entry[6].toFixed(2)),
          status: { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' }[entry[7]] || 'UNKNOWN'
        });

        prevEntry = entry;
      }

      return Response.json({
        total_distance_ly: Number(totalLY.toFixed(2)),
        jumps
      }, { headers: corsHeaders });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
