var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// services/data-loader.js
var cachedData = null;
var cachedNpcGates = null;
var cachedPlayerGates = null;
async function loadNpcGates(env) {
  if (cachedNpcGates) return cachedNpcGates;
  try {
    const obj = await env.R2_BUCKET.get("npc_gates.json");
    if (!obj) {
      cachedNpcGates = {};
      return cachedNpcGates;
    }
    const txt = await obj.text();
    const raw = JSON.parse(txt);
    const map = /* @__PURE__ */ Object.create(null);
    if (Array.isArray(raw)) {
      for (const item of raw) {
        let a, b;
        if (Array.isArray(item) && item.length >= 2) {
          a = item[0];
          b = item[1];
        } else if (item && typeof item === "object" && "from" in item && "to" in item) {
          a = item.from;
          b = item.to;
        }
        if (a == null || b == null) continue;
        map[a] = map[a] || /* @__PURE__ */ new Set();
        map[a].add(b);
        map[b] = map[b] || /* @__PURE__ */ new Set();
        map[b].add(a);
      }
    } else if (raw && typeof raw === "object") {
      for (const k of Object.keys(raw)) {
        const arr = Array.isArray(raw[k]) ? raw[k] : [];
        map[k] = map[k] || /* @__PURE__ */ new Set();
        for (const v of arr) map[k].add(v);
      }
    }
    const out = /* @__PURE__ */ Object.create(null);
    for (const k of Object.keys(map)) out[k] = Array.from(map[k]);
    cachedNpcGates = out;
    return cachedNpcGates;
  } catch (err) {
    cachedNpcGates = {};
    return cachedNpcGates;
  }
}
__name(loadNpcGates, "loadNpcGates");
async function loadPlayerGatesR2(env) {
  if (cachedPlayerGates) return cachedPlayerGates;
  try {
    const obj = await env.R2_BUCKET.get("player_gates.json");
    if (!obj) {
      cachedPlayerGates = null;
      return cachedPlayerGates;
    }
    const txt = await obj.text();
    const raw = JSON.parse(txt);
    const map = /* @__PURE__ */ Object.create(null);
    if (Array.isArray(raw)) {
      for (const item of raw) {
        let a, b;
        if (Array.isArray(item) && item.length >= 2) {
          a = item[0];
          b = item[1];
        } else if (item && typeof item === "object" && "from" in item && "to" in item) {
          a = item.from;
          b = item.to;
        }
        if (a == null || b == null) continue;
        const sa = String(a);
        const sb = String(b);
        map[sa] = map[sa] || /* @__PURE__ */ new Set();
        map[sa].add(sb);
        map[sb] = map[sb] || /* @__PURE__ */ new Set();
        map[sb].add(sa);
      }
    } else if (raw && typeof raw === "object") {
      for (const k of Object.keys(raw)) {
        const arr = Array.isArray(raw[k]) ? raw[k] : [];
        const sk = String(k);
        map[sk] = map[sk] || /* @__PURE__ */ new Set();
        for (const v of arr) map[sk].add(String(v));
      }
    }
    const out = /* @__PURE__ */ Object.create(null);
    for (const k of Object.keys(map)) out[k] = Array.from(map[k]);
    cachedPlayerGates = out;
    return cachedPlayerGates;
  } catch (err) {
    cachedPlayerGates = null;
    return cachedPlayerGates;
  }
}
__name(loadPlayerGatesR2, "loadPlayerGatesR2");
async function loadData(env) {
  if (cachedData) return cachedData;
  const object = await env.R2_BUCKET.get("data_latest.json");
  if (!object) throw new Error("data_latest.json not found in R2");
  const text = await object.text();
  cachedData = JSON.parse(text);
  if (!cachedData || typeof cachedData !== "object") {
    throw new Error("Invalid data format in data_latest.json");
  }
  return cachedData;
}
__name(loadData, "loadData");
function clearNpcGatesCache() {
  cachedNpcGates = null;
}
__name(clearNpcGatesCache, "clearNpcGatesCache");
function clearPlayerGatesCache() {
  cachedPlayerGates = null;
}
__name(clearPlayerGatesCache, "clearPlayerGatesCache");

