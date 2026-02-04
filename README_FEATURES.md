# FrontierHeatSense - Route Calculator & Gate Detection

A web-based route calculator for EVE Frontier that calculates optimal jump routes with accurate heat generation and detection of both NPC stargates and player-built SmartGates.

**Live:** https://systems-test.heatsense.workers.dev

---

## Key Features

### 1. **Route Analysis**
- Input any number of systems in sequence
- Calculate total jump distance in light-years
- Determine if route is completable with current ship configuration
- Display per-jump statistics (distance, heat, status)

### 2. **Jump Heat Calculation**
- Accurate heat generation based on ship mass, hull mass, and jump distance
- Formula: `Jump Heat = (3 × Total Mass × Distance LY) / (Effective C × Hull Mass)`
- Effective C includes pilot skill bonus: `Effective C = Base C × (1 + Skill Level × 0.02)`
- Maximum safe heat threshold: **150**

### 3. **Ship Configuration**
- Selectable ships from EVE Frontier database
- Configurable parameters:
  - Total Mass (kg)
  - Hull Mass (kg)
  - Base Capacitor (GJ)
  - Pilot Skill Level (0-5)
- Automatic heat recalculation on ship/config changes

### 4. **Gate Detection - NPC Stargates**
- Detects standard NPC stargate connections
- Zero jump heat on gate jumps
- Mapping loaded from R2 bucket (`npc_gates.json`)
- Bidirectional connections (both directions recognized)
- Display: `GATE (NPC)` in Jump column

### 5. **Gate Detection - Player SmartGates**
- Detects player-built SmartGate deployables
- Dynamically resolves from EVE Frontier World API
- Real-time data - reflects current game state
- Handles complex gate chains and nested assemblies
- Multiple gates per system supported
- Display: `GATE (PLAYER)` in Jump column with ⚠️ warning

### 6. **System Information**
- Solar system security status (SAFE, MODERATE, DANGEROUS, CRITICAL)
- Coldest point in system (location + distance from sun)
- Local heat values at system's coldest point
- System coordinates for distance calculations

### 7. **Route Result Display**
- Color-coded table with all route statistics
- Per-system breakdown:
  - System name and ID
  - Distance to next system (LY)
  - Local heat at coldest point
  - Jump heat generation
  - Post-jump heat level
  - Jump status (OK, FAIL, GATE, etc.)
  - Security status
- Total route statistics:
  - Total distance in light-years
  - Route completability status
  - Gate diagnostics

---

## Technical Architecture

### Frontend (Client)

**Stack:**
- HTML5 + CSS3 + JavaScript (Vanilla)
- No build process or dependencies
- Responsive design (desktop & mobile)

**Key Files:**
- `index.html` - Main UI
- `js/app.js` - Route calculator logic, UI rendering, ship data
- `js/player-gates.js` - Player gate resolution from Frontier API
- `css/styles.css` - Styling and responsive layouts

**Workflow:**
1. User enters system names (paste or manual input)
2. Client validates and normalizes system names
3. Sends batch request to `/api/systems` to resolve system IDs
4. Optional: Client calls `loadPlayerGates()` to pre-fetch SmartGate data
5. Sends route calculation request to `/api/route` with all parameters
6. Renders response in formatted table with color coding

### Backend (Cloudflare Worker)

**Stack:**
- Cloudflare Workers (V8 runtime)
- R2 bucket storage (npc_gates.json, player_gates.json, data_latest.json)
- EVE Frontier World API integration
- wrangler 4.62.0 CLI

**Key Files:**
- `workers/systems/worker.js` - Main worker logic
- `workers/systems/wrangler.toml` - Configuration and environment variables
- `workers/systems/npc_gates.json` - NPC stargate mappings
- `workers/systems/player_gates.json` - Test fixture for player gates

**API Endpoints:**

#### `GET /api/health`
Returns worker status.
```json
{ "status": "ok", "model": "arctangent-v1.0", "mae": 1.45 }
```

#### `GET /api/system?name=SYSTEM_NAME`
Returns single system details.
```json
{
  "system": {
    "id": 30004078,
    "name": "EMH-K56",
    "class": "B",
    "temp": 6136,
    "coldest": { "au": 4.98, "ls": 16048.0, "heat": 4.508 },
    "status": "SAFE",
    "coords": { "x": -1.14e16, "y": -4.25e15, "z": 7.56e19 }
  }
}
```

#### `POST /api/systems`
Returns batch of systems by name.
```json
{
  "names": ["EMH-K56", "IS0-B36"],
  "systems": [
    { "id": 30004078, "name": "EMH-K56", ... },
    { "id": 30004088, "name": "IS0-B36", ... }
  ]
}
```

