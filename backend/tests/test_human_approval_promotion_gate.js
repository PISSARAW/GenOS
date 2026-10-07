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

function signed(runId) {
  const payload = { runId, timestamp: Date.now(), signerId: 'consumer-reviewer' };
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
    const missing = await approve(spec.run.id, {});
    assert.equal(missing.status, 403);
    assert.match(missing.body.error.message, /Missing cryptographic signature/);
    const invalid = await approve(spec.run.id, { ...signed(spec.run.id), signature: '0'.repeat(64) });
    assert.equal(invalid.status, 403);
    const bare = await approve(spec.run.id, signed(spec.run.id));
    assert.equal(bare.status, 409, 'A valid human signature does not supply execution evidence');
    assert.match(bare.body.error.message, /without an evidence report/);
    assert.equal((await spec.db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', spec.run.id)).status, 'awaiting_approval');
    const verified = await approve(spec.run.id, { ...signed(spec.run.id), ...spec.options });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.status, 'completed');
    assert.equal((await approve(spec.run.id, { ...signed(spec.run.id), ...spec.options })).status, 409);
    console.log('Human approval: signature alone refused; actual evidence replicas pass; completed run cannot be promoted again.');
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

