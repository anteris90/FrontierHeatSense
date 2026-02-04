/**
 * services/ship-manager.js
 * 
 * Ship selection and configuration management.
 * 
 * Responsibilities:
 * - Load ships from ship database
 * - Track selected ship and its properties
 * - Calculate skill bonuses
 * - Manage ship UI state
 */

let SHIPS = [];
let selectedShip = null;

/**
 * Load ships from database
 * @returns {Promise<array>} Array of ship objects
 */
async function loadShips() {
  try {
    const response = await fetch('./db/ships.json');
    if (!response.ok) return [];
    const data = await response.json();
    SHIPS = Array.isArray(data) ? data : [];
    return SHIPS;
  } catch (err) {
    console.warn('Failed to load ships:', err);
    return [];
  }
}

/**
 * Get all available ships
 * @returns {array} Ship objects
 */
function getShips() {
  return SHIPS;
}

/**
 * Select a ship by name
 * @param {string} shipName - Ship name to select
 * @returns {object|null} Selected ship or null
 */
function selectShip(shipName) {
  if (!shipName) {
    selectedShip = null;
    return null;
  }
  selectedShip = SHIPS.find(s => s.name === shipName) || null;
  return selectedShip;
}

/**
 * Get currently selected ship
 * @returns {object|null} Selected ship or null
 */
function getSelectedShip() {
  return selectedShip;
}

/**
 * Check if ship is selected
 * @returns {boolean}
 */
function hasShipSelected() {
  return selectedShip !== null;
}

/**
 * Calculate effective C value with skill bonus
 * effectiveC = baseC * (1 + skillLevel * 0.02)
 * 
 * @param {number} skillLevel - Skill level (0-100)
 * @returns {number} Effective C value, or 0 if no ship selected
 */
function calculateEffectiveC(skillLevel) {
  if (!selectedShip) return 0;
  return selectedShip.baseC * (1 + skillLevel * 0.02);
}

/**
 * Calculate skill bonus percentage
 * bonusPercent = skillLevel * 2
 * 
 * @param {number} skillLevel - Skill level (0-100)
 * @returns {number} Bonus percentage
 */
function calculateSkillBonus(skillLevel) {
  return skillLevel * 2;
}

/**
 * Get ship parameters for route calculation
 * @param {number} skillLevel - Pilot skill level
 * @param {number} totalHullMass - Ship mass with cargo
 * @returns {object|null} {hullMass, totalHullMass, baseC, C} or null
 */
function getShipParameters(skillLevel, totalHullMass) {
  if (!selectedShip) return null;
  
  const skill = Math.max(0, Math.min(100, Number(skillLevel) || 0));
  const mass = Math.max(selectedShip.hullMass, Number(totalHullMass) || selectedShip.hullMass);
  
  return {
    hullMass: selectedShip.hullMass,
    totalHullMass: mass,
    baseC: selectedShip.baseC,
    skillLevel: skill,
    C: calculateEffectiveC(skill)
  };
}

export {
  loadShips,
  getShips,
  selectShip,
  getSelectedShip,
  hasShipSelected,
  calculateEffectiveC,
  calculateSkillBonus,
  getShipParameters
};