#### `POST /api/route`
Calculates route with heat, gates, and diagnostics.

**Request:**
```json
{
  "names": ["EMH-K56", "IS0-B36"],
  "totalMass": 9750000,
  "hullMass": 9750000,
  "baseC": 2.0,
  "skillLevel": 0,
  "playerGates": {}
}
```

**Response:**
```json
{
  "route": [
    {
      "name": "EMH-K56",
      "id": 30004078,
      "low_heat": 4.508,
      "status": "SAFE",
      "jump_heat_gen": 0,
      "total_after_jump": 4.508,
      "can_jump": true,
      "gate": null
    },
    {
      "name": "IS0-B36",
      "id": 30004088,
      "gate": "player",
      "jump_heat_gen": 0,
      ...
    }
  ],
  "total_distance_ly": 40.108,
  "can_complete_route": true,
  "playerGateDiagnostics": {
    "found": 5,
    "skippedSystems": [],
    "authFailed": false,
    "rateLimited": false,
    "notes": []
  }
}
```

#### `GET /api/player-gates`
Returns cached player gate mapping.
```json
{
  "30004078": ["30004088"],
  "30004088": ["30004078"]
}
```

#### Admin Endpoints

**`POST /api/admin/upload-player-gates`** (requires `x-admin-token`)
Upload new player gates mapping to R2.

**`POST /api/admin/reload-player-gates`** (requires `x-admin-token`)
Clear cache and reload player gates from R2.

**`POST /api/admin/upload-npc-gates`** (requires `x-admin-token`)
Upload new NPC gates mapping to R2.

---

## Gate Detection System

### NPC Stargate Detection

**Data Source:** Static mapping in R2 bucket (`npc_gates.json`)

**Format:**
```json
{
  "30004052": ["30004036", "30004039"],
  "30004036": ["30004052"],
  "30004039": ["30004052"]
}
```

**Flow:**
1. Route handler loads `npc_gates.json` from R2 (cached)
2. For each jump `from → to`, checks if `npcGates[from]` contains `to`
3. If match found, sets `gate: "npc"` in route entry
4. Jump heat generation set to 0

**Examples:**
- URV-TP7 (30004052) ↔ O2T-5B7 (30004036): NPC gate
- EQT-0B7 (30004089) ↔ E54-JH6 (30004091): NPC gate

### Player SmartGate Detection

**Data Source:** EVE Frontier World API (dynamic)

**API Base:** `https://world-api-stillness.live.tech.evefrontier.com/v2`

**Resolution Process:**
1. Fetch solar system: `GET /solarsystems/{systemId}`
2. Extract `smartAssemblies[]` array
3. Filter for entries with `type: "SmartGate"` and `state: "online"`
4. For each gate, fetch: `GET /smartassemblies/{gateId}`
5. Resolve destination from:
   - `gate.inRange[0].solarSystem.id` (preferred)
   - `gate.destinationId` (fallback, may point to assembly)
6. Build mapping: `{ originSystemId: [destSystemId, ...] }`
7. Perform recursive resolution for nested assemblies (max depth: 8)

**Example Gate Resolution:**
```
System: EMH-K56 (30004078)
  ↓
SmartGate ID: 48709581531116426145958052549102551065438721...
  ↓
gate.inRange[0]:
  id: 67060191815183377112254342929446851059778740098...
  solarSystem.id: 30004088
  solarSystem.name: IS0-B36
  ↓
Result: 30004078 → 30004088
```

**Flow in Route Calculation:**
1. Route handler checks `body.playerGates` (client-supplied)
2. Falls back to R2 cache if not provided
3. Falls back to dynamic API resolution if needed
4. For each jump `from → to`, checks if `playerGates[from]` contains `to`
5. If match found, sets `gate: "player"` in route entry
6. Jump heat generation set to 0
7. Diagnostic info stored in `playerGateDiagnostics`

**Examples:**
- EMH-K56 (30004078) ↔ IS0-B36 (30004088): Player SmartGate
- UM4-056 (30004085) ↔ EMH-K56 (30004078): Player SmartGate

---

## Data Files & Storage

### R2 Bucket: `heatsense-data`

**Contents:**

1. **`data_latest.json`** (12.6 MB)
   - Master system database
   - Format: `{ "SYSTEM_NAME": [id, class, temp, radius, coldest_au, coldest_ls, heat, status, x, y, z], ... }`
   - 312,301 lines total
   - Updated periodically with latest game data

