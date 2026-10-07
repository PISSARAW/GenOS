'use strict';

const assert = require('node:assert/strict');
const fixture = require('./promotionNonceFixture');
const { consume } = require('../../src/services/promotionVerifierNonceService');
const { readAssembly } = require('../../src/services/aeisAssemblyStore');

async function main() {
  const input = JSON.parse(process.argv[2]);
  const db = await fixture.connect(input.filename);
  try {
    const saved = await readAssembly(db, input.assemblyId);
    assert.equal(saved.runId, input.runId);
    await assert.rejects(consume(db, { promotion: { runId: input.runId, agentId: input.agentId },
      gateContext: { aeisEvaluation: { persistedAssemblyId: input.assemblyId } } }), { code: 'receipt_replay' });
    const run = await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', input.runId);
    const count = await fixture.nonceCount(db);
    assert.equal(run.status, 'awaiting_approval');
    assert.equal(count, 2);
    console.log('Consumer promotion: new process preserves consumed nonces and refuses replay after downstream failure: PASS');
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
