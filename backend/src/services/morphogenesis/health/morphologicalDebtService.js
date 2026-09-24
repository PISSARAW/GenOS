'use strict';

const DEBT_SIGNALS = Object.freeze({
  crossBoundaryTraffic: 0.2, handoffFailures: 0.2, duplicateWork: 0.15,
  idleAgents: 0.1, stateCoupling: 0.2, coordinationOverhead: 0.15
});

function normalized(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function assessMorphologicalDebt(metrics = {}) {
  const components = Object.fromEntries(Object.entries(DEBT_SIGNALS).map(([key, weight]) => [key, normalized(metrics[key]) * weight]));
  const score = Object.values(components).reduce((sum, value) => sum + value, 0);
  return { kind: 'STRUCTURAL_DEBT', score, components, reevaluationRecommended: score >= 0.3 };
}

module.exports = { DEBT_SIGNALS, assessMorphologicalDebt };
