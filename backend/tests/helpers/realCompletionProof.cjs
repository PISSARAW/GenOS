'use strict';
const assert = require('node:assert/strict');
const fixture = require('./realWorkerFixture.cjs');
const store = require('../../src/services/biologicalWorkerStore');
async function realCompletionProof() {
  const value = await fixture.fixture({ 'task.txt': 'Produce source-bound evidence for a completion adapter.' });
  try {
    const result = await fixture.dispatch(value, { payload: { methodContract: {
      version: 1, methodId: 'scoped_procedure', parameters: { procedure: {
        version: 1, methodId: 'subset_sum', parameters: { values: [2, 3, 7], target: 5 }
      } }
    } } });
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const binding = await value.db.get('SELECT * FROM biological_worker_bindings ORDER BY rowid DESC LIMIT 1');
    const receipt = await store.receipt(value.db, binding.run_id);
    assert.equal(receipt.semanticVerification.accepted, true);
    assert.equal(receipt.oracleExecution.costs.processes, 2);
    delete receipt.payloadHash;
    return receipt;
  } finally { await fixture.close(value); }
}
module.exports = { realCompletionProof };
