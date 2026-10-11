'use strict';
const assert = require('node:assert/strict');
const { fixtures } = require('./helpers/nativeWorkerFixtures');
const { runCandidates } = require('../src/services/agents/workerCandidateExecutor');

const method = fixtures('D:/GenOS-attention-tests/creative-attention').creative_worker;
const original = runCandidates(method).output;
assert.equal(original.candidate, 'color: green; layout: grid');
assert.deepEqual(original.selectedEvidence, ['design://native/color', 'design://native/layout']);

const reordered = structuredClone(method);
reordered.parameters.dimensions[0].options.reverse();
reordered.parameters.dimensions[1].options.reverse();
reordered.parameters.evidence.reverse();
assert.equal(runCandidates(reordered).output.candidate, original.candidate);

const newGoal = structuredClone(method);
newGoal.parameters.goal = 'decorative compact dashboard';
assert.equal(runCandidates(newGoal).output.candidate, 'color: blue; layout: grid');
console.log('Creative worker changes selection with the goal, not input order.');
