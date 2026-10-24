'use strict';

const assert = require('node:assert/strict');
const { executionMission, missingMissionCriteria } = require('../src/services/aTeam/execution/teamEvidenceService');

const criterion = 'Chaque worker connait les deux autres workers.';
const prompt = executionMission({ mission: 'Inspect peer identity.' }, [criterion]);

assert.match(prompt, /copy each evaluated criterion string exactly/);
assert.match(prompt, /Do not translate, summarize or paraphrase/);
assert.match(prompt, /set localPassed=true/);
assert.match(prompt, /every promoted worker provides a backed localPassed=true/);
assert.match(prompt, /must also appear in claims\[\]\.evidence/);
assert.match(prompt, /rejects evaluation references that the report does not independently back/);
assert.ok(prompt.includes(JSON.stringify(criterion)));
assert.match(prompt, /Add these exact root fields/);
assert.match(prompt, /acceptanceEvaluations/);

const handoffPrompt = executionMission({ mission: 'Review.', handoffContext: [{
  handoffId: 'author->critic:1', digest: 'abc123', version: 1
}] }, [criterion]);
assert.match(handoffPrompt, /integrationConstraints/);
assert.match(handoffPrompt, /handoffEvaluations/);
assert.match(handoffPrompt, /author->critic:1/);
assert.match(handoffPrompt, /do not recalculate or guess the digest/);
assert.match(handoffPrompt, /verify any git:<sha> input against the current workspace HEAD/);

function verdict(worker, evaluation, refs = [`evidence:${worker}`]) {
  return { promoted: true, evidenceRefs: refs,
    report: { acceptanceEvaluations: [{ criterion, evidenceRefs: refs, ...evaluation }] } };
}

const localTeam = new Map([
  ['worker-a', verdict('worker-a', { passed: null, localPassed: true })],
  ['worker-b', verdict('worker-b', { passed: null, localPassed: true })],
  ['worker-c', verdict('worker-c', { passed: null, localPassed: true })]
]);
assert.deepEqual(missingMissionCriteria([criterion], localTeam), []);

localTeam.set('worker-c', verdict('worker-c', { passed: null, localPassed: false }));
assert.deepEqual(missingMissionCriteria([criterion], localTeam), [criterion]);

const globalProof = new Map([
  ['worker-a', verdict('worker-a', { passed: true })],
  ['worker-b', verdict('worker-b', { passed: null })]
]);
assert.deepEqual(missingMissionCriteria([criterion], globalProof), []);

const unbacked = new Map([
  ['worker-a', { promoted: true, evidenceRefs: ['different:ref'], report: {
    acceptanceEvaluations: [{ criterion, localPassed: true, evidenceRefs: ['claimed:ref'] }]
  } }]
]);
assert.deepEqual(missingMissionCriteria([criterion], unbacked), [criterion]);
console.log('A-Team mission prompt preserves canonical acceptance criteria.');
