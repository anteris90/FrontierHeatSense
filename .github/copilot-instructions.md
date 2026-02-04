# Copilot Instructions for FrontierHeatSense

## Project Overview

FrontierHeatSense is an **EVE Frontier** heat prediction system using Ergod's Arctangent model (MAE 0.4 Heat). The application consists of:

- **Frontend**: Modular ES6 client with no build tools (runs directly in browser)
- **Backend**: Cloudflare Worker API with R2 storage for system data
- **Data**: 24K+ star systems with heat calculations and player gate detection

## Data Structure

### System Data (`db/` and `workers/systems/`)
- `db/data.json`: Local fallback with system data as `[id, class, temp, radius_km, coldest_au, coldest_ls, coldest_heat, status]`
- `workers/systems/data.json`: Production system lookup data
- `db/systems.csv`: Raw system data from measurements
- `db/ships.json`: Ship specifications for jump calculations
- `workers/systems/player_gates.json`: Player gate mappings stored in R2

### API Response Format
```json
{
  "systems": [{
    "id": 30000004,
    "name": "O3H-1FN", 
    "class": "G0",
    "temp": 6136,
    "radius_km": 1110158,
    "status": "SAFE",
    "coldest": {
      "au": 32.16,
      "ls": 16048.0, 
      "heat": 4.98
    }
  }]
}
```

## Architecture

### Client-Side Structure (`js/`)

```
js/
├── app.js                    # Main orchestration layer
├── core/                     # Pure logic, no DOM
│   ├── api-client.js        # Worker API communication 
│   ├── calculations.js      # Heat/distance formulas
│   └── normalization.js     # System name parsing
├── services/                # Business logic
│   ├── ship-manager.js      # Ship selection & stats
│   └── player-gate-resolver.js  # Smart gate detection
└── ui/                      # DOM manipulation
    ├── renderer.js          # Main UI updates
    ├── route-table.js       # Route display
    ├── event-handlers.js    # User interactions
    └── ship-ui.js          # Ship selection UI
```

**Key Pattern**: Strict separation - `core/` has no DOM access, `ui/` handles all DOM manipulation, `services/` bridges business logic.

### Worker Structure (`workers/systems/`)

```
workers/systems/
├── worker.js               # Request router (84 lines)
├── handlers/               # API endpoints
│   ├── systems.js         # System lookups
│   ├── route.js           # Route calculations  
│   ├── player-gates.js    # Smart gate APIs
│   └── admin.js           # Data management
├── services/               # Business logic
│   ├── data-loader.js     # R2 data access
│   └── player-gate-resolver.js  # Gate resolution
└── utils/                 # Shared utilities
    ├── fetch-retry.js     # Reliable HTTP
    └── concurrency.js     # Batch processing
```

## Critical Development Workflows

### Local Development
```bash
# Frontend: Simple HTTP server (no build step)
python -m http.server 8000

# Worker: Local development
cd workers/systems
npx wrangler dev

# Deployment
cd workers/systems  
npx wrangler deploy
```

### Version Stamping
```bash
# Auto-commit with git hash stamp (updates meta tag in index.html)
npm run stamp:commit
```

### Testing
```bash
# Test worker route calculation endpoint
npm run test:route

# Lint JavaScript files
npm run lint (if available via eslint.config.cjs)
```

### Environment Configuration
- **Frontend**: Override API via `window.HEATSENSE_API = 'http://localhost:8787'`
- **Worker**: Environment variables in `wrangler.toml` [vars] section, R2 binding: `R2_BUCKET`

## Project-Specific Conventions

### Import/Export Pattern
- **No build tools** - use native ES6 modules with `.js` extensions
- **Function exports**: `export { functionA, functionB }`
- **Import style**: `import { specific, functions } from './path.js'`

