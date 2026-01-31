// worker.js – R2 + JSON verzió (2026-kompatibilis) -- GIT Supported
const V = "arctangent-v1.0";
const M = 1.45;
const METERS_PER_LY = 9.46073e15;

let cachedData = null;

async function loadData(env) {
  if (cachedData) return cachedData;

  const object = await env.R2_BUCKET.get('data.json');
  if (!object) throw new Error('data.json not found in R2');

  const text = await object.text();
  cachedData = JSON.parse(text);

  if (!cachedData || typeof cachedData !== 'object') {
    throw new Error('Invalid data format in data.json');
  }

  return cachedData;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // Health check
    if (url.pathname === '/api/health') {
      return Response.json({ status: 'ok', model: V, mae: M }, { headers: cors });
    }

    let D;
    try {
      D = await loadData(env);
    } catch (err) {
      return Response.json({ error: 'Failed to load data: ' + err.message }, { status: 500, headers: cors });
    }

    // Single system
    if (url.pathname === '/api/system') {
      const name = url.searchParams.get('name')?.toUpperCase().trim();
      if (!name) return Response.json({ error: 'Missing name' }, { status: 400, headers: cors });

      const entry = D[name];
      if (!entry) return Response.json({ error: 'Not found' }, { status: 404, headers: cors });

      const statusMap = { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' };
      return Response.json({
        system: {
          id: entry[0],
          name,
          class: entry[1],
          temp: entry[2],
          radius_km: entry[3],
          coldest: { au: entry[4], ls: entry[5], heat: entry[6] },
          status: statusMap[entry[7]] || 'UNKNOWN',
          coords: entry.length >= 11 ? { x: entry[8], y: entry[9], z: entry[10] } : null
        },
        model: V
      }, { headers: cors });
    }
      // Route endpoint – POST /api/route
      if (url.pathname === '/api/route' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const names = body.names || [];
        if (names.length < 2) return Response.json({ error: 'Need at least 2 systems' }, { status: 400, headers: cors });

        // Hajó paraméterek (default értékekkel)
        const totalMass   = body.totalMass   || 79598125;
        const hullMass    = body.hullMass    || 74655480;
        const baseC       = body.baseC       || 2.5;
        const skillLevel  = body.skillLevel  || 0;

        const effectiveC = baseC * (1 + skillLevel * 0.02);

        const routeData = [];
        let totalLY = 0;
        let canComplete = true;

        let prevEntry = null;

        for (let i = 0; i < names.length; i++) {
          const rawName = names[i];
          const name = rawName.toUpperCase().trim();
          const entry = D[name];
          if (!entry) return Response.json({ error: `Not found: ${rawName}` }, { status: 404, headers: cors });

          const lowHeat = entry[6];
          const st = entry[7];

          let jumpHeatGen = 0;
          let totalAfter = lowHeat;
          let canJumpThis = true;

          if (i > 0) {  // ugrás az előzőtől ide
            const dx = entry[8] - prevEntry[8];
            const dy = entry[9] - prevEntry[9];
            const dz = entry[10] - prevEntry[10];
            const distM = Math.sqrt(dx*dx + dy*dy + dz*dz);
            const distLY = distM / METERS_PER_LY;
            totalLY += distLY;

            jumpHeatGen = (3 * totalMass * distLY) / (effectiveC * hullMass);
            totalAfter = lowHeat + jumpHeatGen;
            canJumpThis = totalAfter <= 150;

            if (!canJumpThis) canComplete = false;
          }

          routeData.push({
            name: rawName,
            low_heat: lowHeat.toFixed(2),
            status: ['SAFE', 'MODERATE', 'DANGEROUS', 'CRITICAL'][{S:0,M:1,D:2,C:3}[st] || 0],
            jump_heat_gen: jumpHeatGen.toFixed(2),
            total_after_jump: totalAfter.toFixed(2),
            can_jump: canJumpThis
          });

          prevEntry = entry;
        }

        return Response.json({
          route: routeData,
          total_distance_ly: totalLY.toFixed(2),
          can_complete_route: canComplete
        }, { headers: cors });
      }

      // HIGH-HEAT LIST ENDPOINT
      if (url.pathname === '/api/highheat') {

        const out = [];

        for (const name in D) {
          const e = D[name];
          const heat = Number(e[6]);   // fontos

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
        // heat DESC sort
        out.sort((a,b)=>b.heat - a.heat);

        return Response.json(out, { headers: cors });
      }
    return new Response('Not Found', { status: 404, headers: cors });
  }
};
