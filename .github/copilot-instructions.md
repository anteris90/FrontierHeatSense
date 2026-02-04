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
# Auto-commit with git hash stamp
node scripts/stamp-and-commit.js --push
```

### Testing Routes
```bash
# Test worker API endpoints
node scripts/test_route.js
```

## Project-Specific Conventions

### Import/Export Pattern
- **No build tools** - use native ES6 modules with `.js` extensions
- **Function exports**: `export { functionA, functionB }`
- **Import style**: `import { specific, functions } from './path.js'`

### System Name Handling
- Always use `normalizeSystemName()` before API calls
- System names are case-insensitive but stored uppercase
- Handle both single systems and comma-separated lists

### API Communication
- **Local fallback**: All API calls gracefully fall back to `/db/data.json`
- **Batch preferred**: Use `fetchBatchSystems()` over multiple single calls
- **Error handling**: Always catch and display user-friendly messages

### State Management
```javascript
// Global state in app.js - expose for debugging
window.lastRouteResults = lastRouteResults;
window.lastRouteJumps = lastRouteJumps;
```

## Integration Points

### Player Gate Detection
- **Client-side**: `loadPlayerGates()` resolves system → assembly mappings
- **Server-side**: R2 storage + Frontier API fallback
- **Flow**: Client preflight → attach to route request → server validation

### Ship Data Integration
- Ship stats loaded from `/db/data.json`
- Mass/C-value calculations affect jump heat
- Skill bonuses modify effective C-value

### External APIs
- **Frontier API**: `PLAYER_GATE_API` for live gate data
- **R2 Storage**: `player_gates.json` for authoritative mapping
- **Fallback**: Local JSON files for offline development

## Heat Calculation Model

```javascript
// Ergod Arctangent v2.0 formula
H(D) = A · (2/π) · arctan((π/2) · λ / D)
where: λ = K · T^α · R^β

// Parameters
K = 1.287e-11, α = 1.686, β = 1.226, A = 99.02
```

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