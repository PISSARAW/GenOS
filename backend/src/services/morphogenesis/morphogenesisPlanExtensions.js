'use strict';

/**
 * MorphogenesisPlan extensions (G18/G19) : le plan n'est plus seulement
 * topologique — il couvre cognition, physiologie, développement,
 * procédures, perception, ressources, résilience, relations, mémoire.
 */

const crypto = require('crypto');

const NEW_DIMENSIONS = [
  'cognitiveChanges', 'strategyChanges', 'developmentalChanges',
  'epigeneticChanges', 'proceduralChanges', 'attentionChanges',
  'sensorChanges', 'resourceAllocations', 'resilienceChanges',
  'communicationChanges', 'relationChanges', 'memoryTransitions',
  'epistemicObjectives', 'leaseChanges'
];

function extendPlan(opts) {
  const o = opts ?? {};
  const plan = o.plan ?? {};
  ensureDims(plan);
  fillDims(plan, o);
  plan.receipt = receiptFor(plan, o);
  return plan;
}

function ensureDims(plan) {
  for (const dim of NEW_DIMENSIONS) {
    if (!Array.isArray(plan[dim])) plan[dim] = [];
  }
}

function fillDims(plan, o) {
  const pairs = [
    ['resourceAllocations', o.metabolic],
    ['resilienceChanges', o.resilience],
    ['developmentalChanges', o.developmental],
    ['proceduralChanges', o.procedural],
    ['attentionChanges', o.perception]
  ];
  for (const pair of pairs) applyPair(plan, pair);
}

function applyPair(plan, pair) {
  const key = pair[0];
  const value = pair[1];
  if (value) {
    if (plan[key].length === 0) plan[key] = value;
  }
}

function receiptFor(plan, o) {
  const payload = receiptPayload(plan, o);
  return {
    hash: crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16),
    at: new Date().toISOString(),
    pressures: o.pressures ?? {},
    explainer: o.explainer ?? 'epistemic+memory+cognitive+strategy+metabolic+developmental+resilience+procedural'
  };
}

function receiptPayload(plan, o) {
  const dims = NEW_DIMENSIONS.map((d) => (plan[d] ?? []).length);
  return JSON.stringify({ topo: plan.topologyChanges, dims, reason: o.reason ?? plan.reason });
}

module.exports = { extendPlan, NEW_DIMENSIONS };
