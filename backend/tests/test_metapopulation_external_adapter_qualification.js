'use strict';

const assert = require('node:assert/strict');
const qualification = require('../src/services/metapopulation/runtime/externalAdapterQualificationService');

async function run() {
  const missing = await qualification.qualifyExternalAdapter('evaluateColonization', null);
  assert.equal(missing.qualified, false);
  assert.equal(missing.reason, 'ADAPTER_NOT_FUNCTION');

  const invalid = await qualification.qualifyExternalAdapter('evaluateColonization', async () => ({ viable: true, fitness: null, provenance: { evaluator: 'local' } }));
  assert.equal(invalid.qualified, false);
  assert.equal(invalid.reason, 'INVALID_FITNESS');

  const noProvenance = await qualification.qualifyExternalAdapter('evaluateColonization', async () => ({ viable: true, fitness: 0.8 }));
  assert.equal(noProvenance.qualified, false);
  assert.equal(noProvenance.reason, 'MISSING_PROVENANCE');

  const valid = await qualification.qualifyExternalAdapter('evaluateColonization', async () => ({ viable: true, fitness: 0.8, provenance: { evaluator: 'external' } }));
  assert.equal(valid.qualified, true);
  assert.equal(valid.reason, null);

  const unknown = await qualification.qualifyExternalAdapter('otherAdapter', async () => ({}));
  assert.equal(unknown.qualified, true);

  const thrown = await qualification.qualifyExternalAdapter('evaluateColonization', async () => { throw new Error('boom'); });
  assert.equal(thrown.qualified, false);
  assert.equal(thrown.reason, 'boom');

  console.log('Metapopulation external adapter qualification: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });