# HeatSense AI Coding Guidelines

## Project Overview
**HeatSense** is an EVE Frontier heat prediction system deployed as a Cloudflare Worker + static site combo. It uses the **Arctangent v1.0 model** to predict star system temperatures across 24,023 systems with 1.45 MAE accuracy.

## Architecture

### Components
1. **Frontend** (`index.html`, `index_dev.html`): Single-page app with batch search, debug mode, and route heat analysis
2. **Cloudflare Worker** (`workers/systems/worker.js`): API layer serving system data from R2 bucket
3. **Data** (`workers/systems/data.json`): 312K-line JSON with 24,023 systems in compact array format
4. **Static Outputs** (`dangerous-systems.html`): Pre-generated high-heat system catalog

### Data Flow
- Frontend queries Worker API endpoints (`/api/system`, `/api/route`, `/api/highheat`)
- Worker loads `data.json` from Cloudflare R2 bucket (cached per request)
- System data stored as compact arrays: `[id, class, temp_K, radius_km, au, ls, heat, status, x_coord, y_coord, z_coord]`
- Heat formula: `H(D) = 99.02 · (2/π) · arctan((π/2) · λ / D)` where `λ = K · T^α · R^β`

## Key Patterns

### API Endpoints
- **`GET /api/system?name=SYSTEM_NAME`**: Returns single system object with all fields
- **`POST /api/route`**: Takes `{names[], totalMass, hullMass, baseC, skillLevel}`, returns route with jump heat calculations
- **`GET /api/highheat`**: Returns all 342 systems with heat ≥ 85, sorted by heat descending

### Data Indexing Convention
In `data.json`, compact array format (all numeric except index/key):
- Index 0: System ID
- Index 1: Star class (B/A/F/G/K/M)
- Index 2: Temperature (Kelvin)
- Index 3: Radius (km)
- Index 4: AU distance to coldest point
- Index 5: LS distance to coldest point
- Index 6: **Heat value** (0-100 scale) - primary metric
- Index 7: Status (S/M/D/C = Safe/Moderate/Dangerous/Critical)
- Indices 8-10: 3D coordinates in light-years

### Heat Status Categories
- `S` / **SAFE**: Heat < 40
- `M` / **MODERATE**: Heat 40-80
- `D` / **DANGEROUS**: Heat 80-90
- `C` / **CRITICAL**: Heat 90+ (TRAP systems)

### Route Calculation Logic
Jump heat generated = `(3 × totalMass × distance_LY) / (effectiveC × hullMass)`
- `effectiveC = baseC × (1 + skillLevel × 0.02)` (skill bonus capped at 2% per level)
- Total heat after jump = system's coldest_heat + jump_heat_gen
- Safe threshold: total ≤ 150 heat

## Deployment

### Build & Deploy
- Deployment script: `deploy.sh` - handles git checks, Worker deployment via Wrangler
- Worker deployment: `cd workers/systems && wrangler deploy`
- R2 bucket binding: `R2_BUCKET` in `wrangler.toml` points to `heatsense-data`
- Frontend deployed separately to Cloudflare Pages: `https://heatsense.pages.dev/`

### Environment
- **Node.js version**: Check `wrangler.toml` compatibility_date (currently 2026-01-29)
- **Worker format**: ES modules (uses `export default`)
- **CORS**: Enabled on all endpoints for cross-origin requests

## Common Modifications

### Adding/Updating Systems
Edit `workers/systems/data.json` entry structure - maintain compact array format. Re-run `deploy.sh` to push R2 bucket update.

### Adjusting Model Parameters
Update constants in `worker.js`:
- `V` = version string (used in responses)
- `M` = MAE metric
- `K`, `α`, `β` parameters are hardcoded in formula if needed (currently implicit in arctangent formula)

### Frontend Changes
Keep inline CSS in `<style>` tag. Test locally via `index_dev.html`. Both versions share same API structure.

## Testing & Validation
- Model tested on 520 measurements across all 6 star classes
- Validation metrics: 97% predictions within ±5 Heat, 69.1% within ±2 Heat
- High-heat list contains 342 systems with heat ≥ 85 (use this for edge case testing)
