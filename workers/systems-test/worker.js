// HeatSense Worker - Arctangent v1.0 + Dual Model Support | MAE 1.45 (static)
// All comments and variable names in English only

const VERSION = "arctangent-v1.0-dual";
const MAE_STATIC = 1.45;
const METERS_PER_LY = 9.46073e15; // 1 light-year in meters
const L_SUN = 3.828e26;           // Solar luminosity in Watts
const A_MAX = 99.02;              // Asymptotic max heat value

// Cache for loaded data from R2 (prevents repeated fetches)
let cachedData = null;

/**
 * Loads system data from R2 bucket (data.json)
 * Expected format: { "SYSTEMNAME": [id, class, temp, radius_km, au, ls, heat_static, status, x, y, z, luminosity_watt] }
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Object>} Parsed data object
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

  console.log(`Loaded ${Object.keys(cachedData).length} systems from R2`);
  return cachedData;
}

/**
 * New heat model based on luminosity (real-time calculation)
 * H(D) = A * (2/π) * arctan( (A * 2π * sqrt(L/Lsun)) / D )
 * @param {number} D_ls - Distance in light-seconds to coldest point
 * @param {number} luminosity_watt - Star luminosity in Watts
 * @returns {number} Calculated heat value (0-100 scale)
 */
function calculateHeatNew(D_ls, luminosity_watt) {
  if (D_ls <= 0) return A_MAX;

  const L_over_Lsun = luminosity_watt / L_SUN;
  const arg = A_MAX * 2 * Math.PI * Math.sqrt(L_over_Lsun) / D_ls;

  return A_MAX * (2 / Math.PI) * Math.atan(arg);
}

export default {
  /**
   * Main request handler
   * @param {Request} request
   * @param {Object} env - Bindings (R2_BUCKET)
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    let D;
    try {
      D = await loadData(env);
    } catch (err) {
      return Response.json(
        { error: `Failed to load data: ${err.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    // Health check
    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        version: VERSION,
        mae_static: MAE_STATIC,
        systems_loaded: Object.keys(D).length
      }, { headers: corsHeaders });
    }

    // Single system lookup: GET /api/system?name=SYSTEM&useNewModel=1 (optional)
    if (url.pathname === '/api/system') {
      const name = url.searchParams.get('name')?.toUpperCase().trim();
      if (!name) {
        return Response.json({ error: 'Missing system name' }, { status: 400, headers: corsHeaders });
      }

      const entry = D[name];
      if (!entry) {
        return Response.json({ error: 'System not found' }, { status: 404, headers: corsHeaders });
      }

      const useNewModel = url.searchParams.get('useNewModel') === '1';
      let heat = entry[6]; // static precomputed heat (index 6)
      let modelUsed = 'static';

      if (useNewModel && entry.length >= 12) {
        // luminosity at index 11 (if you added it)
        const luminosity = entry[11];
        heat = calculateHeatNew(entry[5], luminosity); // D_ls at index 5
        modelUsed = 'new-luminosity';
      }

      const statusMap = { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' };
      const status = statusMap[entry[7]] || 'UNKNOWN';

      return Response.json({
        system: {
          system_id: entry[0],
          name,
          star_class: entry[1],
          temperature: entry[2],
          radius_km: entry[3],
          coldest_point: {
            distance_au: entry[4],
            distance_ls: entry[5],
            heat: Number(heat.toFixed(2))
          },
          status,
          coords: entry.length >= 11 ? {
            x: entry[8],
            y: entry[9],
            z: entry[10]
          } : null,
          model_used: modelUsed
        },
        model_version: VERSION
      }, { headers: corsHeaders });
    }

    // Route endpoint: POST /api/route { "names": ["SYS1", "SYS2", ...] }
    if (url.pathname === '/api/route' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const names = body.names || [];
      if (names.length < 2) {
        return Response.json({ error: 'At least 2 systems required' }, { status: 400, headers: corsHeaders });
      }

      const jumps = [];
      let totalLY = 0;
      let totalHeat = 0;
      let maxHeat = -Infinity;
      let worstStatus = 'S';
      const statusOrder = { 'S': 0, 'M': 1, 'D': 2, 'C': 3 };

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

        const heat = entry[6]; // static heat
        const st = entry[7];

        totalHeat += heat;
        maxHeat = Math.max(maxHeat, heat);
        worstStatus = statusOrder[st] > statusOrder[worstStatus] ? st : worstStatus;

        jumps.push({
          from: i === 0 ? null : names[i-1],
          to: names[i],
          distance_ly: distanceLY !== null ? Number(distanceLY.toFixed(3)) : null,
          low_heat: Number(heat.toFixed(2)),
          status: { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' }[st] || 'UNKNOWN'
        });

        prevEntry = entry;
      }

      return Response.json({
        total_distance_ly: Number(totalLY.toFixed(2)),
        total_low_heat: Number(totalHeat.toFixed(2)),
        avg_low_heat: Number((totalHeat / names.length).toFixed(2)),
        max_low_heat: Number(maxHeat.toFixed(2)),
        worst_status: { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' }[worstStatus] || 'UNKNOWN',
        jumps
      }, { headers: corsHeaders });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
