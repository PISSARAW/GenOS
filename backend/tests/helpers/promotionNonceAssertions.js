'use strict';

const assert = require('node:assert/strict');
const gate = require('../../src/services/strategyPromotionGate');

async function assertConsumedBeforePipeline(db, evaluation) {
  const expected = evaluation.assembly.verifications.filter(r => r.independent === true);
  assert.ok(expected.length >= 2, 'The real fixture must produce independent verifier receipts');
  for (const receipt of expected) {
    const stored = await db.get('SELECT nonce FROM verifier_receipt_nonces WHERE nonce = ?', receipt.nonce);
    assert.equal(stored?.nonce, receipt.nonce, 'Every independent receipt must be consumed before pipeline effects');
  }
}

async function withNonceAssertion(db, approve) {
  const original = gate.runPromotionPipeline;
  let observed = false;
  gate.runPromotionPipeline = async (promotion, primitives, evaluation) => {
    await assertConsumedBeforePipeline(db, evaluation);
    observed = true;
    return original(promotion, primitives, evaluation);
  };
  try {
    const result = await approve();
    assert.equal(observed, true, 'The real promotion pipeline must run');
    return result;
  } finally {
    gate.runPromotionPipeline = original;
  }
}

async function withNonceWriteFailure(db, approve) {
  const original = gate.runPromotionPipeline;
  let invoked = false;
  gate.runPromotionPipeline = async (...args) => {
    invoked = true;
    return original(...args);
  };
  try {
    await db.exec(`CREATE TRIGGER reject_nonce BEFORE INSERT ON verifier_receipt_nonces
      BEGIN SELECT RAISE(ABORT, 'nonce storage denied'); END;`);
    await assert.rejects(approve, /durably consumed/);
    assert.equal(invoked, false, 'Nonce storage failure must stop the real pipeline');
  } finally {
    gate.runPromotionPipeline = original;
    await db.exec('DROP TRIGGER IF EXISTS reject_nonce');
  }
}

module.exports = { withNonceAssertion, withNonceWriteFailure };
