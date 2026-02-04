/**
 * ui/ship-ui.js
 * 
 * Ship selector UI updates and display.
 * 
 * Responsibilities:
 * - Populate ship dropdown
 * - Display/hide ship details panel
 * - Update displayed values (C, mass, skill bonus)
 */

/**
 * Populate ship selection dropdown
 * 
 * @param {array} ships - Array of ship objects
 */
function populateShipSelect(ships) {
  const shipSelect = document.getElementById('shipSelect');
  if (!shipSelect) return;

  // Clear existing options (keep placeholder)
  while (shipSelect.options.length > 1) {
    shipSelect.remove(1);
  }

  // Add ship options
  for (const ship of ships) {
    const opt = document.createElement('option');
    opt.value = ship.name;
    opt.textContent = ship.name;
    shipSelect.appendChild(opt);
  }
}

/**
 * Show ship details panel
 */
function showShipDetails() {
  const shipDetails = document.getElementById('shipDetails');
  const shipBaseStats = document.getElementById('shipBaseStats');
  
  if (shipDetails) shipDetails.style.display = 'block';
  if (shipBaseStats) shipBaseStats.style.display = 'grid';
}

/**
 * Hide ship details panel
 */
function hideShipDetails() {
  const shipDetails = document.getElementById('shipDetails');
  if (shipDetails) shipDetails.style.display = 'none';
}

/**
 * Update displayed ship parameters
 * 
 * @param {object} ship - Selected ship object
 */
function updateShipDisplay(ship) {
  if (!ship) {
    hideShipDetails();
    return;
  }

  showShipDetails();

  const hullMassDisplay = document.getElementById('hullMassDisplay');
  const baseCDisplay = document.getElementById('baseCDisplay');
  const totalHullMassInput = document.getElementById('totalHullMass');

  if (hullMassDisplay) {
    hullMassDisplay.textContent = ship.hullMass.toLocaleString();
  }
  if (baseCDisplay) {
    baseCDisplay.textContent = ship.baseC.toFixed(3);
  }
  if (totalHullMassInput) {
    totalHullMassInput.value = ship.hullMass;
  }
}

/**
 * Update effective C display value
 * 
 * @param {number} effectiveC - Calculated effective C
 */
function updateEffectiveCDisplay(effectiveC) {
  const baseCDisplay = document.getElementById('baseCDisplay');
  if (baseCDisplay) {
    baseCDisplay.textContent = effectiveC.toFixed(3);
  }
}

/**
 * Update skill display values
 * 
 * @param {number} skillLevel - Current skill level
 * @param {number} bonus - Bonus percentage
 */
function updateSkillDisplay(skillLevel, bonus) {
  const skillValue = document.getElementById('skillValue');
  const skillBonus = document.getElementById('skillBonus');

  if (skillValue) skillValue.textContent = skillLevel;
  if (skillBonus) skillBonus.textContent = bonus;
}

/**
 * Reset skill slider to 0
 */
function resetSkillSlider() {
  const skillSlider = document.getElementById('skillSlider');
  if (skillSlider) skillSlider.value = 0;
}

export {
  populateShipSelect,
  showShipDetails,
  hideShipDetails,
  updateShipDisplay,
  updateEffectiveCDisplay,
  updateSkillDisplay,
  resetSkillSlider
};
