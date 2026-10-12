'use strict';

const assert = require('node:assert/strict');
const { modelClaimMatches } = require('../src/services/routeMissionOutcomeBridge');

const digest = `sha256:${'a'.repeat(64)}`;
const run = { id: 'run-1' };
const measured = { attempt: { id: 'attempt-1', action_id: 'action-1' }, outputDigest: digest };

function proof(overrides = {}) {
  const modelOutput = { schema: 'genos.model-oracle-output/v1', encoding: 'utf8-raw-text',
    runId: run.id, actionId: measured.attempt.action_id,
    routeAttemptId: measured.attempt.id, digest, ...overrides };
  return { oracleDomain: 'model_subset_sum',
    assembly: { results: [{ evidence: { content: { modelOutput } } }] } };
}

assert.equal(modelClaimMatches(proof(), run, measured), true,
  'The structural binding accepts the exact observed output and oracle claim');
assert.equal(modelClaimMatches({ ...proof(), oracleDomain: 'subset_sum' }, run, measured), false,
  'A native procedure claim cannot qualify a model response');
for (const mismatch of [
  { digest: `sha256:${'b'.repeat(64)}` },
  { runId: 'other-run' },
  { actionId: 'other-action' },
  { routeAttemptId: 'other-attempt' },
  { encoding: 'canonical-json' },
  { schema: 'genos.model-oracle-output/v0' }
]) {
  assert.equal(modelClaimMatches(proof(mismatch), run, measured), false);
}
assert.equal(modelClaimMatches({ ...proof(), assembly: { results: [] } }, run, measured), false);
assert.equal(modelClaimMatches({ ...proof(), assembly: { results: [
  ...proof().assembly.results, ...proof().assembly.results] } }, run, measured), false);

console.log('Model output must be exactly bound to a dedicated oracle claim: passed');
