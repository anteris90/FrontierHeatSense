# Archive

This folder keeps legacy files that are no longer part of the active HeatSense runtime or the cycle-5 data update workflow.

## Active update path

- Generate system data with `scripts/generate_data_c5.py`
- Local active worker dataset: `workers/systems/data-c5.json`
- Upload to remote R2 from `workers/systems/` with `npm run upload:data:c5`
- Reload worker cache with `POST /api/admin/reload-data`
- Deploy preview worker with `npm run deploy:preview`
- Deploy production worker with `npm run deploy`

## Archived folders

- `legacy-runtime/`: superseded client or worker files kept for reference
- `legacy-data/`: previous worker data snapshots kept for rollback/reference

## Notes

- Production and preview now both read the cycle-5 dataset name: `data-c5.json`
- Files here should not be used by the live app unless they are intentionally restored