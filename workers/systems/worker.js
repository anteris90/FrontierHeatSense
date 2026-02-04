/**
 * worker.js
 * 
 * Cloudflare Worker entry point - Request router
 * 
 * Modularized architecture:
 * - handlers/ - Endpoint handlers (admin, systems, route, player-gates)
 * - services/ - Business logic (data-loader, player-gate-resolver)
 * - utils/ - Shared utilities (fetch-retry, concurrency)
 * 
 * This file handles:
 * 1. CORS preflight
 * 2. Health check endpoint
 * 3. Request routing to appropriate handler
 * 4. Error handling
 */

import { handleAdmin } from './handlers/admin.js';
import { handleSystems } from './handlers/systems.js';
import { handlePlayerGates } from './handlers/player-gates.js';
import { handleRouteEndpoint } from './handlers/route.js';

const VERSION = 'arctangent-v1.0';
const MODEL_MAE = 1.45;

/**
 * CORS headers for all responses
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

/**
 * Main fetch handler
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // Health check endpoint
      if (pathname === '/api/health') {
        return Response.json(
          { status: 'ok', model: VERSION, mae: MODEL_MAE },
          { headers: CORS_HEADERS }
        );
      }

      // Route admin endpoints
      const adminResponse = await handleAdmin(pathname, request, env, CORS_HEADERS);
      if (adminResponse) return adminResponse;

      // Route system endpoints
      const systemsResponse = await handleSystems(pathname, request, env, CORS_HEADERS);
      if (systemsResponse) return systemsResponse;

      // Route player gates endpoint
      const playerGatesResponse = await handlePlayerGates(pathname, request, env, CORS_HEADERS);
      if (playerGatesResponse) return playerGatesResponse;

      // Route calculation endpoint
      const routeResponse = await handleRouteEndpoint(pathname, request, env, CORS_HEADERS);
      if (routeResponse) return routeResponse;

      // No matching endpoint
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    } catch (err) {
      console.error('Worker error:', err);
      return Response.json(
        { error: 'Internal server error: ' + (err.message || String(err)) },
        { status: 500, headers: CORS_HEADERS }
      );
    }
  }
};