// handlers/admin.js
function verifyAdminToken(request, env, cors) {
  const token = request.headers.get("x-admin-token");
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return Response.json({ error: "Forbidden" }, { status: 403, headers: cors });
  }
  return false;
}
__name(verifyAdminToken, "verifyAdminToken");
async function handleUploadNpcGates(request, env, cors) {
  const tokenError = verifyAdminToken(request, env, cors);
  if (tokenError) return tokenError;
  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Missing body" }, { status: 400, headers: cors });
  }
  try {
    await env.R2_BUCKET.put("npc_gates.json", JSON.stringify(body));
    clearNpcGatesCache();
    await loadNpcGates(env);
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    return Response.json({ error: "R2 write failed: " + err.message }, { status: 500, headers: cors });
  }
}
__name(handleUploadNpcGates, "handleUploadNpcGates");
async function handleReloadGates(request, env, cors) {
  const tokenError = verifyAdminToken(request, env, cors);
  if (tokenError) return tokenError;
  clearNpcGatesCache();
  try {
    await loadNpcGates(env);
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    return Response.json({ error: "Reload failed: " + err.message }, { status: 500, headers: cors });
  }
}
__name(handleReloadGates, "handleReloadGates");
async function handleUploadPlayerGates(request, env, cors) {
  const tokenError = verifyAdminToken(request, env, cors);
  if (tokenError) return tokenError;
  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Missing body" }, { status: 400, headers: cors });
  }
  try {
    await env.R2_BUCKET.put("player_gates.json", JSON.stringify(body));
    clearPlayerGatesCache();
    await loadPlayerGatesR2(env);
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    return Response.json({ error: "R2 write failed: " + err.message }, { status: 500, headers: cors });
  }
}
__name(handleUploadPlayerGates, "handleUploadPlayerGates");
async function handleReloadPlayerGates(request, env, cors) {
  const tokenError = verifyAdminToken(request, env, cors);
  if (tokenError) return tokenError;
  clearPlayerGatesCache();
  try {
    await loadPlayerGatesR2(env);
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    return Response.json({ error: "Reload failed: " + err.message }, { status: 500, headers: cors });
  }
}
__name(handleReloadPlayerGates, "handleReloadPlayerGates");
async function handleAdmin(pathname, request, env, cors) {
  if (pathname === "/api/admin/upload-npc-gates" && request.method === "POST") {
    return await handleUploadNpcGates(request, env, cors);
  }
  if (pathname === "/api/admin/reload-gates" && request.method === "POST") {
    return await handleReloadGates(request, env, cors);
  }
  if (pathname === "/api/admin/upload-player-gates" && request.method === "POST") {
    return await handleUploadPlayerGates(request, env, cors);
  }
  if (pathname === "/api/admin/reload-player-gates" && request.method === "POST") {
    return await handleReloadPlayerGates(request, env, cors);
  }
  return null;
}
__name(handleAdmin, "handleAdmin");

