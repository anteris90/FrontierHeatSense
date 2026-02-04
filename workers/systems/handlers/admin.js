/**
 * handlers/admin.js
 * 
 * Admin endpoints for managing NPC and player gates data in R2.
 * All endpoints require 'x-admin-token' header matching env.ADMIN_TOKEN
 * 
 * Endpoints:
 * - POST /api/admin/upload-npc-gates - Upload NPC gates mapping to R2
 * - POST /api/admin/reload-gates - Reload NPC gates from R2 (clear cache)
 * - POST /api/admin/upload-player-gates - Upload player gates mapping to R2
 * - POST /api/admin/reload-player-gates - Reload player gates from R2 (clear cache)
 */

import { 
  loadNpcGates, 
  loadPlayerGatesR2, 
  clearNpcGatesCache, 
  clearPlayerGatesCache 
} from '../services/data-loader.js';

/**
 * Middleware: Verify admin token
 * @returns {boolean|Response} False if valid, Response if error
 */
function verifyAdminToken(request, env, cors) {
  const token = request.headers.get('x-admin-token');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
  }
  return false;
}

/**
 * POST /api/admin/upload-npc-gates
 * Upload new NPC gates mapping to R2 and clear cache
 */
async function handleUploadNpcGates(request, env, cors) {
  const tokenError = verifyAdminToken(request, env, cors);
  if (tokenError) return tokenError;

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: 'Missing body' }, { status: 400, headers: cors });
  }

  try {
    await env.R2_BUCKET.put('npc_gates.json', JSON.stringify(body));
    clearNpcGatesCache();
    await loadNpcGates(env);
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    return Response.json({ error: 'R2 write failed: ' + err.message }, { status: 500, headers: cors });
  }
}

/**
 * POST /api/admin/reload-gates
 * Clear NPC gates cache and reload from R2
 */
async function handleReloadGates(request, env, cors) {
  const tokenError = verifyAdminToken(request, env, cors);
  if (tokenError) return tokenError;

  clearNpcGatesCache();
  try {
    await loadNpcGates(env);
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    return Response.json({ error: 'Reload failed: ' + err.message }, { status: 500, headers: cors });
  }
}

/**
 * POST /api/admin/upload-player-gates
 * Upload new player gates mapping to R2 and clear cache
 */
async function handleUploadPlayerGates(request, env, cors) {
  const tokenError = verifyAdminToken(request, env, cors);
  if (tokenError) return tokenError;

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: 'Missing body' }, { status: 400, headers: cors });
  }

  try {
    await env.R2_BUCKET.put('player_gates.json', JSON.stringify(body));
    clearPlayerGatesCache();
    await loadPlayerGatesR2(env);
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    return Response.json({ error: 'R2 write failed: ' + err.message }, { status: 500, headers: cors });
  }
}

/**
 * POST /api/admin/reload-player-gates
 * Clear player gates cache and reload from R2
 */
async function handleReloadPlayerGates(request, env, cors) {
  const tokenError = verifyAdminToken(request, env, cors);
  if (tokenError) return tokenError;

  clearPlayerGatesCache();
  try {
    await loadPlayerGatesR2(env);
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    return Response.json({ error: 'Reload failed: ' + err.message }, { status: 500, headers: cors });
  }
}

/**
 * Route admin requests to appropriate handler
 */
async function handleAdmin(pathname, request, env, cors) {
  if (pathname === '/api/admin/upload-npc-gates' && request.method === 'POST') {
    return await handleUploadNpcGates(request, env, cors);
  }
  
  if (pathname === '/api/admin/reload-gates' && request.method === 'POST') {
    return await handleReloadGates(request, env, cors);
  }
  
  if (pathname === '/api/admin/upload-player-gates' && request.method === 'POST') {
    return await handleUploadPlayerGates(request, env, cors);
  }
  
  if (pathname === '/api/admin/reload-player-gates' && request.method === 'POST') {
    return await handleReloadPlayerGates(request, env, cors);
  }
  
  return null; // Not an admin endpoint
}

export { handleAdmin };
