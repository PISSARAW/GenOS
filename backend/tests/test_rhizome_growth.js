'use strict';

const assert = require('node:assert/strict');
const planner = require('../src/services/rhizome/growth/growthPlanner');

function gap() {
  return {
    gapId: 'gap:n1:v3', needId: 'n1', severity: 1, confidence: 1,
    evidence: { evidenceId: 'ev:n1:v3', needId: 'n1', graphVersion: 3, diagnosis: { reason: 'CAPABILITY_ABSENT' } }
  };
}

function candidate(candidateId, action, values = {}) {
  return {
    candidateId, action, targetNodeIds: [], expectedUtility: 0.9, creationCost: 0,
    coordinationCost: 0, duplicationRisk: 0, sufficient: true, evidenceRefs: ['ev:n1:v3'], ...values
  };
}

function run() {
  const session = { graphVersion: 3, budgets: { growth: 4 } };
  const candidates = [candidate('worker', 'SPAWN_WORKER'), candidate('bridge', 'BRIDGE', { creationCost: 0.2 })];
  const result = planner.plan({ session, gap: gap(), values: candidates });
  assert.equal(result.permitted, true);
  assert.equal(result.candidate.action, 'BRIDGE');

  const noEvidence = { ...gap(), evidence: undefined };
  assert.equal(planner.plan({ session, gap: noEvidence, values: candidates }).reason, 'GAP_EVIDENCE_REQUIRED');
  assert.equal(planner.plan({ session: { ...session, graphVersion: 4 }, gap: gap(), values: candidates }).reason, 'GAP_EVIDENCE_REQUIRED');

  const overBudget = candidate('expensive', 'BRIDGE', { creationCost: 10 });
  assert.equal(planner.plan({ session, gap: gap(), values: [overBudget] }).reason, 'NO_VIABLE_GROWTH');

  const weak = candidate('weak', 'REUSE', { expectedUtility: 0.1, duplicationRisk: 0.2 });
  assert.equal(planner.plan({ session, gap: gap(), values: [weak] }).reason, 'NO_VIABLE_GROWTH');
}

run();
console.log('Rhizome growth planner tests passed.');
