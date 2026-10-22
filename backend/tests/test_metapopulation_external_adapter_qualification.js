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

  const solverValid = await qualification.qualifySolverAdapter(async () => ({
    demeId: 'deme-a', solverId: 'sat', problemRef: 'problem-1', seed: 'seed-1',
    objective: 0.9, incumbentRef: 'inc-1', evidenceRef: 'evidence-1', provenance: { solver: 'external' },
    counterexampleRefs: [], iterations: 10
  }));
  assert.equal(solverValid.qualified, true);

  const solverMissing = await qualification.qualifySolverAdapter(async () => ({ demeId: 'deme-a' }));
  assert.equal(solverMissing.qualified, false);

  const fitnessValid = await qualification.qualifyFitnessEvaluator(async () => ({ fitness: 0.7, evidenceRef: 'fitness-evidence', provenance: { evaluator: 'external' } }));
  assert.equal(fitnessValid.qualified, true);

  const receipt = await qualification.qualifyAdapterReceiptReplay({
    adapterName: 'migrationAdapter',
    invoke: async (context) => ({ receiptId: 'receipt-1', idempotencyKey: context.idempotencyKey }),
    context: { metapopulationId: 'session-1' },
    idempotencyKey: 'key-1'
  });
  assert.equal(receipt.qualified, true);

  const nonReplayed = await qualification.qualifyAdapterReceiptReplay({
    adapterName: 'migrationAdapter',
    invoke: async (context) => ({ receiptId: Math.random().toString(), idempotencyKey: context.idempotencyKey }),
    context: { metapopulationId: 'session-1' },
    idempotencyKey: 'key-2'
  });
  assert.equal(nonReplayed.qualified, false);
  assert.equal(nonReplayed.reason, 'RECEIPT_NOT_REPLAYED');

  console.log('Metapopulation external adapter qualification: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });