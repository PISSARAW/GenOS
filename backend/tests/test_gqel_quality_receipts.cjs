'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'gqel-quality-receipt-fixture-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { create } = require('./helpers/qualityReceiptFixture.cjs');
const service = require('../src/services/qualityElevation/qualityReceiptService');
const enforcer = require('../src/services/qualityElevation/workerQualityContractEnforcer');
const { digest } = require('../src/services/qualityElevation/qualityContract');
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function report(ctx, receipt) { return { output: ctx.text, qualityElevationReceipt: receipt }; }
async function issued(ctx) { return service.issueQualityReceipt(ctx); }

test('signed persisted assessment survives a fresh Node process', async ctx => {
  const receipt = await issued(ctx);
  assert.equal(enforcer.enforceQualityContract(ctx.worker, report(ctx, receipt), null).passed, true);
  assert.equal(receipt.authorizesMissionPromotion, false);
  const inputPath = path.join(ctx.root, 'restart.json');
  await fs.writeFile(inputPath, JSON.stringify({ database: path.join(ctx.root, 'control.sqlite'), worker: ctx.worker, text: ctx.text }));
  const restarted = await execFile(process.execPath, [path.join(__dirname, 'helpers/qualityReceiptRestart.cjs'), inputPath]);
  assert.equal(JSON.parse(restarted.stdout).passed, true);
  assert.equal(JSON.parse(restarted.stdout).sessionId, ctx.result.session.sessionId);
});

test('an arbitrary copied assessment cannot be issued', async ctx => {
  const result = JSON.parse(JSON.stringify(ctx.result));
  await assert.rejects(service.issueQualityReceipt({ ...ctx, result }), { code: 'GQEL_UNTRUSTED_EVALUATION' });
});

test('registered workers require signed delivery proof even in the issuing process', async ctx => {
  enforcer.bindQualityResult(ctx.worker, ctx.result);
  assert.throws(() => enforcer.enforceQualityContract(ctx.worker, { output: ctx.text }, null), { code: 'WORKER_QUALITY_ELEVATION_FAILED' });
});

test('tampered assessment, signature and content fail closed', async ctx => {
  const receipt = await issued(ctx);
  const changed = JSON.parse(JSON.stringify(receipt));
  changed.evaluation.overallScore = 101;
  assert.throws(() => enforcer.enforceQualityContract(ctx.worker, report(ctx, changed), null), { code: 'GQEL_RECEIPT_INVALID' });
  assert.throws(() => enforcer.enforceQualityContract(ctx.worker, report(ctx, { ...receipt, signature: '0'.repeat(64) }), null), { code: 'GQEL_RECEIPT_INVALID' });
  assert.throws(() => enforcer.enforceQualityContract(ctx.worker, { output: ctx.text + ' altered', qualityElevationReceipt: receipt }, null), { code: 'GQEL_STALE_EVALUATION' });
});

test('cross-worker, cross-run, mission and authority replays are rejected', async ctx => {
  const receipt = await issued(ctx);
  const variants = [{ agentId: 'other' }, { executionRunId: 'other-run' }, { missionId: 'other-mission' },
    { executionAuthorityRef: { hash: '0'.repeat(64) } }];
  for (const variant of variants) assert.throws(() => enforcer.enforceQualityContract({ ...ctx.worker, ...variant }, report(ctx, receipt), null), { code: 'GQEL_RECEIPT_SCOPE_MISMATCH' });
});

test('unsealed executions cannot issue a receipt', async ctx => {
  const worker = { ...ctx.worker, executionAuthorityRef: null };
  await assert.rejects(service.issueQualityReceipt({ ...ctx, worker }), { code: 'GQEL_RECEIPT_AUTHORITY_REQUIRED' });
});

test('expired signed receipts and missing independent run scope cannot authorize delivery', async ctx => {
  const receipt = await issued(ctx);
  const { signature: ignored, ...body } = receipt;
  const expired = require('../src/services/qualityElevation/qualityReceiptIntegrity').sign({ ...body,
    issuedAt: '2020-01-01T00:00:00.000Z', expiresAt: '2020-01-01T00:01:00.000Z' });
  assert.throws(() => enforcer.enforceQualityContract(ctx.worker, report(ctx, expired), null), { code: 'GQEL_RECEIPT_EXPIRED' });
  const worker = { ...ctx.worker, executionRunId: undefined };
  assert.throws(() => enforcer.enforceQualityContract(worker, report(ctx, receipt), null), { code: 'GQEL_RECEIPT_SCOPE_REQUIRED' });
});

test('a new compiled quality contract invalidates an old passing receipt', async ctx => {
  const receipt = await issued(ctx);
  const qualityElevation = require('./helpers/gqelProgressFixture.cjs').contract({ minQualityScore: 99 });
  const worker = { ...ctx.worker, workerContract: { ...ctx.worker.workerContract, qualityElevation } };
  assert.throws(() => enforcer.enforceQualityContract(worker, report(ctx, receipt), null), { code: 'GQEL_STALE_EVALUATION' });
});

test('persisted session tampering is detected on load', async ctx => {
  await issued(ctx);
  await ctx.db.run('UPDATE gqel_quality_receipts SET session_json = ?', '{}');
  await assert.rejects(service.loadQualityReceipt(ctx), { code: 'GQEL_RECEIPT_INVALID' });
});

test('revoked execution authority cannot reload a passing receipt', async ctx => {
  await issued(ctx);
  await ctx.db.run("UPDATE missions SET status = 'cancelled' WHERE mission_id = ?", ctx.worker.missionId);
  await assert.rejects(service.loadQualityReceipt(ctx), { code: 'EXECUTION_AUTHORITY_MISSION_INACTIVE' });
});

test('checkpoints persist actual versions and refuse rewriting a sequence', async ctx => {
  const record = await service.recordQualityCheckpoint({ ...ctx, session: ctx.result.session });
  assert.equal(record.session.versions[0].digest, digest(ctx.text));
  const changed = structuredClone(ctx.result.session);
  changed.status = 'invented';
  await assert.rejects(service.recordQualityCheckpoint({ ...ctx, session: changed }), { code: 'GQEL_CHECKPOINT_CONFLICT' });
});

test('structured artifact targets are canonical and stable across key order', async () => {
  const a = enforcer.extractTargetContent({}, { content: { z: 1, a: { b: 2 } } });
  const b = enforcer.extractTargetContent({}, { content: { a: { b: 2 }, z: 1 } });
  assert.equal(a, b);
});

async function run() {
  for (const entry of tests) {
    const ctx = await create();
    try { await entry.run(ctx); console.log(`PASS ${entry.name}`); }
    finally { await ctx.close(); }
  }
  console.log(`GQEL durable quality receipts: ${tests.length}/${tests.length} passed (synthetic reviews).`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
