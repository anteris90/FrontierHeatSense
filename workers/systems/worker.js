// worker.js – R2 + JSON verzió (2026-kompatibilis) -- GIT Supported
const V = "arctangent-v1.0";
const M = 1.45;
const METERS_PER_LY = 9.46073e15;

let cachedData = null;
let cachedNpcGates = null;

async function loadNpcGates(env) {
  if (cachedNpcGates) return cachedNpcGates;

  try {
    const obj = await env.R2_BUCKET.get('npc_gates.json');
    if (!obj) {
      cachedNpcGates = {};
      return cachedNpcGates;
    }
    const txt = await obj.text();
    const raw = JSON.parse(txt);

    const map = Object.create(null);

    if (Array.isArray(raw)) {
      for (const item of raw) {
        let a, b;
        if (Array.isArray(item) && item.length >= 2) { a = item[0]; b = item[1]; }
        else if (item && typeof item === 'object' && 'from' in item && 'to' in item) { a = item.from; b = item.to; }
        if (a == null || b == null) continue;
        map[a] = map[a] || new Set(); map[a].add(b);
        map[b] = map[b] || new Set(); map[b].add(a);
      }
    } else if (raw && typeof raw === 'object') {
      for (const k of Object.keys(raw)) {
        const arr = Array.isArray(raw[k]) ? raw[k] : [];
        map[k] = map[k] || new Set();
        for (const v of arr) map[k].add(v);
      }
    }

    const out = Object.create(null);
    for (const k of Object.keys(map)) out[k] = Array.from(map[k]);
    cachedNpcGates = out;
    return cachedNpcGates;
  } catch (err) {
    cachedNpcGates = {};
    return cachedNpcGates;
  }
}

async function loadData(env) {
  if (cachedData) return cachedData;

  const object = await env.R2_BUCKET.get('data_latest.json');
  if (!object) throw new Error('data_latest.json not found in R2');

  const text = await object.text();
  cachedData = JSON.parse(text);

  if (!cachedData || typeof cachedData !== 'object') {
    throw new Error('Invalid data format in data_latest.json');
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

    // Batch systems endpoint – POST /api/systems
    if (url.pathname === '/api/systems' && request.method === 'POST') {
      const cache = caches.default;

      const body = await request.json().catch(() => ({}));
      const names = Array.isArray(body.names) ? body.names : [];

      if (!names.length) {
        return Response.json({ error: 'Missing or empty names[]' }, { status: 400, headers: cors });
      }

      // Stable cache key
      const sorted = [...names].map(n => String(n).toUpperCase().trim()).sort();
      const cacheKey = new Request(
        "https://heatsense-cache/systems/" + sorted.join(","),
        { method: "GET" }
      );

      // 1) CACHE CHECK
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const statusMap = { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' };
      const results = [];

      for (const rawName of names) {
        const name = rawName.toUpperCase().trim();
        const entry = D[name];

        if (!entry) {
          results.push({ name: rawName, error: 'NOT_FOUND' });
          continue;
        }

        results.push({
          name: rawName,
          id: entry[0],
          class: entry[1],
          temp: entry[2],
          radius_km: entry[3],
          coldest: { au: entry[4], ls: entry[5], heat: entry[6] },
          status: statusMap[entry[7]] || 'UNKNOWN',
          coords: entry.length >= 11 ? { x: entry[8], y: entry[9], z: entry[10] } : null
        });
      }

      const response = new Response(
        JSON.stringify({ systems: results }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=86400",
            ...cors
          }
        }
      );

      // 3) CACHE WRITE
      await cache.put(cacheKey, response.clone());

      return response;
    }
    

    // Route endpoint – POST /api/route
    if (url.pathname === '/api/route' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const names = body.names || [];
      if (names.length < 2) {
        return Response.json({ error: 'Need at least 2 systems' }, { status: 400, headers: cors });
      }

      // Load NPC gates map (optional). Format supported: array of pairs or mapping id -> [ids]
      const npcGates = await loadNpcGates(env).catch(() => ({}));

      // Player gates: prefer request-provided `playerGates` (array of pairs or mapping).
      // If not provided and env.PLAYER_GATE_API exists, attempt to fetch.
      let playerGates = {};
      if (body.playerGates) {
        const raw = body.playerGates;
        if (Array.isArray(raw)) {
          const tmp = Object.create(null);
          for (const it of raw) {
            let a, b;
            if (Array.isArray(it) && it.length >= 2) { a = it[0]; b = it[1]; }
            else if (it && typeof it === 'object' && 'from' in it && 'to' in it) { a = it.from; b = it.to; }
            if (a == null || b == null) continue;
            tmp[a] = tmp[a] || [];
            tmp[a].push(b);
            tmp[b] = tmp[b] || [];
            tmp[b].push(a);
          }
          playerGates = tmp;
        } else if (raw && typeof raw === 'object') playerGates = raw;
      } else if (env.PLAYER_GATE_API) {
        try {
          const ids = names.map(n => (D[n.toUpperCase().trim()] ? D[n.toUpperCase().trim()][0] : null)).filter(Boolean);
          const resp = await fetch(env.PLAYER_GATE_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
          if (resp.ok) {
            const pg = await resp.json().catch(() => ({}));
            if (Array.isArray(pg)) {
              const tmp = Object.create(null);
              for (const it of pg) {
                let a, b;
                if (Array.isArray(it) && it.length >= 2) { a = it[0]; b = it[1]; }
                else if (it && typeof it === 'object' && 'from' in it && 'to' in it) { a = it.from; b = it.to; }
                if (a == null || b == null) continue;
                tmp[a] = tmp[a] || [];
                tmp[a].push(b);
                tmp[b] = tmp[b] || [];
                tmp[b].push(a);
              }
              playerGates = tmp;
            } else if (pg && typeof pg === 'object') playerGates = pg;
          }
        } catch (err) {
          playerGates = {};
        }
      }

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
        if (!entry) {
          return Response.json({ error: `Not found: ${rawName}` }, { status: 404, headers: cors });
        }

        const lowHeat = entry[6];
        const st = entry[7];

        let jumpHeatGen = 0;
        let totalAfter = lowHeat;
        let canJumpThis = true;

        let gateType = null;
        if (i > 0) {  // ugrás az előzőtől ide
          const fromId = String(prevEntry[0]);
          const toId = String(entry[0]);

          const npcList = (npcGates && npcGates[fromId]) ? npcGates[fromId] : [];
          const playerList = (playerGates && playerGates[fromId]) ? playerGates[fromId] : [];

          const isNpcGate = Array.isArray(npcList) && npcList.indexOf(entry[0]) !== -1;
          const isPlayerGate = Array.isArray(playerList) && playerList.indexOf(entry[0]) !== -1;

          if (isNpcGate || isPlayerGate) {
            gateType = isNpcGate ? 'npc' : 'player';
            jumpHeatGen = 0;
            totalAfter = lowHeat;
            canJumpThis = true;
            // do not add to totalLY for gate jumps
          } else {
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
        }

        routeData.push({
          name: rawName,
          low_heat: lowHeat.toFixed(2),
          status: ['SAFE', 'MODERATE', 'DANGEROUS', 'CRITICAL'][{ S: 0, M: 1, D: 2, C: 3 }[st] || 0],
          jump_heat_gen: jumpHeatGen.toFixed(2),
          total_after_jump: totalAfter.toFixed(2),
          can_jump: canJumpThis,
          gate: gateType
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
      out.sort((a, b) => b.heat - a.heat);

      return Response.json(out, { headers: cors });
    }

    return new Response('Not Found', { status: 404, headers: cors });
  }
};
