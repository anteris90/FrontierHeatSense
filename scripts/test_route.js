#!/usr/bin/env node
// Simple test harness: POST route payloads and assert gate detection
const DEFAULT_BASE = process.env.HEATSENSE_API || 'https://systems-test.heatsense.workers.dev';

async function getFetch() {
  if (typeof fetch === 'function') return fetch;
  try {
    const mod = await import('node-fetch');
    return mod.default || mod;
  } catch (e) {
    console.error('Fetch not available and node-fetch install failed. Use Node 18+ or set up node-fetch.');
    process.exit(2);
  }
}

async function run() {
  const fetch = await getFetch();
  const tests = [
    {
      name: 'EMH-K56 -> IS0-B36 (resolve server)',
      payload: { names: ['EMH-K56', 'IS0-B36'], resolvePlayerGates: true, totalMass: 9750000, hullMass: 9750000, baseC: 2, skillLevel: 0 },
      expectPlayerGate: true
    },
    {
      name: 'EMH-K56 -> IS0-B36 (client-supplied mapping)',
      payload: { names: ['EMH-K56', 'IS0-B36'], playerGates: { '30004078': ['30004088'] }, totalMass: 9750000, hullMass: 9750000, baseC: 2, skillLevel: 0 },
      expectPlayerGate: true
    }
  ];

  let failed = 0;
  for (const t of tests) {
    process.stdout.write(`Running: ${t.name} ... `);
    try {
      const res = await fetch(`${DEFAULT_BASE}/api/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t.payload) });
      const txt = await res.text();
      let data;
      try { data = JSON.parse(txt); } catch (e) { throw new Error(`Invalid JSON response: ${txt}`); }
      const hasPlayer = Array.isArray(data.route) && data.route.some(r => String(r.gate).toLowerCase() === 'player');
      if (t.expectPlayerGate && !hasPlayer) {
        console.error('FAIL (no player gate detected)');
        console.error('response:', JSON.stringify(data, null, 2));
        failed++;
      } else if (!t.expectPlayerGate && hasPlayer) {
        console.error('FAIL (unexpected player gate)');
        console.error('response:', JSON.stringify(data, null, 2));
        failed++;
      } else {
        console.log('OK');
      }
    } catch (err) {
      console.error('ERROR', err && err.message ? err.message : err);
      failed++;
    }
  }

  if (failed) {
    console.error(`${failed} test(s) failed`);
    process.exit(1);
  }
  console.log('All tests passed');
  process.exit(0);
}

run();
