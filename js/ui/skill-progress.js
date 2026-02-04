/**
 * ui/skill-progress.js
 *
 * Shared helper for rendering the Adaptive slider progress bar.
 */
function setSkillProgress(skillLevel) {
  const slider = document.getElementById('skillSlider');
  if (!slider) return;
  const normalized = Math.max(0, Math.min(10, Number(skillLevel) || 0));
  const percent = `${(normalized / 10) * 100}%`;
  slider.style.setProperty('--skill-progress', percent);
}

export { setSkillProgress };
