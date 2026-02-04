// worker.js – R2 + JSON verzió (2026-kompatibilis) -- GIT Supported
const V = "arctangent-v1.0";
const M = 1.45;
const METERS_PER_LY = 9.46073e15;

let cachedData = null;
let cachedNpcGates = null;
let cachedPlayerGates = null;

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

async function loadPlayerGatesR2(env) {
  if (cachedPlayerGates) return cachedPlayerGates;
  try {
    const obj = await env.R2_BUCKET.get('player_gates.json');
    if (!obj) {
      cachedPlayerGates = null;
      return cachedPlayerGates;
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
        const sa = String(a); const sb = String(b);
        map[sa] = map[sa] || new Set(); map[sa].add(sb);
        map[sb] = map[sb] || new Set(); map[sb].add(sa);
      }
    } else if (raw && typeof raw === 'object') {
      for (const k of Object.keys(raw)) {
        const arr = Array.isArray(raw[k]) ? raw[k] : [];
        const sk = String(k);
        map[sk] = map[sk] || new Set();
        for (const v of arr) map[sk].add(String(v));
      }
    }
    const out = Object.create(null);
    for (const k of Object.keys(map)) out[k] = Array.from(map[k]);
    cachedPlayerGates = out;
    return cachedPlayerGates;
  } catch (err) {
    cachedPlayerGates = null;
    return cachedPlayerGates;
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

    // Admin endpoints: upload or reload PLAYER gates mapping in R2
    if (url.pathname === '/api/admin/upload-player-gates' && request.method === 'POST') {
      const token = request.headers.get('x-admin-token');
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }

      const body = await request.json().catch(() => null);
      if (!body) return Response.json({ error: 'Missing body' }, { status: 400, headers: cors });

      try {
        await env.R2_BUCKET.put('player_gates.json', JSON.stringify(body));
        cachedPlayerGates = null;
        await loadPlayerGatesR2(env);
        return Response.json({ ok: true }, { headers: cors });
      } catch (err) {
        return Response.json({ error: 'R2 write failed: ' + err.message }, { status: 500, headers: cors });
      }
    }

    if (url.pathname === '/api/admin/reload-player-gates' && request.method === 'POST') {
      const token = request.headers.get('x-admin-token');
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }
      cachedPlayerGates = null;
      try {
        await loadPlayerGatesR2(env);
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
      const playerGateDiagnostics = { skippedSystems: [], authFailed: false, rateLimited: false, notes: [] };
      if (body.playerGates) {
        const raw = body.playerGates;
        if (Array.isArray(raw)) {
          const tmp = Object.create(null);
          for (const it of raw) {
            let a, b;
            if (Array.isArray(it) && it.length >= 2) { a = it[0]; b = it[1]; }
            else if (it && typeof it === 'object' && 'from' in it && 'to' in it) { a = it.from; b = it.to; }
            if (a == null || b == null) continue;
            const sa = String(a);
            const sb = String(b);
            tmp[sa] = tmp[sa] || [];
            if (tmp[sa].indexOf(sb) === -1) tmp[sa].push(sb);
            tmp[sb] = tmp[sb] || [];
            if (tmp[sb].indexOf(sa) === -1) tmp[sb].push(sa);
          }
          playerGates = tmp;
        } else if (raw && typeof raw === 'object') {
          // Normalize object keys/values to strings
          const tmp = Object.create(null);
          for (const k of Object.keys(raw)) {
            const vals = Array.isArray(raw[k]) ? raw[k] : [];
            const sk = String(k);
            tmp[sk] = tmp[sk] || [];
            for (const v of vals) {
              const sv = String(v);
              if (tmp[sk].indexOf(sv) === -1) tmp[sk].push(sv);
              tmp[sv] = tmp[sv] || [];
              if (tmp[sv].indexOf(sk) === -1) tmp[sv].push(sk);
            }
          }
          playerGates = tmp;
        }
      } else {
        // Prefer R2-stored mapping when available (uploaded via admin endpoint).
        let resolvedFromR2 = false;
        try {
          const r2map = await loadPlayerGatesR2(env).catch(() => null);
          if (r2map && typeof r2map === 'object' && Object.keys(r2map).length) {
            playerGates = r2map;
            resolvedFromR2 = true;
            playerGateDiagnostics.notes.push('Loaded player gates from R2');
          }
        } catch (e) {
          // ignore R2 load failures and fall back to API if configured
        }

        if (!resolvedFromR2 && env.PLAYER_GATE_API) {
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

          // include optional auth token in env (if provided)
          const authHeaders = {};
          if (env.PLAYER_GATE_TOKEN) authHeaders['Authorization'] = `Bearer ${env.PLAYER_GATE_TOKEN}`;

          const safeFetch = async (url) => {
            const r = await fetchWithRetry(url, { method: 'GET', headers: { 'Accept': 'application/json', ...authHeaders } }, PLAYER_GATE_RETRIES, PLAYER_GATE_BASE_BACKOFF_MS, PLAYER_GATE_MAX_BACKOFF_MS);
            if (!r) return null;
            if (r.status === 401 || r.status === 403) {
              playerGateDiagnostics.authFailed = true;
              return null;
            }
            if (r.status === 429) playerGateDiagnostics.rateLimited = true;
            if (!r.ok) return null;
            try { return await r.json(); } catch (e) { return null; }
          };

          const fetchSys = async (sid) => {
            if (sysCache[sid]) return sysCache[sid];
            const sysUrl = `${base}/v2/solarsystems/${sid}?format=json`;
            const j = await safeFetch(sysUrl);
            sysCache[sid] = j;
            return j;
          };

          const fetchAsm = async (aid) => {
            if (asmCache[aid]) return asmCache[aid];
            const url = `${base}/v2/smartassemblies/${encodeURIComponent(aid)}?format=json`;
            const j = await safeFetch(url);
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
            if (!sysJson) { playerGateDiagnostics.skippedSystems.push(sid); continue; }
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

          // helper: resolve destination system id with depth limit and visited set
          const resolveDestSystem = async (asmJsonOrId, visited = new Set(), depth = 0) => {
            if (!asmJsonOrId || depth > 8) return null;
            // normalize to assembly JSON if an id was passed
            let asmJson = null;
            try {
              if (typeof asmJsonOrId === 'string' || typeof asmJsonOrId === 'number') {
                const aid = String(asmJsonOrId);
                if (visited.has(aid)) return null;
                visited.add(aid);
                // try fetch as assembly first
                asmJson = await fetchAsm(aid).catch(() => null);
                // if fetchAsm didn't return an assembly, try fetching as a system id
                if (!asmJson) {
                  const sys = await fetchSys(aid).catch(() => null);
                  if (sys && sys.id) return String(sys.id);
                  return null;
                }
              } else {
                const key = asmJsonOrId.id || asmJsonOrId;
                if (visited.has(key)) return null;
                visited.add(key);
                asmJson = asmJsonOrId;
              }
            } catch (err) {
              return null;
            }

            try {
              // if inRange contains direct system references, prefer those
              if (asmJson.gate && Array.isArray(asmJson.gate.inRange) && asmJson.gate.inRange.length) {
                for (const r of asmJson.gate.inRange) {
                  if (!r) continue;
                  if (r.solarSystem && r.solarSystem.id) return String(r.solarSystem.id);
                  if (r.solarSystemId) return String(r.solarSystemId);
                  // some APIs may embed assembly references inside inRange — try to resolve
                  if (r.smartAssemblyId) {
                    const nested = await fetchAsm(String(r.smartAssemblyId)).catch(() => null);
                    if (nested) {
                      const got = await resolveDestSystem(nested, visited, depth + 1);
                      if (got) return String(got);
                    }
                  }
                }
              }

              // if this assembly points to a destinationId, that may be a system id or another assembly
              if (asmJson.gate && asmJson.gate.destinationId) {
                const destId = String(asmJson.gate.destinationId);
                // try as system first
                const maybeSys = await fetchSys(destId).catch(() => null);
                if (maybeSys && maybeSys.id) return String(maybeSys.id);
                // else try as assembly id
                const destAsm = await fetchAsm(destId).catch(() => null);
                if (destAsm) {
                  const got = await resolveDestSystem(destAsm, visited, depth + 1);
                  if (got) return String(got);
                }
              }
            } catch (err) {
              // record diagnostic but don't throw
              playerGateDiagnostics.notes.push(`resolveDestSystem error: ${String(err && err.message ? err.message : err)}`);
            }

            return null;
          };

          for (let i = 0; i < uniqueGateIds.length; i++) {
            const gid = uniqueGateIds[i];
            const asmJson = asmResults[i];
            if (!asmJson) continue;

            const destSystemId = await resolveDestSystem(asmJson).catch(() => null);
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

          if (Object.keys(tmp).length) {
            playerGates = tmp;
            playerGateDiagnostics.found = Object.keys(tmp).length;
          }
        } catch (err) {
          playerGates = {};
          playerGateDiagnostics.notes.push(String(err && err.message ? err.message : err));
        }
      } else {
        // No player gate API configured and no mapping provided by client — record diagnostic
        playerGateDiagnostics.notes.push('PLAYER_GATE_API not configured; server-side player gate resolution skipped');
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
            // attempt to compute distance for metrics if coords exist
            if (entry.length >= 11 && prevEntry.length >= 11 && isFinite(entry[8]) && isFinite(prevEntry[8])) {
              const dx = entry[8] - prevEntry[8];
              const dy = entry[9] - prevEntry[9];
              const dz = entry[10] - prevEntry[10];
              const distM = Math.sqrt(dx*dx + dy*dy + dz*dz);
              const distLY = distM / METERS_PER_LY;
              totalLY += distLY;
            }
          } else {
              // Ensure coordinates are present
              if (entry.length >= 11 && prevEntry.length >= 11 && isFinite(entry[8]) && isFinite(prevEntry[8])) {
                const dx = entry[8] - prevEntry[8];
                const dy = entry[9] - prevEntry[9];
                const dz = entry[10] - prevEntry[10];
                const distM = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const distLY = distM / METERS_PER_LY;
                totalLY += distLY;

                jumpHeatGen = (3 * totalMass * distLY) / (effectiveC * hullMass);
                totalAfter = lowHeat + jumpHeatGen;
                canJumpThis = Number.isFinite(totalAfter) ? (totalAfter <= 150) : null;

                if (canJumpThis === false) canComplete = false;
              } else {
                // Missing coordinates — cannot compute distance/jump heat reliably
                jumpHeatGen = null;
                totalAfter = lowHeat;
                canJumpThis = null;
                playerGateDiagnostics.skippedSystems.push({ name: rawName, reason: 'missing_coords' });
              }
          }

        }

        // status mapping
        const statusMap = { 'S': 'SAFE', 'M': 'MODERATE', 'D': 'DANGEROUS', 'C': 'CRITICAL' };

        routeData.push({
          name: rawName,
          id: entry[0],
          low_heat: Number(lowHeat),
          status: statusMap[st] || 'UNKNOWN',
          jump_heat_gen: (jumpHeatGen == null) ? null : Number(jumpHeatGen),
          total_after_jump: (totalAfter == null) ? null : Number(totalAfter),
          can_jump: (canJumpThis == null) ? null : Boolean(canJumpThis),
          gate: gateType // 'npc' | 'player' | null
        });

        prevEntry = entry;
      }

      const respBody = {
        route: routeData,
        total_distance_ly: Number(totalLY),
        can_complete_route: canComplete
      };
      // attach diagnostics when available
      if (typeof playerGateDiagnostics !== 'undefined') respBody.playerGateDiagnostics = playerGateDiagnostics;

      return Response.json(respBody, { headers: cors });
    }
    // If no matching route endpoint matched, fall through to Not Found
    return new Response('Not Found', { status: 404, headers: cors });
  }
};
