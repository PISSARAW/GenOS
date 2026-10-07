'use strict';

const assert = require('node:assert/strict');
const journal = require('../../src/services/epistemic/nativeOracleJournal');
const store = require('../../src/services/aeisAssemblyStore');
const receipts = require('../../src/services/epistemicVerifierReceiptService');

async function qualify(db, context) {
  const original = store.saveAssembly;
  let injected = false;
  store.saveAssembly = async (database, assessed, scope) => {
    const altered = structuredClone(assessed);
    const receipt = altered.assembly.verifications[0];
    assert.equal(receipt.executionEvidence[0].subject.artifactContentHash, context.method.parameters.expectedContentHash);
    receipt.executionEvidence[0].postconditions.coverage.checkedCases = 1;
    altered.assembly.verifications[0] = receipts.issueReceipt(receipt);
    injected = true;
    return original(database, altered, scope);
  };
  let checked;
  try { checked = await require('../test_native_code_completion').dispatch(db, context.method); }
  finally { store.saveAssembly = original; }
  assert.equal(injected, true);
  assert.equal(checked.result.success, false);
  assert.equal(checked.row.status, 'blocked');
  assert.equal(checked.row.guardrail_reason, 'ORACLE_RECEIPT_BINDING_MISMATCH');
  const attested = await journal.read(db, { ...checked.request, kind: 'attestation' });
  assert.equal(attested.value.accepted, true, 'the deliberately inconsistent authenticated assembly claims success');
  assert.equal(attested.value.costs.processes, 2);
  const saved = await store.readAssembly(db, attested.value.assemblyId);
  const first = saved.evaluation.assembly.verifications[0];
  assert.equal(receipts.validateReceipt(first, saved.manifest.trustedDigests), true);
  assert.equal(first.executionEvidence[0].postconditions.coverage.checkedCases, 1);
  assert.equal(await journal.read(db, { ...checked.request, kind: 'acceptance' }), null);
  const nonceTable = await db.get("SELECT name FROM sqlite_master WHERE name='verifier_receipt_nonces'");
  if (nonceTable) assert.equal((await db.all('SELECT nonce FROM verifier_receipt_nonces')).length, 0);
  const biological = await require('../../src/services/biologicalWorkerStore').receipt(db, checked.row.id);
  assert.equal(biological.result.verified, false);
  assert.deepEqual(biological.oracleExecution.costs, attested.value.costs);
  console.log('Authentic signed coverage of one case cannot promote a claim covering 264 cases; costs retained and nonces unused.');
}

module.exports = { qualify };
