/**
 * handlers/share.js
 *
 * Public short-link endpoints for sharing route state.
 *
 * Endpoints:
 * - POST /api/share-route - Create a short share code for route state
 * - GET /api/share-route/{code} - Resolve a short share code back to route state
 */

const SHARE_PREFIX = 'shares/';
const SHARE_SUFFIX = '.json';
const SHARE_CODE_LENGTH = 8;
const MAX_ROUTE_SYSTEMS = 64;
const MAX_SYSTEM_NAME_LENGTH = 32;

function normalizeSharePayload(body) {
  const rawRoute = Array.isArray(body?.routeNames) ? body.routeNames : [];
  const rawRouteHints = Array.isArray(body?.routeHints) ? body.routeHints : [];
  const routeNames = rawRoute
    .map(name => String(name || '').trim().toUpperCase())
    .filter(name => name && name.length <= MAX_SYSTEM_NAME_LENGTH)
    .slice(0, MAX_ROUTE_SYSTEMS);

  const routeHints = rawRouteHints
    .map(hint => {
      const from = String(hint?.from || '').trim().toUpperCase();
      const to = String(hint?.to || '').trim().toUpperCase();
      const jumpCount = Number(hint?.jumpCount);

      if (!from || !to || from.length > MAX_SYSTEM_NAME_LENGTH || to.length > MAX_SYSTEM_NAME_LENGTH) {
        return null;
      }

      if (!Number.isFinite(jumpCount) || jumpCount < 1) {
        return null;
      }

      return {
        from,
        to,
        jumpCount: Math.round(jumpCount),
        gate: 'npc'
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ROUTE_SYSTEMS);

  if (routeNames.length < 2) {
    throw new Error('Need at least 2 route systems');
  }

  const payload = {
    routeNames,
    routeHints,
    shipName: body?.shipName ? String(body.shipName).trim() : '',
    totalMass: body?.totalMass != null ? Number(body.totalMass) : null,
    skillLevel: body?.skillLevel != null ? Number(body.skillLevel) : null,
    createdAt: new Date().toISOString()
  };

  if (!Number.isFinite(payload.totalMass) || payload.totalMass <= 0) {
    payload.totalMass = null;
  } else {
    payload.totalMass = Math.round(payload.totalMass);
  }

  if (!Number.isFinite(payload.skillLevel) || payload.skillLevel < 0) {
    payload.skillLevel = null;
  } else {
    payload.skillLevel = Math.round(payload.skillLevel);
  }

  return payload;
}

function createShareCode() {
  const bytes = new Uint8Array(Math.ceil(SHARE_CODE_LENGTH / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, SHARE_CODE_LENGTH);
}

async function storeSharePayload(env, payload) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = createShareCode();
    const key = `${SHARE_PREFIX}${code}${SHARE_SUFFIX}`;
    const existing = await env.R2_BUCKET.get(key);
    if (existing) {
      continue;
    }

    await env.R2_BUCKET.put(key, JSON.stringify(payload), {
      httpMetadata: { contentType: 'application/json' }
    });
    return code;
  }

  throw new Error('Unable to allocate short code');
}

async function handleCreateShareRoute(request, env, cors) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: 'Missing body' }, { status: 400, headers: cors });
  }

  try {
    const payload = normalizeSharePayload(body);
    const code = await storeSharePayload(env, payload);
    return Response.json({ ok: true, code }, { headers: cors });
  } catch (err) {
    return Response.json({ error: err.message || 'Share creation failed' }, { status: 400, headers: cors });
  }
}

async function handleGetShareRoute(code, env, cors) {
  if (!/^[a-f0-9]{6,12}$/i.test(code || '')) {
    return Response.json({ error: 'Invalid share code' }, { status: 400, headers: cors });
  }

  const key = `${SHARE_PREFIX}${String(code).toLowerCase()}${SHARE_SUFFIX}`;
  const object = await env.R2_BUCKET.get(key);
  if (!object) {
    return Response.json({ error: 'Share link not found' }, { status: 404, headers: cors });
  }

  try {
    const payload = JSON.parse(await object.text());
    return Response.json(payload, { headers: cors });
  } catch (err) {
    return Response.json({ error: 'Invalid share payload' }, { status: 500, headers: cors });
  }
}

async function handleShare(pathname, request, env, cors) {
  if (pathname === '/api/share-route' && request.method === 'POST') {
    return await handleCreateShareRoute(request, env, cors);
  }

  if (pathname.startsWith('/api/share-route/') && request.method === 'GET') {
    const code = pathname.slice('/api/share-route/'.length);
    return await handleGetShareRoute(code, env, cors);
  }

  return null;
}

export { handleShare };