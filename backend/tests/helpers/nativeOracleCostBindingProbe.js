'use strict';

const assert = require('node:assert/strict');
const journal = require('../../src/services/epistemic/nativeOracleJournal');

async function qualify(db) {
  const original = journal.append;
  let injected = false;
  journal.append = (connection, input) => {
    if (input.kind !== 'attestation') return original(connection, input);
    const changed = structuredClone(input);
    delete changed.record.costs.complete;
    injected = true;
    return original(connection, changed);
  };
  let checked;
  try { checked = await require('./nativeOracleFailureProbes').subsetDispatch(db); }
  finally { journal.append = original; }
  assert.equal(injected, true);
  assert.equal(checked.row.guardrail_reason, 'ORACLE_COST_BINDING_MISMATCH');
  const attestation = await journal.read(db, { ...checked.request, kind: 'attestation' });
  assert.equal(attestation.value.costs.complete, undefined);
  const allocation = await journal.read(db, { ...checked.request, kind: 'reservation' });
  const costs = await require('../../src/services/epistemic/nativeOracleExecutionJournal').costs(db, { allocation });
  assert.equal(costs.complete, true);
  assert.equal(costs.processes, 2);
  await assert.rejects(require('../../src/services/epistemic/nativeOracleProof').read(db,
    { ...checked.request, reference: { eventId: attestation.eventId, hash: attestation.hash } }),
  { code: 'ORACLE_COST_BINDING_MISMATCH' });
  assert.equal(await journal.read(db, { ...checked.request, kind: 'acceptance' }), null);
  const receipt = await require('../../src/services/biologicalWorkerStore').receipt(db, checked.row.id);
  assert.equal(receipt.result.verified, false);
  assert.deepEqual(receipt.oracleExecution.costs, costs);
  console.log('Valid ledger authentication cannot hide a missing measured-cost field in a new attestation.');
}

module.exports = { qualify };
