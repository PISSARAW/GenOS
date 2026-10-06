'use strict';

const assert = require('node:assert/strict');
const { consume } = require('../src/services/promotionVerifierNonceService');
const fixture = require('./helpers/promotionNonceFixture');

async function assertBindingFailures(db) {
  for (const overrides of [{ runId: 'other-run' }, { scopeId: 'other-scope' },
    { status: 'refuted' }, { status: 'inconclusive' }, { resultId: 'other-result' }, { nonces: [1] }]) {
    await assert.rejects(consume(db, await fixture.assembly(db, overrides)),
      { code: 'PROMOTION_RECEIPT_BINDING' });
    assert.equal(await fixture.nonceCount(db), 2);
  }
  await assert.rejects(consume(db, { promotion: {}, gateContext: { report: { claims: [{}] } } }),
    /persisted verifier assembly/);
  assert.deepEqual(await consume(db, { promotion: {}, gateContext: {} }), { consumed: 0 });
}

async function assertRollback(db, successful) {
  const firstNonce = 'rolled-back-first';
  const input = await fixture.assembly(db, { nonces: [firstNonce, successful.nonces[0]] });
  await assert.rejects(consume(db, input), { code: 'receipt_replay' });
  assert.equal(await db.get('SELECT nonce FROM verifier_receipt_nonces WHERE nonce = ?', firstNonce), undefined);
  assert.equal(await fixture.nonceCount(db), 2);
  await db.exec('PRAGMA query_only = ON');
  await assert.rejects(consume(db, successful), /readonly|durably consumed/i);
  assert.equal(await fixture.nonceCount(db), 2);
  await db.exec('PRAGMA query_only = OFF');
}

async function assertConcurrentReplay(db) {
  const fresh = await fixture.assembly(db);
  const outcomes = await Promise.allSettled([consume(db, fresh), consume(db, fresh)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(r => r.status === 'rejected' && r.reason.code === 'receipt_replay').length, 1);
  assert.equal(await fixture.nonceCount(db), 4);
}

async function run() {
  const oldSecret = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'test-p0-promotion-nonce-fixture';
  const db = await fixture.database();
  try {
    const successful = await fixture.assembly(db);
    assert.deepEqual(await consume(db, successful), { consumed: 2 });
    await assert.rejects(consume(db, successful), { code: 'receipt_replay' });
    await assertBindingFailures(db);
    await assertRollback(db, successful);
    await assertConcurrentReplay(db);
    await require('./helpers/promotionNonceConcurrency').assertSeparateConnections();
    await db.run("UPDATE strategy_execution_runs SET status = 'completed'");
    await assert.rejects(consume(db, await fixture.assembly(db)), { code: 'PROMOTION_RECEIPT_BINDING' });
    console.log('Promotion nonces: scope binding, signed negative outcomes, real SQLite rollback and concurrent replay on two connections passed.');
  } finally {
    await db.close();
    if (oldSecret === undefined) delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
    else process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = oldSecret;
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