### System Name Handling
- Always use `normalizeSystemName()` before API calls
- System names are case-insensitive but stored uppercase
- Handle both single systems and comma-separated lists
- Supports HTML anchor parsing from EF-Map (showinfo format with numeric IDs)
- `parseSystemInput()` normalizes diacritics, dash variants (Unicode + ASCII), and deduplicates while preserving order

### API Communication
- **Local fallback**: All API calls gracefully fall back to `/db/data.json`
- **Batch preferred**: Use `fetchBatchSystems()` over multiple single calls
- **HTTP Caching**: Batch endpoint (`/api/systems`) uses Cache-Control max-age=86400 with stable cache key (sorted names)
- **Error handling**: Always catch and display user-friendly messages
- **Fallback sequence**: Try Cloudflare API → fallback to local data file

### State Management
```javascript
// Global state in app.js - expose for debugging
window.lastRouteResults = lastRouteResults;
window.lastRouteJumps = lastRouteJumps;
```

## Integration Points

### Player Gate Detection

#### Client-Side Preflight Resolution
```javascript
// Triggered in bindPasteHandler() when 2+ systems parsed
loadPlayerGates({ names: parsed })
  .catch(() => {}) // Fails gracefully if API unavailable
```

**Resolution Priority** (in `player-gate-resolver.js`):
1. Backend shortcut: `GET /api/player-gates` (cached in R2) - **fastest**
2. Frontier API: Dynamic resolution via `PLAYER_GATE_API` environment variable
3. Local fallback: `/workers/systems/player_gates.json` for offline dev

**Caching & Error Handling**:
- Retry with exponential backoff (3 retries, max 5s backoff)
- Auth errors (4xx) fail fast; network errors (5xx) retry
- Results stored in `window.PLAYER_GATES` for reuse
- Errors don't block route calculation—proceed with NPC gates only

#### Server-Side Gate Priority (Route Calculation)
When calculating jumps in `handlers/route.js`, gates are checked **per-jump** in order:
1. **NPC Gates First** (hardcoded in `npc_gates.json`):
   - Bidirectional (A→B implies B→A)
   - Zero jump heat, no distance penalty
   - Always available, never invalidated
2. **Player Gates Second** (from request or R2):
   - Unidirectional by default (unless explicitly marked)
   - Also zero jump heat when matched
   - Resolution priority: request body → R2 cache → live API

#### Jump Detection Logic
```javascript
// For each jump from system A to B:
const fromId = String(prevEntry[0]);  // System A numeric ID
const toId = String(entry[0]);         // System B numeric ID

const isNpcGate = npcGates[fromId]?.includes(toId);
const isPlayerGate = playerGates[fromId]?.includes(toId);

if (isNpcGate || isPlayerGate) {
  // Gate exists: zero heat, instant jump
  gateType = isNpcGate ? 'npc' : 'player';
  jumpHeatGen = 0;
  totalAfter = lowHeat;  // Unchanged
} else {
  // No gate: calculate normal jump heat
  jumpHeatGen = (3 * totalMass * distanceLY) / (effectiveC * hullMass);
  totalAfter = lowHeat + jumpHeatGen;
}
```

#### Data Format Flexibility
Player gates normalized in `normalizePlayerGatesInput()` to support:
- **Array format**: `[[fromId, toId], ...]`
- **Object format**: `{fromId: [toId1, toId2], ...}`
- **Mixed**: Both converted to object `{fromId: [toIds]}`
- **Bidirectionality**: Maker gates can be manually marked bidirectional in payload

### Ship Data Integration
- Ship stats loaded from `/db/data.json`
- Mass/C-value calculations affect jump heat
- Skill bonuses modify effective C-value

### External APIs
- **Frontier API**: `PLAYER_GATE_API` for live gate data
- **R2 Storage**: `player_gates.json` for authoritative mapping
- **Fallback**: Local JSON files for offline development

## Route Calculation & Jump Heat

