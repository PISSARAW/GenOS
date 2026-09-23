'use strict';

/**
 * MetabolicPressure (G6) : abondance -> exploration ; pression ->
 * halving, silence, freeze, cryptobiose. Connecté à régulation+morphogenèse.
 */

function pressureLevel(opts) {
  const o = opts || {};
  const ratio = ratioOf(o);
  if (ratio >= 0.7) return 'abundance';
  if (ratio >= 0.4) return 'moderate';
  if (ratio >= 0.15) return 'severe';
  return 'critical';
}

function ratioOf(o) {
  const remain = Number(o.remaining) || 0;
  const total = Number(o.total) || 1;
  return Math.max(0, Math.min(1, remain / Math.max(1, total)));
}

function morphologyHint(opts) {
  const level = pressureLevel(opts);
  if (level === 'abundance') return { hint: 'explore', branches: 'expand', portfolio: 'large' };
  if (level === 'moderate') return { hint: 'successive_halving', branches: 'reduce', portfolio: 'focused' };
  if (level === 'severe') return { hint: 'freeze_low_priority', branches: 'consolidate', network: 'silence' };
  return { hint: 'cryptobiosis', branches: 'freeze_all', network: 'silent' };
}

module.exports = { pressureLevel, morphologyHint };
