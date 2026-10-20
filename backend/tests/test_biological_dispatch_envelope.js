'use strict';

const assert = require('node:assert/strict');
const envelope = require('../src/services/topology/biologicalDispatchEnvelope.cjs');

function output(verdict) {
  return { orchestratorId: 'orchestrator-1', biologicalMode: {
    mode: 'biocenose', status: verdict === 'succeeded' ? 'completed' : verdict,
    complete: verdict === 'succeeded', completionContract: { verdict }
  } };
}

function verifiedEnvelope() {
  const result = envelope.build({ missionId: 'mission-1', mode: 'biocenose',
    output: output('succeeded') });
  assert.equal(result.schema, envelope.SCHEMA);
  assert.equal(result.verdict, 'succeeded');
  assert.equal(result.success, true);
  assert.equal(result.error, undefined);
}

function incompleteEnvelope() {
  for (const verdict of ['partial', 'failed']) {
    const result = envelope.build({ missionId: 'mission-2', mode: 'biocenose',
      output: output(verdict) });
    assert.equal(result.verdict, verdict);
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'BIOLOGICAL_MISSION_INCOMPLETE');
    const error = envelope.incompleteError(result);
    assert.equal(error.exitCode, 2);
    assert.deepEqual(error.stdoutEnvelope, result);
  }
}

function conservativeFallback() {
  const result = envelope.build({ missionId: 'mission-3', mode: 'biome',
    output: { biologicalMode: { status: 'completed', complete: false } } });
  assert.equal(result.verdict, 'partial');
  assert.equal(result.success, false);
}

verifiedEnvelope();
incompleteEnvelope();
conservativeFallback();
console.log('Biological dispatch envelope: PASS');