// handlers/systems.js
var STATUS_MAP = { "S": "SAFE", "M": "MODERATE", "D": "DANGEROUS", "C": "CRITICAL" };
function formatSystemEntry(name, entry) {
  return {
    name,
    id: entry[0],
    class: entry[1],
    temp: entry[2],
    radius_km: entry[3],
    coldest: { au: entry[4], ls: entry[5], heat: entry[6] },
    status: STATUS_MAP[entry[7]] || "UNKNOWN",
    coords: entry.length >= 11 ? { x: entry[8], y: entry[9], z: entry[10] } : null
  };
}
__name(formatSystemEntry, "formatSystemEntry");
async function handleSingleSystem(url, env, cors) {
  const name = url.searchParams.get("name")?.toUpperCase().trim();
  if (!name) {
    return Response.json({ error: "Missing name" }, { status: 400, headers: cors });
  }
  const D = await loadData(env);
  const entry = D[name];
  if (!entry) {
    return Response.json({ error: "Not found" }, { status: 404, headers: cors });
  }
  return Response.json({
    system: formatSystemEntry(name, entry),
    model: "arctangent-v1.0"
  }, { headers: cors });
}
__name(handleSingleSystem, "handleSingleSystem");
async function handleBatchSystems(request, env, cors) {
  const cache = caches.default;
  const body = await request.json().catch(() => ({}));
  const names = Array.isArray(body.names) ? body.names : [];
  if (!names.length) {
    return Response.json({ error: "Missing or empty names[]" }, { status: 400, headers: cors });
  }
  const sorted = [...names].map((n) => String(n).toUpperCase().trim()).sort();
  const cacheKey = new Request(
    "https://heatsense-cache/systems/" + sorted.join(","),
    { method: "GET" }
  );
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const D = await loadData(env);
  const results = [];
  for (const rawName of names) {
    const name = rawName.toUpperCase().trim();
    const entry = D[name];
    if (!entry) {
      results.push({ name: rawName, error: "NOT_FOUND" });
      continue;
    }
    results.push(formatSystemEntry(rawName, entry));
  }
  const response = new Response(
    JSON.stringify({ systems: results, model: "cloudflare-worker" }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
        ...cors
      }
    }
  );
  await cache.put(cacheKey, response.clone());
  return response;
}
__name(handleBatchSystems, "handleBatchSystems");
async function handleHighHeat(env, cors) {
  const D = await loadData(env);
  const out = [];
  for (const name in D) {
    const e = D[name];
    const heat = Number(e[6]);
    if (heat >= 85) {
      out.push({
        name,
        star: e[1],
        temp: e[2],
        au: e[4],
        ls: e[5],
        heat,
        status: heat >= 90 ? "TRAP" : "DANGER"
      });
    }
  }
  out.sort((a, b) => b.heat - a.heat);
  return Response.json(out, { headers: cors });
}
__name(handleHighHeat, "handleHighHeat");
async function handleSystems(pathname, request, env, cors) {
  const url = new URL(request.url);
  if (pathname === "/api/system" && request.method === "GET") {
    return await handleSingleSystem(url, env, cors);
  }
  if (pathname === "/api/systems" && request.method === "POST") {
    return await handleBatchSystems(request, env, cors);
  }
  if (pathname === "/api/highheat" && request.method === "GET") {
    return await handleHighHeat(env, cors);
  }
  return null;
}
__name(handleSystems, "handleSystems");

// handlers/player-gates.js
async function handleGetPlayerGates(env, cors) {
  try {
    const playerGates = {
      "30004078": ["30004088"],
      "30004088": ["30004078"]
    };
    return Response.json(playerGates, {
      headers: { ...cors, "Cache-Control": "public, max-age=3600" }
    });
  } catch (err) {
    return Response.json({}, { headers: cors });
  }
}
__name(handleGetPlayerGates, "handleGetPlayerGates");
async function handlePlayerGates(pathname, request, env, cors) {
  if (pathname === "/api/player-gates" && request.method === "GET") {
    return await handleGetPlayerGates(env, cors);
  }
  return null;
}
__name(handlePlayerGates, "handlePlayerGates");

// utils/fetch-retry.js
async function fetchWithRetry(url, opts = {}, retries = 3, baseBackoff = 200, maxBackoff = 5e3) {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, opts);
      if (res && (res.status === 429 || res.status >= 500 && res.status < 600)) {
        if (attempt >= retries) return res;
        const backoff = Math.min(maxBackoff, baseBackoff * Math.pow(2, attempt));
        const jitter = backoff * (0.5 + Math.random() * 0.5);
        await new Promise((r) => setTimeout(r, Math.round(jitter)));
        attempt++;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      const backoff = Math.min(maxBackoff, baseBackoff * Math.pow(2, attempt));
      const jitter = backoff * (0.5 + Math.random() * 0.5);
      await new Promise((r) => setTimeout(r, Math.round(jitter)));
      attempt++;
      continue;
    }
  }
}
__name(fetchWithRetry, "fetchWithRetry");

// utils/concurrency.js
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
__name(mapWithConcurrency, "mapWithConcurrency");

