/**
 * Test Route with Ship Parameters
 */

const url = 'http://127.0.0.1:8787/api/route';

const body = {
  names: ['EC7-DLJ', 'U31-3FJ', 'AFQ-H7J'],
  totalMass: 79598125,
  hullMass: 74655480,
  baseC: 2.5,
  skillLevel: 5
};

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})
.then(r => r.json())
.then(data => {
  console.log('🗺️ Route WITH ship params (Reflex, max skill):');
  console.log(`Total systems: ${data.route.length}\n`);
  
  data.route.forEach((r, i) => {
    const flags = [];
    if (r._detour) flags.push('🔀 DETOUR');
    if (r._excluded) flags.push('❌ EXCLUDED');
    if (r._noDetourAvailable) flags.push('⚠️ NO_DETOUR');
    
    const flagStr = flags.length ? ` ${flags.join(' ')}` : '';
    const heatStr = r.jump_heat_gen !== null ? `${r.jump_heat_gen.toFixed(2)} heat` : 'no jump';
    const totalStr = r.total_after_jump !== null ? `, total: ${r.total_after_jump.toFixed(2)}` : '';
    
    console.log(`${i+1}. ${r.name} - ${heatStr}${totalStr}${flagStr}`);
    
    if (r._detourFrom) {
      console.log(`   Detour from ${r._detourFrom} around ${r._detourAround}`);
    }
  });
})
.catch(e => console.error('Error:', e.message));
