/**
 * Test script for detour functionality
 * 
 * Tests route calculation with systems that would cause jump failures,
 * verifying that detours are properly calculated and inserted.
 */

// Test route with expected heat failures
const testRoute = {
  names: [
    'Assilur',     // Starting point
    'Takahariya',  // Should cause high heat jump
    'Makala'       // Destination
  ]
};

const WORKER_URL = 'http://localhost:8787';

async function testDetourFunctionality() {
  console.log('=== Testing Detour Functionality ===\n');
  console.log('Test Route:', testRoute.names.join(' → '));
  console.log('\nShip Configuration:');
  console.log('  - Ship: Rabbit (Scout)');
  console.log('  - Hull Mass: 74655480 kg');
  console.log('  - Total Mass: 79598125 kg');
  console.log('  - Base C: 2.5');
  console.log('  - Skill Level: 0');
  console.log('\n--- Testing Route Calculation ---\n');

  try {
    const requestBody = {
      names: testRoute.names,
      totalMass: 79598125,
      hullMass: 74655480,
      baseC: 2.5,
      skillLevel: 0
    };

    const response = await fetch(`${WORKER_URL}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Route calculation failed:', errorData.error || response.statusText);
      return;
    }

    const data = await response.json();
    
    console.log('✅ Route calculation successful\n');
    console.log('Route Analysis:');
    console.log('  - Total Distance:', data.total_distance_ly?.toFixed(2), 'LY');
    console.log('  - Can Complete Route:', data.can_complete_route);
    console.log('  - Route Entries:', data.route?.length || 0);
    console.log('\nDetailed Route Breakdown:\n');

    let hasDetours = false;
    let hasExcluded = false;

    for (let i = 0; i < data.route.length; i++) {
      const entry = data.route[i];
      const isDetour = entry._detour === true;
      const isExcluded = entry._excluded === true;
      
      if (isDetour) hasDetours = true;
      if (isExcluded) hasExcluded = true;

      const prefix = isDetour ? '  🔀 [DETOUR]' : (isExcluded ? '  ❌ [EXCLUDED]' : `  ${i + 1}.`);
      
      console.log(`${prefix} ${entry.name}`);
      console.log(`     - System Heat: ${entry.low_heat?.toFixed(2) || '?'}`);
      console.log(`     - Status: ${entry.status}`);
      
      if (i > 0) {
        console.log(`     - Jump Distance: ${entry.distance_ly?.toFixed(2) || '?'} LY`);
        console.log(`     - Jump Heat Gen: ${entry.jump_heat_gen?.toFixed(2) || '?'}`);
        console.log(`     - Total After Jump: ${entry.total_after_jump?.toFixed(2) || '?'}`);
        console.log(`     - Can Jump: ${entry.can_jump !== null ? entry.can_jump : 'unknown'}`);
        if (entry.gate) {
          console.log(`     - Gate Type: ${entry.gate.toUpperCase()}`);
        }
      }
      
      if (isDetour && entry._detourRejoinDistance) {
        console.log(`     - Rejoin Distance: ${entry._detourRejoinDistance?.toFixed(2)} LY`);
        console.log(`     - Rejoin Heat: ${entry._detourRejoinHeat?.toFixed(2)}`);
      }
      
      console.log('');
    }

    console.log('=== Test Results ===');
    console.log(`Detours Found: ${hasDetours ? '✅ YES' : '❌ NO'}`);
    console.log(`Excluded Systems: ${hasExcluded ? '✅ YES' : '❌ NO'}`);
    console.log(`Route Completable: ${data.can_complete_route ? '✅ YES' : '❌ NO'}`);

    if (hasDetours && hasExcluded) {
      console.log('\n✅ DETOUR SYSTEM WORKING CORRECTLY');
    } else {
      console.log('\nℹ️  No detours were needed for this route (all jumps feasible)');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error);
  }
}

// Alternative test with a known problematic route
async function testProblematicRoute() {
  console.log('\n\n=== Testing High-Heat Route ===\n');
  
  const problematicRoute = {
    names: ['Abaim', 'Yiratal', 'Ashara', 'Osoggur']
  };
  
  console.log('Test Route:', problematicRoute.names.join(' → '));
  console.log('\n--- Calculating Route ---\n');

  try {
    const requestBody = {
      names: problematicRoute.names,
      totalMass: 79598125,
      hullMass: 74655480,
      baseC: 2.5,
      skillLevel: 0
    };

    const response = await fetch(`${WORKER_URL}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Route calculation failed:', errorData.error || response.statusText);
      return;
    }

    const data = await response.json();
    
    console.log('✅ Route calculation successful\n');
    
    const detours = data.route.filter(e => e._detour);
    const excluded = data.route.filter(e => e._excluded);
    
    console.log(`Total Systems: ${data.route.length}`);
    console.log(`Detours: ${detours.length}`);
    console.log(`Excluded: ${excluded.length}`);
    console.log(`Can Complete: ${data.can_complete_route ? 'YES' : 'NO'}`);
    
    if (detours.length > 0) {
      console.log('\nDetour Systems:');
      detours.forEach(d => {
        console.log(`  - ${d.name} (Heat: ${d.low_heat.toFixed(2)})`);
      });
    }
    
    if (excluded.length > 0) {
      console.log('\nExcluded Systems:');
      excluded.forEach(e => {
        console.log(`  - ${e.name} (Heat: ${e.low_heat.toFixed(2)})`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run tests
(async () => {
  try {
    await testDetourFunctionality();
    await testProblematicRoute();
  } catch (error) {
    console.error('Test suite error:', error);
  }
})();
