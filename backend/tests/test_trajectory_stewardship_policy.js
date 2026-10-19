'use strict';

const assert = require('node:assert/strict');
const policy = require('../src/services/trajectoryStewardshipPolicyService');

function input(overrides = {}) {
  const base = {
    agentId: 'agent-steward', mandateRef: 'mandate:product', projectId: 'project-1',
    domains: ['product', 'runtime'],
    trajectory: { objectiveRef: 'objective:retention', observationRef: 'shev:42',
      gap: 0.8, uncertainty: 0.1, learningPotential: 0.4, observationAgeMs: 1000 },
    permissions: { act: true, observe: true, learn: true, explicitWriteLease: true },
    budget: { remainingTokens: 1000 },
    policy: { maxObservationAgeMs: 5000, actThreshold: 0.7,
      uncertaintyThreshold: 0.6, learnThreshold: 0.65,
      actTokens: 500, observeTokens: 100, learnTokens: 250 }
  };
  return { ...base, ...overrides,
    trajectory: { ...base.trajectory, ...(overrides.trajectory || {}) },
    permissions: { ...base.permissions, ...(overrides.permissions || {}) },
    budget: { ...base.budget, ...(overrides.budget || {}) },
    policy: { ...base.policy, ...(overrides.policy || {}) } };
}

const act = policy.arbitrate(input());
assert.equal(act.mode, 'ACT');
assert.equal(act.reason, 'external-objective-gap');
assert.equal(act.goal.objectiveRef, 'objective:retention');
assert.deepEqual(act.goal.domains, ['product', 'runtime']);
assert.equal(policy.arbitrate(input()).goal.goalId, act.goal.goalId, 'same evidence must replay the same goal');

const observe = policy.arbitrate(input({ trajectory: { observationAgeMs: 6000 } }));
assert.equal(observe.mode, 'OBSERVE');
assert.equal(observe.goal.observationRef, 'shev:42');

const learn = policy.arbitrate(input({ trajectory: { gap: 0.2, learningPotential: 0.8 } }));
assert.equal(learn.mode, 'LEARN');

const denied = policy.arbitrate(input({ permissions: { explicitWriteLease: false } }));
assert.deepEqual({ mode: denied.mode, candidate: denied.candidate, reason: denied.reason },
  { mode: 'NO_CHANGE', candidate: 'ACT', reason: 'permission-denied:act' });
assert.equal(denied.goal, null);

const poor = policy.arbitrate(input({ budget: { remainingTokens: 499 } }));
assert.equal(poor.mode, 'NO_CHANGE');
assert.equal(poor.reason, 'budget-insufficient:act');

const stable = policy.arbitrate(input({ trajectory: { gap: 0.2, learningPotential: 0.2 } }));
assert.equal(stable.mode, 'NO_CHANGE');
assert.equal(stable.reason, 'trajectory-within-policy');

assert.throws(() => policy.arbitrate(input({ domains: [] })),
  (error) => error.code === 'TRAJECTORY_STEWARDSHIP_INVALID');
assert.throws(() => policy.arbitrate(input({ trajectory: { uncertainty: 2 } })),
  (error) => error.code === 'TRAJECTORY_STEWARDSHIP_INVALID');

console.log('Trajectory stewardship policy tests passed.');
