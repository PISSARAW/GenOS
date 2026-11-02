'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'gqel-native-receipt-fixture-only';
const assert = require('node:assert/strict');
const fixture = require('./helpers/qualityReceiptFixture.cjs');
const gqel = require('./helpers/gqelProgressFixture.cjs');
const router = require('../src/services/modelRouter');
const stages = require('../src/services/workerEvidenceBarrierLocal');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');
const receipts = require('../src/services/qualityElevation/qualityReceiptService');

function modelReply(text) {
  return JSON.stringify({ outcome: 'success', claims: [{ statement: 'A fictional narrative was produced.', evidence: ['mission'] }],
    workerArtifact: { type: 'creative_candidate', content: { candidate: text,
      assumptions: ['The requested fiction permits invented characters.'],
      falsificationTest: 'Check the enacted departure against the requested scene.' }, provenance: { sourceRefs: ['mission'] } } });
}

async function run() {
  const runtime = { generatorModel: 'ollama://mock:only', reviewers: [{ id: 'native-reader', model: 'ollama://mock:only' }] };
  const text = gqel.GOOD + '\n' + 'Inès consulte le registre et vérifie chaque signature avant de franchir la porte.\n'.repeat(150);
  const ctx = await fixture.create({ runtime, text });
  const originalGenerate = router.generate;
  const routed = [];
  router.generate = async request => {
    routed.push(request);
    const data = gqel.payload({ prompt: request.prompt });
    return { text: JSON.stringify(gqel.checks(data)), model: 'ollama://mock:only',
      inputTokens: 10, outputTokens: 20, costUsd: 0, finishReason: 'stop', tokenUsageMeasured: true };
  };
  try {
    const result = { text: modelReply(ctx.text), model: 'ollama://mock:only', inputTokens: 10, outputTokens: 20, costUsd: 0,
      finishReason: 'stop', tokenUsageMeasured: true };
    const generation = { result, codeWorker: false, budget: 10000,
      generationContext: { workerModel: 'ollama://mock:only', latencyMs: 30000, stageTimings: {} } };
    const evidence = await stages.runEvidenceStage({ db: ctx.db, mission: ctx.worker,
      executionRun: { id: ctx.executionRunId }, generation, result, codeWorker: false,
      budget: 10000, stageTimings: {}, agentName: 'Native author', nameMeaning: 'Test author' });
    assert.ok(routed.length > 0);
    assert.ok(routed.every(request => request.agentId === ctx.worker.agentId && request.executionRunId === ctx.executionRunId));
    assert.ok(evidence.evidenceReport.fullTextTruncated);
    assert.equal(evidence.evidenceReport.workerArtifact.content.candidate, ctx.text);
    assert.equal(evidence.evidenceReport.qualityElevationReceipt.qualityAccepted, true);
    assert.equal(evidence.evidenceReport.qualityElevationReceipt.authorizesMissionPromotion, false);
    assert.equal(validateWorkerArtifact({ events: [{ executionRunId: ctx.executionRunId, evidenceReport: evidence.evidenceReport }] }, ctx.worker), true);
    const altered = structuredClone(evidence.evidenceReport);
    altered.workerArtifact.content.assumptions = ['Different delivery assumptions.'];
    assert.throws(() => validateWorkerArtifact({ events: [{ executionRunId: ctx.executionRunId, evidenceReport: altered }] }, ctx.worker), { code: 'GQEL_STALE_EVALUATION' });
    const found = await receipts.loadQualityReceipt({ db: ctx.db, worker: ctx.worker, text: ctx.text,
      artifact: evidence.evidenceReport.workerArtifact });
    assert.equal(found.receipt.receiptId, evidence.evidenceReport.qualityElevationReceipt.receiptId);
    const checkpoints = await ctx.db.all('SELECT checkpoint_json FROM gqel_quality_checkpoints WHERE run_id = ?', ctx.executionRunId);
    assert.ok(checkpoints.length >= 2);
    console.log('GQEL native evidence stage: real sealed SQLite run, native router callbacks, signed receipt, durable checkpoints and final worker gate PASS (synthetic model replies).');
  } finally { router.generate = originalGenerate; await ctx.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
