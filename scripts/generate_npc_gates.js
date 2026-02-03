#!/usr/bin/env node
// Generate NPC gates mapping from db/stargates.csv
// Usage: node scripts/generate_npc_gates.js [inputCsv] [outputJson]

const fs = require('fs');
const path = require('path');

const inFile = process.argv[2] || path.join(__dirname, '..', 'db', 'stargates.csv');
const outFile = process.argv[3] || path.join(__dirname, '..', 'workers', 'systems', 'npc_gates.json');

function readCSVSync(p) {
  return fs.readFileSync(p, 'utf8');
}

function main() {
  if (!fs.existsSync(inFile)) {
    console.error('Input CSV not found:', inFile);
    process.exit(2);
  }

  const txt = readCSVSync(inFile);
  const lines = txt.split(/\r?\n/);
  if (lines.length <= 1) {
    console.error('CSV appears empty or only header');
    process.exit(2);
  }

  // header: stargate_id,solar_system_id,destination_stargate_id,destination_system_id,...
  lines.shift(); // drop header

  const map = Object.create(null);

  for (const raw of lines) {
    if (!raw || raw.trim() === '') continue;
    // naive CSV split (works for this export where fields don't contain commas)
    const cols = raw.split(',');
    if (cols.length < 4) continue;
    const fromSys = cols[1].trim();
    const toSys = cols[3].trim();
    if (!fromSys || !toSys) continue;

    map[fromSys] = map[fromSys] || new Set();
    map[fromSys].add(toSys);
    map[toSys] = map[toSys] || new Set();
    map[toSys].add(fromSys);
  }

  const out = Object.create(null);
  for (const k of Object.keys(map)) out[k] = Array.from(map[k]);

  // ensure output directory exists
  const dir = path.dirname(outFile);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote', outFile, 'with', Object.keys(out).length, 'systems');
}

main();
