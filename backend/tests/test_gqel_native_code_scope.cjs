'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { digest, compileQualityContract } = require('../src/services/qualityElevation/qualityContract');
const { elevateEvidence } = require('../src/services/qualityElevation/qualityNativeWorker');
const authority = require('../src/services/missionEnvelopeAuthority');
const execution = require('../src/services/strategyExecutionService');
const receiptService = require('../src/services/qualityElevation/qualityReceiptService');

function candidate(file, content) {
  const result = { text: 'Native patch proposal', model: 'ollama://author', inputTokens: 10,
    outputTokens: 20, tokenUsageMeasured: true, finishReason: 'stop' };
  return { generation: { result }, evidence: { consumed: 30, unresolved: false,
    proposal: { changedFileHashes: [{ path: file, hash: digest(content) }], testStatus: 'passed',
      tests: [{ command: 'node --test test.cjs', exitCode: 0 }], testExecutionReceipt: { receiptHash: 'synthetic-never-delivered' } },
    evidenceReport: { outcome: 'success', claims: [], workerArtifact: { type: 'dossier', content: { claims: [] } } } } };
}
async function run() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-gqel-code-scope-'));
  const old = { authority: authority.assertRun, event: execution.recordExecutionEvent,
    checkpoint: receiptService.recordQualityCheckpoint, issue: receiptService.issueQualityReceipt };
  let issued = 0, revisions = 0;
  authority.assertRun = async () => ({}); execution.recordExecutionEvent = async () => ({});
  receiptService.recordQualityCheckpoint = async () => ({});
  receiptService.issueQualityReceipt = async () => { issued++; throw Error('Must never issue'); };
  try {
    await fs.writeFile(path.join(workspace, 'a.js'), 'module.exports = 1;\n');
    await fs.writeFile(path.join(workspace, 'b.js'), 'module.exports = 0;\n');
    const initial = candidate('a.js', 'module.exports = 1;\n');
    const contract = compileQualityContract({ domain: 'software_engineering', mission: 'Repair a.js and preserve scope.',
      policy: 'fast', requireCalibration: false, maxOutputTokens: 1000 });
    const ctx = { ...initial, db: {}, executionRun: { id: 'scope-run' }, codeWorker: true,
      mission: { agentId: 'author', missionId: 'scope-mission', workspaceRoot: workspace,
        workerContract: { qualityElevation: contract }, qualityRuntime: {
          generatorModel: 'ollama://author', reviewers: [{ id: 'reader', model: 'ollama://reader' }] } },
      generationContext: { workerModel: 'ollama://author', latencyMs: 30000 },
      generate: async request => {
        const data = JSON.parse(request.promptText.slice(request.promptText.indexOf('\n') + 1));
        return { ...initial.generation.result, model: 'ollama://reader', text: JSON.stringify({
          checks: data.criteria.map(criterion => ({ criterionId: criterion.id, verdict: 'fail',
            rating: criterion.kind === 'soft' ? 1 : null, reason: 'Synthetic adversarial review requires another candidate.',
            evidence: [{ quote: data.artifact.slice(0, 60) }] })) }) };
      },
      revise: async () => {
        revisions++; await fs.writeFile(path.join(workspace, 'b.js'), 'module.exports = 2;\n');
        return { ...ctx, ...candidate('b.js', 'module.exports = 2;\n') };
      } };
    await assert.rejects(elevateEvidence(ctx), error => {
      assert.equal(error.code, 'GQEL_CODE_SCOPE_CHANGED', JSON.stringify(error.qualityFeedback));
      return error.qualityFeedback.qualitySatisfied === false;
    });
    assert.equal(revisions, 1); assert.equal(issued, 0);
    assert.equal(await fs.readFile(path.join(workspace, 'a.js'), 'utf8'), 'module.exports = 1;\n');
    assert.equal(await fs.readFile(path.join(workspace, 'b.js'), 'utf8'), 'module.exports = 2;\n');
    console.log('PASS native code scope: disjoint a.js -> b.js revision cannot receive acceptance or a receipt (synthetic review/test metadata).');
  } finally {
    authority.assertRun = old.authority; execution.recordExecutionEvent = old.event;
    receiptService.recordQualityCheckpoint = old.checkpoint; receiptService.issueQualityReceipt = old.issue;
    assert.ok(path.resolve(workspace).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(workspace, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
