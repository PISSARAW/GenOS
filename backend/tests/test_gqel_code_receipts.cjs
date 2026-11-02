'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'gqel-code-receipt-fixture-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const fixture = require('./helpers/qualityReceiptFixture.cjs');
const gqel = require('./helpers/gqelProgressFixture.cjs');
const { digest } = require('../src/services/qualityElevation/qualityContract');
const values = require('../src/services/trinityProvenanceValues');
const service = require('../src/services/qualityElevation/qualityReceiptService');
const { enforceQualityContract } = require('../src/services/qualityElevation/workerQualityContractEnforcer');

async function prepareWorkspace(ctx) {
  await fs.writeFile(path.join(ctx.workspace, 'index.js'), 'module.exports = (a, b) => a + b;\n');
  await fs.writeFile(path.join(ctx.workspace, 'test.cjs'), "require('node:assert/strict').equal(require('./index.js')(2, 3), 5);\n");
}

async function create() {
  const content = 'module.exports = (a, b) => a + b;\n';
  const sourceFiles = [{ path: 'index.js', hash: digest(content), content }];
  const text = JSON.stringify({ schema: 'genos.quality-code-bundle/v1', files: sourceFiles });
  const contract = gqel.contract({ domain: 'software_engineering', mission: 'Implement addition with executed tests.' });
  const ctx = await fixture.create({ contract, text, prepareWorkspace,
    execution: { verifier: async request => gqel.reply({ artifactDigest: request.artifactDigest, executed: true,
      passed: true, evidenceRefs: ['test://synthetic-review-verifier'] }) } });
  assert.equal(ctx.result.promoted, true);
  await require('../src/db/migrations/migrateLocalCodeTestExecutionReceipts').migrateLocalCodeTestExecutionReceipts(ctx.db);
  const executed = await execFile(process.execPath, ['--test', 'test.cjs'], { cwd: ctx.workspace });
  const changedFileHashes = sourceFiles.map(({ path: file, hash }) => ({ path: file, hash }));
  const testExecutionReceipt = await require('../src/services/localCodeTestExecutionReceiptService').recordFromWorkspace(ctx.db, {
    missionId: ctx.worker.missionId, agentId: ctx.worker.agentId, executionRunId: ctx.executionRunId,
    workspaceRoot: ctx.workspace, changedFileHashes,
    tests: [{ command: 'node --test test.cjs', exitCode: 0, stdout: executed.stdout, stderr: executed.stderr }] });
  const evidence = [`genos://code-test-execution/${testExecutionReceipt.receiptHash}`,
    ...changedFileHashes.map(file => `genos://code-file/${values.digest(file)}`)];
  const artifact = { type: 'dossier', content: { claims: [{ statement: 'Addition passes executed tests.', evidence }] } };
  return { ...ctx, artifact, report: { claims: artifact.content.claims }, codeEvidence: { sourceFiles, testExecutionReceipt } };
}

async function run() {
  const ctx = await create();
  try {
    const receipt = await service.issueQualityReceipt(ctx);
    assert.notEqual(receipt.artifactDigest, receipt.reviewedArtifactDigest);
    assert.equal(receipt.codeBinding.testReceiptHash, ctx.codeEvidence.testExecutionReceipt.receiptHash);
    const report = { ...ctx.report, qualityElevationReceipt: receipt };
    assert.equal(enforceQualityContract(ctx.worker, report, ctx.artifact).passed, true);
    const unrelated = { ...ctx.artifact, content: { claims: [{ statement: 'Different dossier', evidence: [] }] } };
    assert.throws(() => enforceQualityContract(ctx.worker, report, unrelated), { code: 'GQEL_STALE_EVALUATION' });
    await assert.rejects(service.issueQualityReceipt({ ...ctx, artifact: unrelated, report: {} }), { code: 'GQEL_CODE_EVIDENCE_MISMATCH' });
    await assert.rejects(service.issueQualityReceipt({ ...ctx, artifact: unrelated }), { code: 'GQEL_CODE_EVIDENCE_MISMATCH' });
    const otherRun = { ...ctx.codeEvidence, testExecutionReceipt: { ...ctx.codeEvidence.testExecutionReceipt, batchId: 'other' } };
    await assert.rejects(service.issueQualityReceipt({ ...ctx, codeEvidence: otherRun }), { code: 'GQEL_CODE_EVIDENCE_MISMATCH' });
    await fs.writeFile(path.join(ctx.workspace, 'index.js'), 'module.exports = () => 0;\n');
    await assert.rejects(service.issueQualityReceipt(ctx), { code: 'GQEL_CODE_EVIDENCE_MISMATCH' });
    console.log('GQEL code delivery receipts: executed tests, exact source/dossier binding and tamper rejection PASS (synthetic reviewers).');
  } finally { await ctx.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
