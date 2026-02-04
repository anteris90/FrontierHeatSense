// Dev test: validate normalizeSystemName + input-order rehydration
// Run: node dev/test_normalization.js

function normalizeSystemName(name) {
  if (!name) return '';
  let s = String(name).normalize('NFKD');
  s = s.replace(/\p{M}/gu, '');
  s = s.replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-');
  s = s.replace(/[^\p{L}\p{N}\-\s]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim().toUpperCase();
  s = s.replace(/\s*-\s*/g, '-');
  return s;
}

function parseSystemInput(input) {
  let text = input;
  // strip simple HTML tags
  text = text.replace(/<[^>]*>/g, ' ');
  // drop summary lines like E31-937 → AVQ-9F6
  text = text
    .split('\n')
    .filter(line => !/^[A-Z0-9]{2,5}-[A-Z0-9]{2,5}\s*→\s*[A-Z0-9]{2,5}-[A-Z0-9]{2,5}$/i.test(line.trim()))
    .join('\n');

  // normalize diacritics & dashes
  text = text.normalize('NFKD').replace(/\p{M}/gu, '');
  text = text.replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-');

  const regex = /\b[A-Z0-9]+(?:[-:.|][A-Z0-9]+)+\b/gi;
  const matches = text.match(regex) || [];
  const systems = [];
  for (const m of matches) {
    const n = normalizeSystemName(m);
    if (!systems.includes(n)) systems.push(n);
  }
  return systems;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// Sample messy pasted input
const pasted = `E31-937 → AVQ-9F6\nO3H–1FN, i9t-0fn\n
OFC-3FN (Gate)\n`;

const parsed = parseSystemInput(pasted);
console.log('Parsed input order:', parsed);

// Mock API systems (shuffled order, varied formatting)
const apiSystems = [
  { id: 1, name: 'ofc-3fn', coords: {}, class: 'G', temp: 5000, radius_km: 700000, status: 'SAFE', coldest: { au: 1, ls: 0, heat: 10 } },
  { id: 2, name: 'I9T–0FN', coords: {}, class: 'K', temp: 4200, radius_km: 600000, status: 'DANGEROUS', coldest: { au: 2, ls: 0, heat: 60 } },
  { id: 3, name: 'O3H-1FN', coords: {}, class: 'M', temp: 3200, radius_km: 500000, status: 'MODERATE', coldest: { au: 3, ls: 0, heat: 30 } }
];

// shuffle to simulate unordered API
shuffle(apiSystems);
console.log('Mock API order:', apiSystems.map(s => s.name));

// Emulate frontend mapping logic
const systemMap = new Map();
for (const s of apiSystems) {
  systemMap.set(normalizeSystemName(s.name), s);
}

const reconstructed = [];
for (const name of parsed) {
  const s = systemMap.get(normalizeSystemName(name));
  if (!s) {
    reconstructed.push({ name, error: 'not found' });
  } else {
    reconstructed.push(normalizeSystemName(s.name));
  }
}

console.log('Reconstructed order:', reconstructed);

// Assert reconstructed equals parsed
const reconstructedNames = reconstructed.map(x => (typeof x === 'string' ? x : x.name));
const ok = JSON.stringify(reconstructedNames) === JSON.stringify(parsed);
console.assert(ok, 'Order mismatch: reconstructed != parsed');
if (ok) console.log('TEST PASSED: ordering preserved after mapping');
else console.log('TEST FAILED');
