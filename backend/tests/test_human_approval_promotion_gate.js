'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { closeDatabase } = require('../src/db');
const controller = require('../src/controllers/strategyExecutionController');
const signatureService = require('../src/services/promotionSignatureService');

async function approve(runId, body) {
  const response = { status: 200, body: null };
  const res = { status(code) { response.status = code; return res; }, json(data) { response.body = data; return res; } };
  await controller.approve({ params: { runId }, body, user: { username: 'consumer-reviewer' } }, res);
  return response;
}

function signed(runId, payloadHash) {
  const payload = { runId, timestamp: Date.now(), signerId: 'consumer-reviewer', payloadHash };
  return { ...payload, signature: signatureService.generateSignature(payload) };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-consumer-human-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD ||= 'consumer-human-test-only';
  process.env.GENOS_PROMOTION_SECRET = 'consumer-human-test-only';
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'consumer-human-test-only';
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  try {
    const spec = await require('./helpers/consumerPromotionFixture.cjs').prepare(root);
    const digest = await require('../src/services/strategyExecutionService').getPromotionApprovalDigest(spec.db, spec.run.id);
    spec.options.humanApprovalReceipt.approverId = 'consumer-reviewer';
    spec.options.humanApprovalReceipt.payloadHash = digest;
    const missing = await approve(spec.run.id, {});
    assert.equal(missing.status, 403);
    assert.match(missing.body.error.message, /Missing cryptographic signature/);
    const invalid = await approve(spec.run.id, { ...signed(spec.run.id, digest), humanApprovalReceipt: spec.options.humanApprovalReceipt, signature: '0'.repeat(64) });
    assert.equal(invalid.status, 403);
    const changed = await approve(spec.run.id, { ...signed(spec.run.id, digest), ...spec.options,
      humanApprovalReceipt: { ...spec.options.humanApprovalReceipt, payloadHash: '0'.repeat(64) } });
    assert.equal(changed.status, 403, 'A signature cannot be reused with a changed approval digest');
    const futureTimestamp = Date.now() + 6 * 60 * 1000;
    assert.throws(() => signatureService.validateSignature({ runId: spec.run.id, timestamp: futureTimestamp,
      signerId: 'consumer-reviewer', payloadHash: digest },
    signatureService.generateSignature({ runId: spec.run.id, timestamp: futureTimestamp,
      signerId: 'consumer-reviewer', payloadHash: digest })), /expired/);
    const bare = await approve(spec.run.id, signed(spec.run.id, digest));
    assert.equal(bare.status, 403, 'A valid signature without a receipt cannot approve the promotion');
    assert.match(bare.body.error.message, /current promotion digest/);
    assert.equal((await spec.db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', spec.run.id)).status, 'awaiting_approval');
    const verified = await approve(spec.run.id, { ...signed(spec.run.id, digest), ...spec.options });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.status, 'completed');
    const repeated = await approve(spec.run.id, { ...signed(spec.run.id, digest), ...spec.options });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.id, verified.body.id);
    assert.equal((await spec.db.get("SELECT count(*) AS n FROM primitive_execution_journal WHERE agent_id = 'consumer-promotion-agent'")).n, 2);
    console.log('Human approval: signature alone refused; actual evidence replicas pass; completed retry returns the same run without another pipeline.');
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
