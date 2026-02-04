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
  // Hardcoded ships data for now
  const data = [
    {"name":"HAF","hullMass":81883000,"baseC":2.5},
    {"name":"LORHA","hullMass":31369320,"baseC":2.5},
    {"name":"MAUL","hullMass":548435920,"baseC":2.5},
    {"name":"MCF","hullMass":52313760,"baseC":2.5},
    {"name":"TADES","hullMass":74655480,"baseC":2.5},
    {"name":"USV","hullMass":30266600,"baseC":1.8},
    {"name":"RECURVE","hullMass":10400000,"baseC":1.0},
    {"name":"REFLEX","hullMass":9750000,"baseC":2.0},
    {"name":"REIVER","hullMass":10200000,"baseC":1.0},
    {"name":"CAROM","hullMass":7200000,"baseC":8.5},
    {"name":"STRIDE","hullMass":7900000,"baseC":8.0},
    {"name":"CHUMAQ","hullMass":1739489520,"baseC":3.0}
  ];
  SHIPS = data;
  return SHIPS;
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
  
  // Get values from DOM if not provided
  const skill = skillLevel !== undefined ? Math.max(0, Math.min(100, Number(skillLevel) || 0)) : Number(document.getElementById('skillSlider')?.value) || 0;
  const mass = totalHullMass !== undefined ? Math.max(selectedShip.hullMass, Number(totalHullMass) || selectedShip.hullMass) : Number(document.getElementById('totalHullMass')?.value) || selectedShip.hullMass;
  
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
