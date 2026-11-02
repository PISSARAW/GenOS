'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'gqel-final-synthesis-test-only';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionProtocolFixture');
const gqel = require('./helpers/gqelProgressFixture.cjs');
const authority = require('../src/services/missionEnvelopeAuthority');
const execution = require('../src/services/strategyExecutionService');
const router = require('../src/services/modelRouter');
const stages = require('../src/services/workerEvidenceBarrierLocal');
const native = require('../src/services/qualityElevation/qualityNativeGeneration');

function syntheticArtifact() {
  return JSON.stringify({ outcome: 'success', claims: [{ statement: 'Le livrable final représente les actions demandées.', evidence: ['mission'] }],
    workerArtifact: { type: 'creative_candidate', content: { candidate: gqel.GOOD,
      assumptions: ['La mission définit une fiction.'], falsificationTest: 'Comparer le départ aux actions effectivement représentées.' },
    provenance: { sourceRefs: ['mission'] } } });
}

async function runSynthesis(ctx) {
  const qualityElevation = gqel.contract(), model = 'ollama://synthesis:test';
  await ctx.db.run("UPDATE agents SET execution_mode='orchestrator',role='Autonomous Orchestrator',metadata_json='{}' WHERE id='worker'");
  const run = await execution.createExecutionRun(ctx.db, { agentId: 'worker', missionId: 'worker-mission',
    contractRecord: ctx.contractRecord, budget: { tokens: 10000, costUsd: 1, latencyMs: 300000 } });
  const mission = { ...ctx.normalizedMission, role: 'Autonomous Orchestrator', executionMode: 'orchestrator',
    workerKind: 'creative_worker', qualityElevation, qualityRuntime: { generatorModel: model,
      reviewers: [{ id: 'final-reader', model }] } };
  await authority.seal({ ...ctx, executionRun: run, normalizedMission: mission });
  const result = { text: syntheticArtifact(), model, inputTokens: 10, outputTokens: 20, costUsd: 0,
    finishReason: 'stop', tokenUsageMeasured: true };
  const generation = { result, codeWorker: false, budget: 10000,
    generationContext: { workerModel: model, latencyMs: 30000, stageTimings: {} } };
  const evidence = await stages.runEvidenceStage({ db: ctx.db, mission, executionRun: run, generation,
    result, codeWorker: false, budget: 10000, stageTimings: {}, agentName: 'Final integrator', nameMeaning: 'Synthesis test' });
  assert.equal(mission.workerContract, undefined);
  assert.equal(evidence.evidenceReport.qualityElevationReceipt.contractDigest, qualityElevation.digest);
  assert.equal(evidence.evidenceReport.workerArtifact.content.candidate, gqel.GOOD);
  const saved = await require('../src/services/qualityElevation/qualityReceiptService').loadQualityReceipt({
    db: ctx.db, worker: mission, text: gqel.GOOD, artifact: evidence.evidenceReport.workerArtifact });
  assert.equal(saved.receipt.authorizesMissionPromotion, false);
  const bounded = native.boundGeneration({ mission, promptText: 'Brief', maxTokens: 99999 });
  assert.equal(bounded.maxTokens, qualityElevation.maxOutputTokens);
  assert.equal(native.runtimeContract({ executionMode: 'worker', qualityElevation }), null);
}

async function main() {
  const ctx = await fixture.create(), original = router.generate;
  const routes = [];
  router.generate = async request => {
    routes.push(request);
    return { text: JSON.stringify(gqel.checks(gqel.payload({ prompt: request.prompt }))),
      model: request.model, inputTokens: 10, outputTokens: 20, costUsd: 0, finishReason: 'stop', tokenUsageMeasured: true };
  };
  try { await runSynthesis(ctx); assert.ok(routes.length > 0); }
  finally { router.generate = original; await ctx.close(); }
  console.log('GQEL native final synthesis: actual orchestrator identity, sealed top-level contract, routed synthetic review and persisted exact-artifact receipt PASS.');
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
