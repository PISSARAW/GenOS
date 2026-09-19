'use strict';

const assert = require('node:assert/strict');
const { allocateByNovelty, taskFingerprint } = require('../src/services/epistemicScheduler');

function task(taskId, requiredCapabilities, novelty) {
  return {
    taskId,
    canonicalStatement: `Établir ${taskId}.`,
    assumptions: [],
    validityDomain: { statement: 'Domaine formel.', constraints: [] },
    dependencies: [],
    requiredCapabilities,
    novelty,
    estimatedTokens: 100,
  };
}

const algebra = task('algebra', ['algebra'], {
  semanticDistance: 0.9, obligationCoverage: 0.9, falsificationPotential: 0.4,
});
const routine = task('routine', ['analysis'], {
  semanticDistance: 0.2, obligationCoverage: 0.3, falsificationPotential: 0.2,
});
const agents = [
  { agentId: 'algebraist', capabilities: ['algebra'], availableTokens: 1000, evidenceIndependence: 0.8 },
  { agentId: 'analyst', capabilities: ['analysis'], availableTokens: 1000, evidenceIndependence: 0.6 },
  {
    agentId: 'familiar-algebraist', capabilities: ['algebra'], availableTokens: 1000,
    evidenceIndependence: 0.8, priorTaskFingerprints: [taskFingerprint(algebra)],
  },
  { agentId: 'reserved-verifier', capabilities: ['algebra'], availableTokens: 1000, evidenceIndependence: 1 },
];

const allocation = allocateByNovelty({
  tasks: [routine, algebra], agents, reservedAgentIds: ['reserved-verifier'], maxAssignments: 2,
});
assert.deepEqual(allocation.assignments.map((item) => [item.taskId, item.agentId]), [
  ['algebra', 'algebraist'],
  ['routine', 'analyst'],
]);
assert.equal(allocation.unassignedTaskIds.length, 0);
assert.equal(allocation.assignments[0].signals.capabilityFit, 1);
assert.equal(allocation.assignments.some((item) => item.agentId === 'reserved-verifier'), false);

const constrained = allocateByNovelty({ tasks: [routine, algebra], agents: agents.slice(0, 1), maxAssignments: 1 });
assert.equal(constrained.assignments.length, 1);
assert.equal(constrained.unassignedTaskIds.length, 1);

console.log('Epistemic scheduler novelty allocation passed.');