### Request Format (POST /api/route)
```json
{
  "names": ["O3H-1FN", "I9T-0FN"],
  "totalMass": 79598125,
  "hullMass": 74655480,
  "baseC": 2.5,
  "skillLevel": 5,
  "playerGates": [["id1", "id2"], {"from": ["to1", "to2"]}]
}
```

### Jump Heat Calculation Flow
For each consecutive system pair (A→B):

1. **Look up system coordinates** from data
2. **Calculate 3D distance** in light-years (using meters_per_ly = 9.46073e15)
3. **Check for gates** (NPC priority, then player)
   - If gate exists: `jumpHeat = 0`, system remains at coldest heat
   - If no gate: calculate jump heat generation
4. **Calculate effective C-value** with skill bonus:
   ```
   effectiveC = baseC * (1 + skillLevel * 0.02)
   ```
5. **Generate jump heat**:
   ```
   jumpHeat = (3 * totalMass * distanceLY) / (effectiveC * hullMass)
   totalAfter = lowestSystemHeat + jumpHeat
   ```
6. **Determine feasibility**:
   - `canJump = totalAfter < 149` (hard limit for survival)
   - `warning = lowestSystemHeat > 90` (high starting heat)

### Response Format
```json
{
  "route": [
    {
      "from": "O3H-1FN",
      "to": "I9T-0FN",
      "distance_ly": 3.82,
      "from_heat": 4.98,
      "jump_heat": 12.4,
      "total_after_jump": 17.38,
      "gate_type": "npc",
      "can_jump": true,
      "warning": false
    }
  ],
  "total_distance_ly": 3.82,
  "can_complete_route": true,
  "total_jumps": 1,
  "playerGateDiagnostics": {
    "skippedSystems": [],
    "notes": ["Loaded player gates from R2"],
    "authFailed": false,
    "rateLimited": false
  }
}
```

### Ship Parameter Defaults
If not provided in request:
- `totalMass`: 79,598,125 kg (example hauler cargo)
- `hullMass`: 74,655,480 kg (base ship mass)
- `baseC`: 2.5 (typical industrial)
- `skillLevel`: 0 (no bonus)

### Key Calculations Reference
```javascript
// Effective C with skills
effectiveC = baseC * (1 + skillLevel * 0.02);
// Example: 2.5 * (1 + 5 * 0.02) = 2.75

// Jump heat generation
jumpHeat = (3 * totalMass * distanceLY) / (effectiveC * hullMass);
// Lighter ships + longer jumps = more heat
// Higher skill/C-value = less heat

// Total heat after jump (ship lands in system, absorbs jump heat)
totalAfterJump = systemLowestHeat + jumpHeat;

// Feasibility threshold
canJump = totalAfterJump < 149;  // Hard limit
warning = systemLowestHeat > 90; // High starting point
```

### Diagnostics & Debugging
- **playerGateDiagnostics** included in response when resolution happens:
  - `notes`: Resolution source ("R2", "API", "request-provided")
  - `authFailed`: Auth errors during API resolution
  - `rateLimited`: Rate limiting during API resolution
  - `skippedSystems`: Systems excluded from resolution due to errors
- Use for UI feedback about gate data freshness and availability

## Configuration Points

### API Override
```javascript
// Override worker URL for testing
window.HEATSENSE_API = 'http://localhost:8787';
```

### Worker Environment
```toml
# wrangler.toml
[vars]
PLAYER_GATE_API = "https://world-api-stillness.live.tech.evefrontier.com/v2"
```

## Common Gotchas

- **Module paths**: Always include `.js` extension in imports
- **System names**: Use normalized uppercase for all internal operations  
- **Route display**: Jump data shows departure heat (TO next system, not FROM)
- **Player gates**: Client detection runs preflight, server validates
- **R2 data**: Admin endpoints required for production gate mapping updates

## File Naming Conventions

- `kebab-case` for files and directories
- `camelCase` for JavaScript functions/variables
- `UPPER_CASE` for constants and environment variables
- Module files export related functions, no default exports