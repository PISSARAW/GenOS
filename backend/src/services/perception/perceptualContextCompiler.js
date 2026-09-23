'use strict';

/**
 * PerceptualContextCompiler : compile sensorium + modèle + affordances
 * en bloc compact injectable dans le prompt (budgeté).
 */

function compilePerceptualContext(opts) {
  const o = opts || {};
  const sensorium = o.sensorium || {};
  const lines = [];
  lines.push(`Focus: ${sensorium.activeFocus ? sensorium.activeFocus.sensorId : 'none'}`);
  lines.push(`Observations: ${(sensorium.observations || []).length}`);
  lines.push(`Affordances: ${(sensorium.affordances || []).map((a) => a.action || a).join(', ') || 'none'}`);
  const text = lines.join('\n');
  const max = Number.isFinite(o.maxChars) ? o.maxChars : 1500;
  return { text: text.slice(0, max), truncated: text.length > max };
}

module.exports = { compilePerceptualContext };