// services/player-gate-resolver.js
async function resolvePlayerGatesFromApi(names, D, env, diagnostics = {}) {
  if (!env.PLAYER_GATE_API) {
    diagnostics.notes = diagnostics.notes || [];
    diagnostics.notes.push("PLAYER_GATE_API not configured");
    return {};
  }
  const PLAYER_GATE_MAX_SYSTEMS = Number(env.PLAYER_GATE_MAX_SYSTEMS) || 500;
  const PLAYER_GATE_CONCURRENCY = Number(env.PLAYER_GATE_CONCURRENCY) || 8;
  const PLAYER_GATE_RETRIES = Number(env.PLAYER_GATE_RETRIES) || 3;
  const PLAYER_GATE_BASE_BACKOFF_MS = Number(env.PLAYER_GATE_BASE_BACKOFF_MS) || 200;
  const PLAYER_GATE_MAX_BACKOFF_MS = Number(env.PLAYER_GATE_MAX_BACKOFF_MS) || 5e3;
  if (names.length > PLAYER_GATE_MAX_SYSTEMS) {
    throw new Error(`Route too large: max ${PLAYER_GATE_MAX_SYSTEMS} systems per request. Please split your route.`);
  }
  try {
    const base = String(env.PLAYER_GATE_API).replace(/\/$/, "");
    const ids = names.map((n) => D[n.toUpperCase().trim()] ? String(D[n.toUpperCase().trim()][0]) : null).filter(Boolean);
    const sysCache = /* @__PURE__ */ Object.create(null);
    const asmCache = /* @__PURE__ */ Object.create(null);
    const result = /* @__PURE__ */ Object.create(null);
    const authHeaders = {};
    if (env.PLAYER_GATE_TOKEN) {
      authHeaders["Authorization"] = `Bearer ${env.PLAYER_GATE_TOKEN}`;
    }
    const safeFetch = /* @__PURE__ */ __name(async (url) => {
      const r = await fetchWithRetry(
        url,
        { method: "GET", headers: { "Accept": "application/json", ...authHeaders } },
        PLAYER_GATE_RETRIES,
        PLAYER_GATE_BASE_BACKOFF_MS,
        PLAYER_GATE_MAX_BACKOFF_MS
      );
      if (!r) return null;
      if (r.status === 401 || r.status === 403) {
        diagnostics.authFailed = true;
        return null;
      }
      if (r.status === 429) diagnostics.rateLimited = true;
      if (!r.ok) return null;
      try {
        return await r.json();
      } catch (e) {
        return null;
      }
    }, "safeFetch");
    const fetchSys = /* @__PURE__ */ __name(async (sid) => {
      if (sysCache[sid]) return sysCache[sid];
      const sysUrl = `${base}/solarsystems/${sid}`;
      const j = await safeFetch(sysUrl);
      sysCache[sid] = j;
      return j;
    }, "fetchSys");
    const fetchAsm = /* @__PURE__ */ __name(async (aid) => {
      if (asmCache[aid]) return asmCache[aid];
      const url = `${base}/smartassemblies/${encodeURIComponent(aid)}`;
      const j = await safeFetch(url);
      asmCache[aid] = j;
      return j;
    }, "fetchAsm");
    const systemsJson = await mapWithConcurrency(ids, fetchSys, PLAYER_GATE_CONCURRENCY);
    const gateTasks = [];
    const originByGate = /* @__PURE__ */ Object.create(null);
    for (let idx = 0; idx < ids.length; idx++) {
      const sid = ids[idx];
      const sysJson = systemsJson[idx];
      if (!sysJson) {
        diagnostics.skippedSystems = diagnostics.skippedSystems || [];
        diagnostics.skippedSystems.push(sid);
        continue;
      }
      const originId = String(sysJson.id || sid);
      const assemblies = Array.isArray(sysJson.smartAssemblies) ? sysJson.smartAssemblies : [];
      for (const asm of assemblies) {
        if (!asm || String(asm.type).toLowerCase() !== "smartgate") continue;
        const gateId = String(asm.id);
        if (!gateId) continue;
        if (!originByGate[gateId]) originByGate[gateId] = [];
        if (originByGate[gateId].indexOf(originId) === -1) {
          originByGate[gateId].push(originId);
        }
        gateTasks.push(gateId);
      }
    }
    const uniqueGateIds = Array.from(new Set(gateTasks));
    const asmResults = await mapWithConcurrency(uniqueGateIds, fetchAsm, PLAYER_GATE_CONCURRENCY);
    const resolveDestSystem = /* @__PURE__ */ __name(async (asmJsonOrId, visited = /* @__PURE__ */ new Set(), depth = 0) => {
      if (!asmJsonOrId || depth > 8) return null;
      let asmJson = null;
      try {
        if (typeof asmJsonOrId === "string" || typeof asmJsonOrId === "number") {
          const aid = String(asmJsonOrId);
          if (visited.has(aid)) return null;
          visited.add(aid);
          asmJson = await fetchAsm(aid).catch(() => null);
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
        if (asmJson.gate && Array.isArray(asmJson.gate.inRange) && asmJson.gate.inRange.length) {
          for (const r of asmJson.gate.inRange) {
            if (!r) continue;
            if (r.solarSystem && r.solarSystem.id) return String(r.solarSystem.id);
            if (r.solarSystemId) return String(r.solarSystemId);
            if (r.smartAssemblyId) {
              const nested = await fetchAsm(String(r.smartAssemblyId)).catch(() => null);
              if (nested) {
                const got = await resolveDestSystem(nested, visited, depth + 1);
                if (got) return String(got);
              }
            }
          }
        }
        if (asmJson.gate && asmJson.gate.destinationId) {
          const destId = String(asmJson.gate.destinationId);
          const maybeSys = await fetchSys(destId).catch(() => null);
          if (maybeSys && maybeSys.id) return String(maybeSys.id);
          const destAsm = await fetchAsm(destId).catch(() => null);
          if (destAsm) {
            const got = await resolveDestSystem(destAsm, visited, depth + 1);
            if (got) return String(got);
          }
        }
      } catch (err) {
        diagnostics.notes = diagnostics.notes || [];
        diagnostics.notes.push(`resolveDestSystem error: ${String(err && err.message ? err.message : err)}`);
      }
      return null;
    }, "resolveDestSystem");
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
        result[a] = result[a] || [];
        if (result[a].indexOf(b) === -1) result[a].push(b);
        result[b] = result[b] || [];
        if (result[b].indexOf(a) === -1) result[b].push(a);
      }
    }
    if (Object.keys(result).length) {
      diagnostics.found = Object.keys(result).length;
    }
    return result;
  } catch (err) {
    diagnostics.notes = diagnostics.notes || [];
    diagnostics.notes.push(String(err && err.message ? err.message : err));
    return {};
  }
}
__name(resolvePlayerGatesFromApi, "resolvePlayerGatesFromApi");

