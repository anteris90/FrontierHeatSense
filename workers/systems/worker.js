// worker.js – R2 + JSON verzió (2026-kompatibilis) -- GIT Supported
const V = "arctangent-v1.0";
const M = 1.45;
const METERS_PER_LY = 9.46073e15;

let cachedData = null;
let cachedNpcGates = null;

// Simple concurrency mapper for controlled parallel fetches
async function mapWithConcurrency(list, mapper, concurrency = 6) {
  const results = new Array(list.length);
  let i = 0;
  const workers = new Array(Math.min(concurrency, list.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= list.length) return;
      try {
        results[idx] = await mapper(list[idx], idx);
      } catch (err) {
        results[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// Fetch with retries + exponential backoff and jitter
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
      // network error — retry
      if (attempt >= retries) throw err;
      const backoff = Math.min(maxBackoff, baseBackoff * Math.pow(2, attempt));
      const jitter = backoff * (0.5 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, Math.round(jitter)));
      attempt++;
      continue;
    }
  }
}

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

    // Admin endpoints: upload or reload NPC gates in R2
    // Secure with header 'x-admin-token' matching env.ADMIN_TOKEN
    if (url.pathname === '/api/admin/upload-npc-gates' && request.method === 'POST') {
      const token = request.headers.get('x-admin-token');
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const body = await request.json().catch(() => null);
      if (!body) return Response.json({ error: 'Missing body' }, { status: 400, headers: cors });

      try {
        await env.R2_BUCKET.put('npc_gates.json', JSON.stringify(body));
        // clear cached copy so subsequent requests see the update
        cachedNpcGates = null;
        // pre-load to validate
        await loadNpcGates(env);
        return Response.json({ ok: true }, { headers: cors });
      } catch (err) {
        return Response.json({ error: 'R2 write failed: ' + err.message }, { status: 500, headers: cors });
      }
    }

    if (url.pathname === '/api/admin/reload-gates' && request.method === 'POST') {
      const token = request.headers.get('x-admin-token');
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }
      cachedNpcGates = null;
      try {
        await loadNpcGates(env);
        return Response.json({ ok: true }, { headers: cors });
      } catch (err) {
        return Response.json({ error: 'Reload failed: ' + err.message }, { status: 500, headers: cors });
      }
    }

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
        // Protect against extremely large route requests
        const PLAYER_GATE_MAX_SYSTEMS = Number(env.PLAYER_GATE_MAX_SYSTEMS) || 100;
        if (names.length > PLAYER_GATE_MAX_SYSTEMS) {
          return Response.json({ error: `Route too large: max ${PLAYER_GATE_MAX_SYSTEMS} systems per request. Please split your route.` }, { status: 413, headers: cors });
        }

        // concurrency and retry configuration (env override)
        const PLAYER_GATE_CONCURRENCY = Number(env.PLAYER_GATE_CONCURRENCY) || 8;
        const PLAYER_GATE_RETRIES = Number(env.PLAYER_GATE_RETRIES) || 3;
        const PLAYER_GATE_BASE_BACKOFF_MS = Number(env.PLAYER_GATE_BASE_BACKOFF_MS) || 200;
        const PLAYER_GATE_MAX_BACKOFF_MS = Number(env.PLAYER_GATE_MAX_BACKOFF_MS) || 5000;

        try {
          const base = String(env.PLAYER_GATE_API).replace(/\/$/, '');
          const ids = names.map(n => (D[n.toUpperCase().trim()] ? String(D[n.toUpperCase().trim()][0]) : null)).filter(Boolean);

          const sysCache = Object.create(null);
          const asmCache = Object.create(null);
          const tmp = Object.create(null);

          const fetchSys = async (sid) => {
            if (sysCache[sid]) return sysCache[sid];
            const sysUrl = `${base}/v2/solarsystems/${sid}?format=json`;
            const resp = await fetchWithRetry(sysUrl, { method: 'GET', headers: { 'Accept': 'application/json' } }, PLAYER_GATE_RETRIES, PLAYER_GATE_BASE_BACKOFF_MS, PLAYER_GATE_MAX_BACKOFF_MS);
            if (!resp || !resp.ok) return null;
            const j = await resp.json().catch(() => null);
            sysCache[sid] = j;
            return j;
          };

          const fetchAsm = async (aid) => {
            if (asmCache[aid]) return asmCache[aid];
            const url = `${base}/v2/smartassemblies/${encodeURIComponent(aid)}?format=json`;
            const r = await fetchWithRetry(url, { method: 'GET', headers: { 'Accept': 'application/json' } }, PLAYER_GATE_RETRIES, PLAYER_GATE_BASE_BACKOFF_MS, PLAYER_GATE_MAX_BACKOFF_MS);
            if (!r || !r.ok) return null;
            const j = await r.json().catch(() => null);
            asmCache[aid] = j;
            return j;
          };

          // Fetch systems concurrently (limited)
          const systemsJson = await mapWithConcurrency(ids, fetchSys, PLAYER_GATE_CONCURRENCY);

          // Collect gate IDs
          const gateTasks = [];
          const originByGate = Object.create(null);
          for (let idx = 0; idx < ids.length; idx++) {
            const sid = ids[idx];
            const sysJson = systemsJson[idx];
            if (!sysJson) continue;
            const originId = String(sysJson.id || sid);
            const assemblies = Array.isArray(sysJson.smartAssemblies) ? sysJson.smartAssemblies : [];
            for (const asm of assemblies) {
              if (!asm || String(asm.type).toLowerCase() !== 'smartgate') continue;
              const gateId = String(asm.id);
              if (!gateId) continue;
              if (!originByGate[gateId]) originByGate[gateId] = [];
              if (originByGate[gateId].indexOf(originId) === -1) originByGate[gateId].push(originId);
              gateTasks.push(gateId);
            }
          }

          const uniqueGateIds = Array.from(new Set(gateTasks));
          const asmResults = await mapWithConcurrency(uniqueGateIds, fetchAsm, PLAYER_GATE_CONCURRENCY);

          for (let i = 0; i < uniqueGateIds.length; i++) {
            const gid = uniqueGateIds[i];
            const asmJson = asmResults[i];
            if (!asmJson) continue;

            let destSystemId = null;
            if (asmJson.gate && Array.isArray(asmJson.gate.inRange) && asmJson.gate.inRange.length) {
              const r = asmJson.gate.inRange[0];
              destSystemId = (r && r.solarSystem && r.solarSystem.id) ? r.solarSystem.id : (r && r.solarSystemId) ? r.solarSystemId : null;
            }

            if (!destSystemId && asmJson.gate && asmJson.gate.destinationId) {
              const destAsmId = String(asmJson.gate.destinationId);
              const destAsmJson = await fetchAsm(destAsmId).catch(() => null);
              if (destAsmJson && destAsmJson.gate && Array.isArray(destAsmJson.gate.inRange) && destAsmJson.gate.inRange.length) {
                const rr = destAsmJson.gate.inRange[0];
                destSystemId = (rr && rr.solarSystem && rr.solarSystem.id) ? rr.solarSystem.id : (rr && rr.solarSystemId) ? rr.solarSystemId : null;
              }
            }

            if (!destSystemId) continue;

            const origins = originByGate[gid] || [];
            for (const aOrigin of origins) {
              const a = String(aOrigin);
              const b = String(destSystemId);
              tmp[a] = tmp[a] || [];
              if (tmp[a].indexOf(b) === -1) tmp[a].push(b);
              tmp[b] = tmp[b] || [];
              if (tmp[b].indexOf(a) === -1) tmp[b].push(a);
            }
          }

          if (Object.keys(tmp).length) playerGates = tmp;
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

          // normalize comparison to string IDs (npc/player maps use string keys/values)
          const isNpcGate = Array.isArray(npcList) && npcList.indexOf(toId) !== -1;
          const isPlayerGate = Array.isArray(playerList) && playerList.indexOf(toId) !== -1;

          if (isNpcGate || isPlayerGate) {
            gateType = isNpcGate ? 'npc' : 'player';
            jumpHeatGen = 0;
            totalAfter = lowHeat;
            canJumpThis = true;
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
