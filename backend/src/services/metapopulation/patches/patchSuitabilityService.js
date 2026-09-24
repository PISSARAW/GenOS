'use strict';
function assessSuitability(patch, requirements = []) {
  if (!patch || ['UNAVAILABLE', 'QUARANTINED'].includes(patch.status)) return { suitable: false, score: 0, missing: requirements };
  const missing = requirements.filter((key) => !Object.prototype.hasOwnProperty.call(patch.resources || {}, key));
  const score = Number(((missing.length ? 0 : 1) * patch.quality * patch.accessibility).toFixed(3));
  return { suitable: missing.length === 0 && patch.carryingCapacity > 0, score, missing };
}
module.exports = { assessSuitability };
