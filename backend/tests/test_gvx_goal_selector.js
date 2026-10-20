'use strict';

const assert = require('node:assert/strict');
const { SIGNAL_NAMES, selectGoals } = require('../src/services/gvxGoalSelector');

const scope = { organizationId: 'org-magellan', projectId: 'project-atlas' };

function signal(value, ref) {
  return { value, sourceRefs: [ref] };
}

function candidate(goalId, values = {}, estimatedCost = 1) {
  const signals = Object.fromEntries(SIGNAL_NAMES.map((name) => [name,
    signal(values[name] || 0, `${goalId}:${name}`)]));
  return { goalId, estimatedCost, signals,
    provenance: { candidateRef: `candidate:${goalId}:v1`, observedAt: '2026-10-19T09:00:00.000Z' } };
}

function input(candidates, authority) {
  return { scope, candidates, authority, maxCost: 10, maxGoals: 2 };
}

async function rejectsLearningProgressMonoculture() {
  const result = await selectGoals(input([
    candidate('learning-only', { learningProgress: 1 }),
    candidate('project-critical', { projectNeed: 0.9, trajectoryGap: 0.8, risk: 0.9,
      opportunity: 0.3, uncertainty: 0.4, learningProgress: 0.1 })
  ], { isAllowed: async () => true }));
  assert.equal(result.selected[0].goalId, 'project-critical');
  const learning = result.evaluations.find((item) => item.goalId === 'learning-only');
  const critical = result.evaluations.find((item) => item.goalId === 'project-critical');
  assert.ok(critical.score.utility > learning.score.utility);
}

async function treatsPermissionAsHardGate() {
  const calls = [];
  const result = await selectGoals(input([
    candidate('denied-best', Object.fromEntries(SIGNAL_NAMES.map((name) => [name, 1]))),
    candidate('allowed', { projectNeed: 0.8, trajectoryGap: 0.7, risk: 0.6 })
  ], { isAllowed: async (goalId, context) => {
    calls.push({ goalId, context });
    return goalId !== 'denied-best';
  } }));
  assert.equal(result.evaluations[0].status, 'permission_denied');
  assert.deepEqual(result.selected.map((item) => item.goalId), ['allowed']);
  assert.equal(calls[0].context.permission, 'goal:propose');
  assert.deepEqual(calls[0].context.scope, scope);
}

async function makesInactionExplicit() {
  const result = await selectGoals(input([
    candidate('noise', {})
  ], { isAllowed: async () => true }));
  assert.equal(result.decision, 'NO_CHANGE');
  assert.equal(result.noChange.selected, true);
  assert.deepEqual(result.selected, []);
  assert.equal(result.evaluations[0].status, 'no_change_dominates');
}

async function preservesBoundariesAndProvenance() {
  const result = await selectGoals(input([
    candidate('traceable', { projectNeed: 0.9, risk: 0.8 })
  ], { isAllowed: async () => true }));
  const selected = result.selected[0];
  assert.equal(result.autonomousExecution, false);
  assert.equal(result.promotionAuthorized, false);
  assert.equal(selected.execution, 'requires_external_dispatch');
  assert.equal(selected.promotion, 'requires_independent_evidence');
  assert.equal(selected.epistemicStatus, 'hypothesis');
  assert.equal(selected.provenance.candidateRef, 'candidate:traceable:v1');
  assert.equal(selected.evidenceRefs.length, SIGNAL_NAMES.length);
}

async function appliesBudgetAndDeterministicTieBreak() {
  const shared = { projectNeed: 0.9, trajectoryGap: 0.8, risk: 0.7 };
  const result = await selectGoals({ ...input([
    candidate('goal-b', shared, 6), candidate('goal-a', shared, 6)
  ], { isAllowed: async () => true }), maxGoals: 2 });
  assert.deepEqual(result.selected.map((item) => item.goalId), ['goal-a']);
  assert.equal(result.remainingCost, 4);
}

async function exposesRejectedCostAndMalformedEvidence() {
  const costly = await selectGoals(input([
    candidate('too-costly', { projectNeed: 1, risk: 1 }, 11)
  ], { isAllowed: async () => true }));
  assert.equal(costly.evaluations[0].status, 'budget_exceeded');
  const malformed = candidate('malformed', { projectNeed: 1 });
  malformed.signals.projectNeed.sourceRefs = [];
  await assert.rejects(selectGoals(input([malformed], { isAllowed: async () => true })), {
    code: 'GVX_GOAL_SELECTION_INVALID'
  });
}

async function main() {
  await rejectsLearningProgressMonoculture();
  await treatsPermissionAsHardGate();
  await makesInactionExplicit();
  await preservesBoundariesAndProvenance();
  await appliesBudgetAndDeterministicTieBreak();
  await exposesRejectedCostAndMalformedEvidence();
  console.log('GVX multi-signal goal selector checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