2. **`npc_gates.json`** (176 KB)
   - NPC stargate connections
   - Bidirectional mappings
   - Updated when server topology changes

3. **`player_gates.json`** (146 bytes test fixture)
   - Test/fallback mapping (only used if API unavailable)
   - Sample player gate entries
   - Real data comes from EVE Frontier API

4. **`npc_gates.sample.json`** (reference)

---

## Environment Configuration

**wrangler.toml:**
```toml
name = "systems-test"
main = "worker.js"
compatibility_date = "2026-01-29"

[observability]
enabled = true

[vars]
PLAYER_GATE_API = "https://world-api-stillness.live.tech.evefrontier.com/v2"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "heatsense-data"
```

**Worker Env Variables:**
- `PLAYER_GATE_API` - EVE Frontier World API base URL
- `PLAYER_GATE_TOKEN` - (optional) Bearer token for authenticated API access
- `PLAYER_GATE_MAX_SYSTEMS` - Max systems per request (default: 100)
- `PLAYER_GATE_CONCURRENCY` - Parallel API requests (default: 8)
- `PLAYER_GATE_RETRIES` - Retry attempts (default: 3)
- `ADMIN_TOKEN` - Admin authentication for upload/reload endpoints

---

## Performance & Caching

### Client-Side Caching
- Ship database cached in memory
- Player gates cached: `window.PLAYER_GATES`
- Last route results cached: `window.lastRouteResults`
- LocalStorage for user preferences

### Worker-Side Caching
- `cachedData` - System database (in-memory)
- `cachedNpcGates` - NPC stargate mappings (in-memory)
- `cachedPlayerGates` - Player SmartGates (in-memory)
- HTTP cache: `/api/systems` cached 24 hours
- HTTP cache: `/api/player-gates` cached 1 hour

### Optimization Strategies
- Concurrency limiting (max 8 parallel Frontier API requests)
- Exponential backoff with jitter for retries
- Early termination on auth failures (401/403)
- Batch system lookups (send multiple names once)
- Connection reuse via Fetch API

---

## Example Routes

### Route 1: Mixed NPC & Player Gates
```
EQT-0B7 → E54-JH6 (NPC) → UM4-056 (NPC) → EMH-K56 (Player) → IS0-B36 (Player)
```
All jumps: 0 heat generation, route completable

### Route 2: Long Jump with Heat
```
EQT-0B7 → EMH-K56 (regular jump, 376 LY) → IS0-B36
```
First jump requires heat calculation, rest via gates

---

## Testing

**Test Script:** `scripts/test_route.js`

```bash
node scripts/test_route.js
```

**Test Cases:**
1. Server-side gate resolution (dynamic API)
2. Client-supplied gate mapping validation

---

## Development

**Build & Deploy:**
```bash
cd workers/systems
npx wrangler deploy
```

**Upload Data to R2:**
```bash
npx wrangler r2 object put heatsense-data/npc_gates.json --file=npc_gates.json
npx wrangler r2 object put heatsense-data/data_latest.json --file=data_latest.json
```

**Admin Operations:**
```bash
# Upload player gates
curl -X POST \
  -H "x-admin-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @player_gates.json \
  https://systems-test.heatsense.workers.dev/api/admin/upload-player-gates

# Reload cached gates
curl -X POST \
  -H "x-admin-token: YOUR_TOKEN" \
  https://systems-test.heatsense.workers.dev/api/admin/reload-player-gates
```

---

## Browser Compatibility

- **Desktop:** Chrome, Firefox, Safari, Edge (all modern versions)
- **Mobile:** iOS Safari 13+, Android Chrome 80+
- **JavaScript:** ES6+ features used (no IE support)

---

## Known Limitations

1. **Player Gate Availability** - SmartGates are player-controlled and may go offline
2. **API Rate Limiting** - Frontier API has undocumented rate limits (handled with retries)
3. **Complex Gate Networks** - Nested assembly resolution limited to depth 8
4. **Real-Time Data** - Player gate data refreshes on each request (no persistent cache)

---

## Future Enhancements

- [ ] Route waypoint optimization
- [ ] Multi-route comparison
- [ ] Jump history tracking
- [ ] Gate maintenance alerts
- [ ] Preferred route profiles
- [ ] Export/import routes as JSON
- [ ] Integration with EVE Frontier client

---

## Support

**Issues:** Check browser console for errors  
**API Status:** `https://systems-test.heatsense.workers.dev/api/health`  
**Worker Version:** Embedded in health response (`model` field)

---

**Version:** 2.0  
**Last Updated:** 2026-02-04  
**Deployed:** Cloudflare Workers  
**Status:** ✅ Production Ready
