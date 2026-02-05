/**
 * Test Detour Functionality (Worker-Side)
 * 
 * Tests detour detection with production worker
 */

const WORKER_URL = 'http://127.0.0.1:8787/api/route';

// Reflex ship parameters (max skill level)
const REFLEX_MAX_SKILL = {
  totalMass: 79598125,  // Total hull mass
  hullMass: 74655480,   // Hull mass
  baseC: 2.5,           // Base C-value
  skillLevel: 5         // Max skill level (5)
};

/**
 * Test route from user's example: EC7-DLJ → U31-3FJ → AFQ-H7J
 * Expected: Jump to U31-3FJ should fail with 161.89 heat, detour should be found
 */
async function testDetourRoute() {
  console.log('🧪 Testing detour route: EC7-DLJ → U31-3FJ → AFQ-H7J');
  console.log('Ship: Reflex with max skill level (5)\n');
  
  const body = {
    names: ['EC7-DLJ', 'U31-3FJ', 'AFQ-H7J'],
    ...REFLEX_MAX_SKILL
  };
  
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    
    console.log('📊 Full Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n');
    
    console.log('📊 Route Response:');
    console.log(`Total systems in route: ${data.route.length}`);
    console.log(`Can complete route: ${data.can_complete_route}`);
    console.log(`Total distance: ${data.total_distance_ly?.toFixed(2)} LY\n`);
    
    console.log('🗺️ Route Details:');
    data.route.forEach((entry, idx) => {
      const flags = [];
      if (entry._detour) flags.push('DETOUR');
      if (entry._excluded) flags.push('EXCLUDED');
      if (entry._noDetourAvailable) flags.push('NO_DETOUR');
      
      const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
      const heatStr = entry.jump_heat_gen ? ` Heat: ${entry.jump_heat_gen.toFixed(2)}` : '';
      const detourInfo = entry._detourFrom ? ` (detour from ${entry._detourFrom} around ${entry._detourAround})` : '';
      
      console.log(`${idx + 1}. ${entry.name}${flagStr}${heatStr}${detourInfo}`);
      
      if (entry.jump_heat_gen > 149) {
        console.log(`   ⚠️ FAILED JUMP - Heat exceeds 149!`);
      }
    });
    
    // Check for detour indicators
    const hasDetour = data.route.some(e => e._detour);
    const hasExcluded = data.route.some(e => e._excluded);
    const hasNoDetour = data.route.some(e => e._noDetourAvailable);
    
    console.log('\n✅ Test Results:');
    console.log(`Detour found: ${hasDetour ? 'YES ✓' : 'NO ✗'}`);
    console.log(`System excluded: ${hasExcluded ? 'YES ✓' : 'NO ✗'}`);
    console.log(`No detour available: ${hasNoDetour ? 'YES ✓' : 'NO ✗'}`);
    
    if (hasDetour) {
      console.log('\n🎉 SUCCESS: Detour system detected!');
    } else if (hasNoDetour) {
      console.log('\n⚠️ WARNING: No detour found (marked as _noDetourAvailable)');
    } else {
      console.log('\n❌ FAIL: No detour flags found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

// Run test
testDetourRoute();
