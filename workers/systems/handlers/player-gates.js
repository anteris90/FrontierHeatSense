/**
 * handlers/player-gates.js
 * 
 * Player gates endpoint:
 * - GET /api/player-gates - Returns cached player gates mapping from R2
 * 
 * This endpoint provides a fast shortcut for clients to fetch the cached
 * player gates mapping without requiring direct API resolution.
 */

import { loadPlayerGatesR2 } from '../services/data-loader.js';

/**
 * GET /api/player-gates
 * Returns cached player gates mapping from R2 with HTTP caching
 */
async function handleGetPlayerGates(env, cors) {
  try {
    const playerGates = await loadPlayerGatesR2(env);
    
    if (!playerGates || !Object.keys(playerGates).length) {
      return Response.json({}, { headers: cors });
    }
    
    return Response.json(playerGates, { 
      headers: { ...cors, 'Cache-Control': 'public, max-age=3600' } 
    });
  } catch (err) {
    return Response.json({}, { headers: cors });
  }
}

/**
 * Route player gates requests
 */
async function handlePlayerGates(pathname, request, env, cors) {
  if (pathname === '/api/player-gates' && request.method === 'GET') {
    return await handleGetPlayerGates(env, cors);
  }
  
  return null; // Not a player gates endpoint
}

export { handlePlayerGates };
