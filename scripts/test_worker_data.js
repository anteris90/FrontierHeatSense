/**
 * Test Worker Data Loading
 */

import { readFile } from 'fs/promises';

async function testData() {
  const data = JSON.parse(await readFile('./workers/systems/data.json', 'utf-8'));
  
  console.log('Testing system data format:\n');
  
  const systems = ['EC7-DLJ', 'U31-3FJ', 'AFQ-H7J'];
  
  for (const sys of systems) {
    const entry = data[sys];
    console.log(`${sys}:`);
    console.log(`  Found: ${entry ? 'YES' : 'NO'}`);
    if (entry) {
      console.log(`  Length: ${entry.length}`);
      console.log(`  ID: ${entry[0]}`);
      console.log(`  Has coords (length >= 11): ${entry.length >= 11}`);
      console.log(`  X (entry[8]): ${entry[8]}, isFinite: ${isFinite(entry[8])}`);
      console.log(`  Y (entry[9]): ${entry[9]}, isFinite: ${isFinite(entry[9])}`);
      console.log(`  Z (entry[10]): ${entry[10]}, isFinite: ${isFinite(entry[10])}`);
    }
    console.log();
  }
  
  // Test distance calculation
  const e1 = data['EC7-DLJ'];
  const e2 = data['U31-3FJ'];
  
  if (e1 && e2 && e1.length >= 11 && e2.length >= 11) {
    const dx = e2[8] - e1[8];
    const dy = e2[9] - e1[9];
    const dz = e2[10] - e1[10];
    const distM = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const distLY = distM / 9.46073e15;
    
    console.log(`Distance EC7-DLJ -> U31-3FJ:`);
    console.log(`  Meters: ${distM.toExponential(3)}`);
    console.log(`  Light-years: ${distLY.toFixed(2)}`);
    
    // Test heat calculation
    const totalMass = 79598125;
    const hullMass = 74655480;
    const baseC = 2.5;
    const skillLevel = 5;
    const effectiveC = baseC * (1 + skillLevel * 0.02);
    
    const jumpHeat = (3 * totalMass * distLY) / (effectiveC * hullMass);
    console.log(`  Jump heat: ${jumpHeat.toFixed(2)}`);
  }
}

testData();