// services/detour-planner.js
function calculateMaxJumpDistance(currentHeat, shipParams) {
  const { totalMass, hullMass, effectiveC } = shipParams;
  const maxHeat = 149;
  const heatBudget = maxHeat - currentHeat;
  if (heatBudget <= 0) return 0;
  return heatBudget * effectiveC * hullMass / (3 * totalMass);
}
__name(calculateMaxJumpDistance, "calculateMaxJumpDistance");
function calculateJumpHeat(distanceLY, shipParams) {
  const { totalMass, hullMass, effectiveC } = shipParams;
  return 3 * totalMass * distanceLY / (effectiveC * hullMass);
}
__name(calculateJumpHeat, "calculateJumpHeat");
function calculateDistance(sys1, sys2) {
  const dx = sys1.x - sys2.x;
  const dy = sys1.y - sys2.y;
  const dz = sys1.z - sys2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
__name(calculateDistance, "calculateDistance");
function planDetour(fromSystem, toSystem, destSystem, currentHeat, shipParams, systemDatabase) {
  const maxJumpDist = calculateMaxJumpDistance(currentHeat, shipParams);
  if (maxJumpDist <= 0) {
    return null;
  }
  const distToFailed = calculateDistance(fromSystem, toSystem);
  const distFailedToDest = calculateDistance(toSystem, destSystem);
  let bestDetour = null;
  let bestScore = Infinity;
  const maxDetourHeat = 140;
  for (const [, candidate] of Object.entries(systemDatabase)) {
    if (candidate.id === fromSystem.id || candidate.id === toSystem.id || candidate.id === destSystem.id) {
      continue;
    }
    const distToCandidate = calculateDistance(fromSystem, candidate);
    if (distToCandidate > maxJumpDist) {
      continue;
    }
    const heatToCandidate = calculateJumpHeat(distToCandidate, shipParams);
    if (currentHeat + heatToCandidate > maxDetourHeat) {
      continue;
    }
    const distCandidateToDest = calculateDistance(candidate, destSystem);
    if (distCandidateToDest >= distFailedToDest) {
      continue;
    }
    const detourDistance = distToCandidate + distCandidateToDest;
    const directDistance = distToFailed + distFailedToDest;
    const score = detourDistance / directDistance;
    if (score < bestScore) {
      bestScore = score;
      bestDetour = {
        system: candidate,
        distance: distToCandidate,
        heat: heatToCandidate,
        score
      };
    }
  }
  return bestDetour;
}
__name(planDetour, "planDetour");
function applyDetours(routeJumps, routeData, shipParams, systemDatabase) {
  if (!routeJumps || routeJumps.length === 0) {
    return routeData;
  }
  const result = [];
  let accumulatedHeat = 0;
  for (let i = 0; i < routeJumps.length; i++) {
    const jump = routeJumps[i];
    const currentSystem = routeData[i];
    const nextSystem = routeData[i + 1];
    result.push(currentSystem);
    if (jump.heatGenerated > 149) {
      const finalDestination = routeData[routeData.length - 1];
      const detour = planDetour(
        currentSystem.system,
        nextSystem.system,
        finalDestination.system,
        accumulatedHeat,
        shipParams,
        systemDatabase
      );
      if (detour) {
        nextSystem._excluded = true;
        nextSystem._excludedReason = `Failed jump (${jump.heatGenerated.toFixed(2)} heat)`;
        const detourEntry = {
          system: detour.system,
          _detour: true,
          _detourFrom: currentSystem.system.name,
          _detourAround: nextSystem.system.name,
          _detourDistance: detour.distance.toFixed(2),
          _detourHeat: detour.heat.toFixed(2)
        };
        result.push(detourEntry);
        accumulatedHeat += detour.heat;
      } else {
        nextSystem._noDetourAvailable = true;
        nextSystem._failedHeat = jump.heatGenerated.toFixed(2);
        accumulatedHeat += jump.heatGenerated;
      }
    } else {
      accumulatedHeat += jump.heatGenerated;
    }
  }
  const lastSystem = routeData[routeData.length - 1];
  if (result[result.length - 1].system.id !== lastSystem.system.id) {
    result.push(lastSystem);
  }
  return result;
}
__name(applyDetours, "applyDetours");

// handlers/route.js
var METERS_PER_LY = 946073e10;
var STATUS_MAP2 = { "S": "SAFE", "M": "MODERATE", "D": "DANGEROUS", "C": "CRITICAL" };
function normalizePlayerGatesInput(raw) {
  const playerGates = {};
  if (Array.isArray(raw)) {
    const tmp = /* @__PURE__ */ Object.create(null);
    for (const it of raw) {
      let a, b;
      if (Array.isArray(it) && it.length >= 2) {
        a = it[0];
        b = it[1];
      } else if (it && typeof it === "object" && "from" in it && "to" in it) {
        a = it.from;
        b = it.to;
      }
      if (a == null || b == null) continue;
      const sa = String(a);
      const sb = String(b);
      tmp[sa] = tmp[sa] || [];
      if (tmp[sa].indexOf(sb) === -1) tmp[sa].push(sb);
      tmp[sb] = tmp[sb] || [];
      if (tmp[sb].indexOf(sa) === -1) tmp[sb].push(sa);
    }
    Object.assign(playerGates, tmp);
  } else if (raw && typeof raw === "object") {
    const tmp = /* @__PURE__ */ Object.create(null);
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
    Object.assign(playerGates, tmp);
  }
  return playerGates;
}
__name(normalizePlayerGatesInput, "normalizePlayerGatesInput");
async function resolvePlayerGates(body, env, D, diagnostics) {
  let playerGates = {};
  if (body.playerGates) {
    playerGates = normalizePlayerGatesInput(body.playerGates);
    return playerGates;
  }
  let resolvedFromR2 = false;
  try {
    const r2map = await loadPlayerGatesR2(env).catch(() => null);
    if (r2map && typeof r2map === "object" && Object.keys(r2map).length) {
      playerGates = r2map;
      resolvedFromR2 = true;
      diagnostics.notes = diagnostics.notes || [];
      diagnostics.notes.push("Loaded player gates from R2");
      return playerGates;
    }
  } catch (e) {
  }
  if (!resolvedFromR2 && env.PLAYER_GATE_API) {
    try {
      const names = body.names || [];
      playerGates = await resolvePlayerGatesFromApi(names, D, env, diagnostics);
      if (Object.keys(playerGates).length) {
        diagnostics.notes = diagnostics.notes || [];
        diagnostics.notes.push("Resolved player gates from EVE Frontier API");
      }
    } catch (err) {
      diagnostics.notes = diagnostics.notes || [];
      diagnostics.notes.push(`Player gate resolution error: ${err.message}`);
    }
  } else if (!env.PLAYER_GATE_API) {
    diagnostics.notes = diagnostics.notes || [];
    diagnostics.notes.push("PLAYER_GATE_API not configured");
  }
  return playerGates;
}
__name(resolvePlayerGates, "resolvePlayerGates");
async function handleRoute(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const names = body.names || [];
  if (names.length < 2) {
    return Response.json({ error: "Need at least 2 systems" }, { status: 400, headers: cors });
  }
  try {
    const D = await loadData(env);
    const npcGates = await loadNpcGates(env).catch(() => ({}));
    const playerGateDiagnostics = {
      skippedSystems: [],
      authFailed: false,
      rateLimited: false,
      notes: []
    };
    const playerGates = await resolvePlayerGates(body, env, D, playerGateDiagnostics);
    const totalMass = body.totalMass || 79598125;
    const hullMass = body.hullMass || 74655480;
    const baseC = body.baseC || 2.5;
    const skillLevel = body.skillLevel || 0;
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
      let distLY = null;
      if (i > 0) {
        const fromId = String(prevEntry[0]);
        const toId = String(entry[0]);
        const npcList = npcGates && npcGates[fromId] ? npcGates[fromId] : [];
        const playerList = playerGates && playerGates[fromId] ? playerGates[fromId] : [];
        const isNpcGate = Array.isArray(npcList) && npcList.indexOf(toId) !== -1;
        const isPlayerGate = Array.isArray(playerList) && playerList.indexOf(toId) !== -1;
        if (isNpcGate || isPlayerGate) {
          gateType = isNpcGate ? "npc" : "player";
          jumpHeatGen = 0;
          totalAfter = lowHeat;
          canJumpThis = true;
          if (entry.length >= 11 && prevEntry.length >= 11 && isFinite(entry[8]) && isFinite(prevEntry[8])) {
            const dx = entry[8] - prevEntry[8];
            const dy = entry[9] - prevEntry[9];
            const dz = entry[10] - prevEntry[10];
            const distM = Math.sqrt(dx * dx + dy * dy + dz * dz);
            distLY = distM / METERS_PER_LY;
            totalLY += distLY;
          }
        } else {
          if (entry.length >= 11 && prevEntry.length >= 11 && isFinite(entry[8]) && isFinite(prevEntry[8])) {
            const dx = entry[8] - prevEntry[8];
            const dy = entry[9] - prevEntry[9];
            const dz = entry[10] - prevEntry[10];
            const distM = Math.sqrt(dx * dx + dy * dy + dz * dz);
            distLY = distM / METERS_PER_LY;
            totalLY += distLY;
            jumpHeatGen = 3 * totalMass * distLY / (effectiveC * hullMass);
            totalAfter = prevEntry[6] + jumpHeatGen;
            canJumpThis = Number.isFinite(totalAfter) ? totalAfter <= 150 : null;
            if (canJumpThis === false) canComplete = false;
          } else {
            jumpHeatGen = null;
            totalAfter = lowHeat;
            canJumpThis = null;
            playerGateDiagnostics.skippedSystems.push({ name: rawName, reason: "missing_coords" });
          }
        }
      }
      routeData.push({
        name: rawName,
        id: entry[0],
        low_heat: Number(lowHeat),
        status: STATUS_MAP2[st] || "UNKNOWN",
        distance_ly: distLY != null ? Number(distLY) : null,
        jump_heat_gen: jumpHeatGen == null ? null : Number(jumpHeatGen),
        total_after_jump: totalAfter == null ? null : Number(totalAfter),
        can_jump: canJumpThis == null ? null : Boolean(canJumpThis),
        gate: gateType
        // 'npc' | 'player' | null
      });
      prevEntry = entry;
    }
    let finalRouteData = routeData;
    if (body.totalMass || body.hullMass || body.baseC || body.skillLevel >= 0) {
      const systemDatabase = {};
      for (const [name, entry] of Object.entries(D)) {
        if (entry.length >= 11 && isFinite(entry[8])) {
          systemDatabase[name.toUpperCase()] = {
            id: entry[0],
            name,
            x: entry[8],
            y: entry[9],
            z: entry[10]
          };
        }
      }
      const routeJumps = [];
      for (let i = 1; i < routeData.length; i++) {
        const jump = routeData[i];
        routeJumps.push({
          heatGenerated: jump.jump_heat_gen || 0,
          to: jump.name
        });
      }
      const routeForDetour = routeData.map((entry) => ({
        system: {
          id: entry.id,
          name: entry.name,
          x: D[entry.name.toUpperCase()]?.[8],
          y: D[entry.name.toUpperCase()]?.[9],
          z: D[entry.name.toUpperCase()]?.[10]
        }
      }));
      const shipParams = {
        totalMass,
        hullMass,
        effectiveC
      };
      const detourResult = applyDetours(routeJumps, routeForDetour, shipParams, systemDatabase);
      finalRouteData = detourResult.map((entry) => {
        const originalEntry = routeData.find((r) => r.name.toUpperCase() === entry.system.name.toUpperCase());
        if (originalEntry && !entry._detour) {
          return {
            ...originalEntry,
            _excluded: entry._excluded || false,
            _noDetourAvailable: entry._noDetourAvailable || false,
            _excludedReason: entry._excludedReason
          };
        }
        const sysEntry = D[entry.system.name.toUpperCase()];
        if (!sysEntry) return null;
        return {
          name: entry.system.name,
          id: entry.system.id,
          low_heat: sysEntry[6],
          status: STATUS_MAP2[sysEntry[7]] || "UNKNOWN",
          distance_ly: entry._detourDistance ? Number(entry._detourDistance) : null,
          jump_heat_gen: entry._detourHeat ? Number(entry._detourHeat) : null,
          total_after_jump: null,
          can_jump: true,
          gate: null,
          _detour: true,
          _detourFrom: entry._detourFrom,
          _detourAround: entry._detourAround
        };
      }).filter(Boolean);
    }
    const respBody = {
      route: finalRouteData,
      total_distance_ly: Number(totalLY),
      can_complete_route: canComplete,
      playerGateDiagnostics
    };
    return Response.json(respBody, { headers: cors });
  } catch (err) {
    console.error("Route error:", err);
    return Response.json({ error: err.message }, { status: 500, headers: cors });
  }
}
__name(handleRoute, "handleRoute");
async function handleRouteEndpoint(pathname, request, env, cors) {
  if (pathname === "/api/route" && request.method === "POST") {
    return await handleRoute(request, env, cors);
  }
  return null;
}
__name(handleRouteEndpoint, "handleRouteEndpoint");

// worker.js
var VERSION = "arctangent-v1.0";
var MODEL_MAE = 1.45;
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    try {
      if (pathname === "/api/health") {
        return Response.json(
          { status: "ok", model: VERSION, mae: MODEL_MAE },
          { headers: CORS_HEADERS }
        );
      }
      const adminResponse = await handleAdmin(pathname, request, env, CORS_HEADERS);
      if (adminResponse) return adminResponse;
      const systemsResponse = await handleSystems(pathname, request, env, CORS_HEADERS);
      if (systemsResponse) return systemsResponse;
      const playerGatesResponse = await handlePlayerGates(pathname, request, env, CORS_HEADERS);
      if (playerGatesResponse) return playerGatesResponse;
      const routeResponse = await handleRouteEndpoint(pathname, request, env, CORS_HEADERS);
      if (routeResponse) return routeResponse;
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    } catch (err) {
      console.error("Worker error:", err);
      return Response.json(
        { error: "Internal server error: " + (err.message || String(err)) },
        { status: 500, headers: CORS_HEADERS }
      );
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Z7v1cY/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Z7v1cY/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
