'use strict';

const assert = require('node:assert/strict');
const { compileQualityContract } = require('../src/services/qualityElevation/qualityContract');
const { elevateEvidence } = require('../src/services/qualityElevation/qualityNativeWorker');
const { generateWorkerResult } = require('../src/services/workerEvidenceBarrierLocal');
const { runWorkerQuality } = require('../src/services/qualityElevation/qualityWorkerRuntime');
const { failurePayload, failureState } = require('../src/services/workerEvidenceBarrierLocalFailure');

const authority = require('../src/services/missionEnvelopeAuthority');
const router = require('../src/services/modelRouter');
const budget = require('../src/services/missionModelBudgetScope');
const execution = require('../src/services/strategyExecutionService');
const originals = { authority: authority.assertRun, generate: router.generate,
  budget: budget.routeBudget, event: execution.recordExecutionEvent };
const BAD = 'Un texte incomplet annonce simplement le résultat attendu.';
const GOOD = 'Un texte corrigé développe précisément les actions et leurs conséquences.';
const calls = [], events = [];
let authorityChecks = 0;

function modelResult(text, model) {
  return { text, model, inputTokens: 12, outputTokens: 24, costUsd: 0.001, finishReason: 'stop', tokenUsageMeasured: true };
}
function evidence(text) {
  return { consumed: 36, unresolved: false, noAnswer: false, evidenceReport: {
    outcome: 'success', claims: [{ statement: 'Candidat créatif produit.', evidence: ['mission'] }],
    workerArtifact: { type: 'creative_candidate', content: { candidate: text,
      assumptions: ['Le brief définit une fiction.'], falsificationTest: 'Lire le texte contre les critères du brief.' } }
  } };
}
function context(overrides = {}) {
  const contract = compileQualityContract({ domain: 'generic', mission: 'Écrire un texte complet.',
    policy: 'fast', requireCalibration: false, maxOutputTokens: 1000, budgetMaxTokens: 60000, ...overrides });
  const mission = { agentId: 'native-author', missionId: 'native-mission', localModel: 'ollama://author:8b',
    modelBudgetScope: { id: 'execution-run:parent', tokens: 100000, costUsd: 1 },
    executionBudget: { tokens: 60000, costUsd: 0.5 },
    workerContract: { qualityElevation: contract }, qualityRuntime: {
      generatorModel: 'ollama://author:8b', reviewers: [{ id: 'reader-1', model: 'ollama://reader:8b' }] } };
  const generationContext = { mission, workerModel: mission.localModel, latencyMs: 30000,
    maxCost: 0.5, stageTimings: {}, policy: { primary: mission.localModel } };
  const generation = { result: modelResult(BAD, mission.localModel), generationContext };
  return { db: {}, mission, executionRun: { id: 'native-run' }, generation,
    generationContext, codeWorker: false, evidence: evidence(BAD), generate: generateWorkerResult,
    revise: async request => {
      assert.match(request.prompt, /Un texte incomplet/);
      return { generation: { result: modelResult(GOOD, mission.localModel) }, evidence: evidence(GOOD) };
    } };
}
function reviewResponse(ctx) {
  const data = JSON.parse(ctx.prompt.slice(ctx.prompt.indexOf('\n') + 1));
  const bad = data.artifact.includes('incomplet');
  return JSON.stringify({ checks: data.criteria.map(criterion => ({ criterionId: criterion.id,
    verdict: bad ? 'fail' : 'pass', rating: criterion.kind === 'soft' ? (bad ? 1 : 4) : null,
    reason: 'Évaluation synthétique ancrée dans le candidat exact de ce test.',
    evidence: [{ quote: data.artifact.slice(0, 45) }] })) });
}
async function positive() {
  const ctx = context();
  const result = await elevateEvidence(ctx);
  assert.equal(result.evidenceReport.workerArtifact.content.candidate, GOOD);
  assert.equal(result.evidenceReport.qualityFeedback.finalStatus, 'promoted');
  assert.equal(ctx.mission.executionRunId, 'native-run');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.executionRunId === 'native-run'
    && call.budgetReservationId === 'execution-run:parent' && call.responseFormat.schema));
  assert.ok(authorityChecks >= 4);
  assert.ok(events.some(event => event.payload.qualitySession.versions.length === 2));
  assert.equal(ctx.generation.result.inputTokens, 48);
  assert.equal(result.consumed, 144);
}
async function negative() {
  const ctx = context({ maxIterations: 1 });
  await assert.rejects(elevateEvidence(ctx), error => {
    assert.equal(error.qualityFeedback.finalStatus, 'needs_review');
    assert.equal(error.qualityFeedback.qualitySatisfied, false);
    assert.equal(failureState(error).status, 'blocked');
    const payload = failurePayload({ ...ctx, error });
    assert.equal(payload.evidenceReport.outcome, 'unresolved');
    return true;
  });
}
async function guards() {
  const ctx = context();
  ctx.mission.executionDeadlineAt = Date.now() - 1;
  const before = calls.length;
  await assert.rejects(elevateEvidence(ctx), error => error.code === 'GQEL_TIME_BUDGET');
  assert.equal(calls.length, before);
  const missing = context(); missing.mission.qualityRuntime.reviewers = [];
  const result = await runWorkerQuality({ ...missing, generator: async () => { throw Error('must not generate'); } });
  assert.equal(result.terminalError.code, 'GQEL_REVIEWERS_MISSING');
  const plain = context(); delete plain.mission.workerContract.qualityElevation;
  assert.equal(await elevateEvidence(plain), plain.evidence);
}
async function main() {
  authority.assertRun = async () => { authorityChecks++; };
  budget.routeBudget = async mission => ({ budgetReservationId: mission.modelBudgetScope.id,
    budgetMaxTokens: mission.modelBudgetScope.tokens, reservationCostCeilingUsd: mission.modelBudgetScope.costUsd });
  execution.recordExecutionEvent = async (_db, _agent, event) => { events.push(event); return {}; };
  router.generate = async ctx => { calls.push(ctx); return modelResult(reviewResponse(ctx), ctx.model); };
  try { await positive(); await negative(); await guards(); }
  finally { authority.assertRun = originals.authority; router.generate = originals.generate;
    budget.routeBudget = originals.budget; execution.recordExecutionEvent = originals.event; }
  console.log('PASS native GQEL runtime: repair, shared routing, checkpoints, usage, failure feedback and guards (synthetic model responses).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
