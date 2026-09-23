'use strict';

/**
 * RecoveryPlanner : ordonne containment -> degraded -> recovery -> verify.
 * Intervient après chaque anomalie et avant morphogenèse radicale.
 */

const { classify } = require('./failureClassifierService');

function planRecovery(opts) {
  const o = opts || {};
  const cls = classify({ error: o.error });
  const steps = [{ step: 'contain', action: cls.action }];
  steps.push(selectRecoveryStep(cls, o));
  steps.push({ step: 'verify', action: 'independent_check' });
  return { classification: cls, steps, budget: o.budget || 5000 };
}

function selectRecoveryStep(cls, o) {
  if (cls.kind === 'transient') return { step: 'recover', action: 'retry_bounded' };
  if (cls.kind === 'crash') return { step: 'recover', action: 'checkpoint_restore' };
  if (cls.kind === 'substrate') return { step: 'recover', action: 'degraded_mode' };
  return { step: 'recover', action: o.preferred || 'successor' };
}

module.exports = { planRecovery };
