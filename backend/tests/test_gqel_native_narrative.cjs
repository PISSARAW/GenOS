'use strict';
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const { compileQualityContract } = require('../src/services/qualityElevation/qualityContract');
const native = require('../src/services/qualityElevation/qualityNativeWorker');
const { responseFormat } = require('../src/services/qualityElevation/qualityNativeMaterialization');
const generation = require('../src/services/qualityElevation/qualityNativeGeneration');
const authority = require('../src/services/missionEnvelopeAuthority');
const receipt = require('../src/services/qualityElevation/qualityReceiptService');
const execution = require('../src/services/strategyExecutionService');
const { samplePlan } = require('./helpers/gqelProgressFixture.cjs');
const SILENT_LINES = ['Inès glisse la copie sous la vitre.', 'Le gardien compare la signature au registre,',
  'déverrouille la porte et recule.', 'Inès franchit le seuil.'];
const GOOD = ['INT. ARCHIVES - NUIT', ...SILENT_LINES, 'INÈS', 'Voici la signature que vous devez vérifier.'].join('\n');
const TITLE = 'Le passage des archives — scénario';
const MODEL = 'ollama://synthetic-author:8b';
const MISSION_CONTEXT = 'GENOS VERIFIED MISSION CONTEXT native-marker\nMesure vérifiée : MIN_WORDS.\nHandoff réel de fixture : producer-id, digest-123, contribution reçue.';

function result(text) {
  return { text, model: MODEL, inputTokens: 10, outputTokens: 20,
    tokenUsageMeasured: true, finishReason: 'stop', costUsd: 0 };
}
function report(content) {
  return { outcome: 'success', claims: [{ statement: 'Un candidat est fourni pour évaluation.', evidence: ['mission'] }],
    workerArtifact: { type: 'creative_candidate', content: { candidate: content,
      assumptions: ['La fiction suit le brief.'], falsificationTest: 'Contrôler les scènes contre le brief.' },
    provenance: { sourceRefs: ['mission'] } } };
}
function evidence(content) {
  return { unresolved: false, noAnswer: false, consumed: 30, evidenceReport: report(content) };
}
function checks(data) {
  return { checks: data.criteria.map(c => ({ criterionId: c.id, verdict: 'pass',
    reason: 'Réponse synthétique pour vérifier le routage, jamais preuve artistique.',
    evidence: [{ quote: data.quoteCandidates[0] }], rating: c.kind === 'soft' ? 4 : null })) };
}
function answer(ctx) {
  const data = JSON.parse(ctx.promptText.slice(ctx.promptText.indexOf('\n') + 1));
  if (ctx.responseFormatOverride.schema.properties.lines) {
    assert.equal(data.nativeMissionContext, ctx.mission.prompt);
    assert.match(ctx.promptText.slice(0, ctx.promptText.indexOf('\n')), /MAJUSCULES sur une ligne dédiée/);
    const instructions = ctx.promptText.slice(0, ctx.promptText.indexOf('\n'));
    const example = { lines: ['PERSONNAGE', 'Une réplique.'] };
    assert.ok(instructions.includes(JSON.stringify(example)), 'The native example must use the actual lines array contract.');
    assert.equal(instructions.includes(JSON.stringify('PERSONNAGE\nUne réplique.')), false);
    assert.equal(new Ajv({ strict: false }).compile(ctx.responseFormatOverride.schema)(example), true);
    assert.match(instructions, new RegExp(`Vise environ ${data.sceneGenerationBudget.targetWords} mots utiles`));
    assert.match(instructions, /à la fin d’un mot ou d’une phrase/);
    const value = { lines: GOOD.split('\n').slice(1) };
    assert.equal(new Ajv({ strict: false }).compile(ctx.responseFormatOverride.schema)(value), true);
    return JSON.stringify(value);
  }
  if (ctx.responseFormatOverride.schema.properties.premise) {
    assert.equal(data.nativeMissionContext, ctx.mission.prompt);
    return JSON.stringify(samplePlan());
  }
  if (data.A !== undefined) return JSON.stringify({ preferred: data.A === TITLE ? 'B' : 'A',
    reason: 'Préférence synthétique cohérente dans les deux ordres.', evidence: {
      A: { quote: data.A.slice(0, 20) }, B: { quote: data.B.slice(0, 20) } } });
  assert.notEqual(data.artifact, TITLE, 'Structural rejection must be repaired before semantic review.');
  return JSON.stringify(checks(data));
}
function context(changed = false) {
  const contract = compileQualityContract({ domain: 'screenplay', mission: 'Écrire un scénario complet en une scène.',
    policy: 'fast', requireCalibration: false, requireDoubleBlind: true, minBodyWords: 20, requireDialogue: true,
    maxIterations: 2, maxProtocolRepairs: 1, budgetMaxTokens: 90000, maxOutputTokens: 2000 });
  const mission = { agentId: 'synthetic-native-writer', missionId: 'synthetic-native-mission',
    prompt: MISSION_CONTEXT,
    workerKind: 'creative_worker', workerContract: { qualityElevation: contract },
    qualityRuntime: { generatorModel: MODEL, planScenes: true, reviewers: [{ id: 'reader', model: MODEL }] } };
  const generationContext = { workerModel: MODEL, latencyMs: 30000 };
  const calls = [];
  return { db: {}, mission, contract, executionRun: { id: 'synthetic-native-run' }, codeWorker: false,
    generation: { result: result(TITLE), generationContext }, generationContext, evidence: evidence(TITLE),
    generate: async input => { calls.push(input); return result(answer(input)); }, calls,
    revise: async request => {
      assert.equal(request.operation, 'native_artifact_materialization');
      const text = changed ? TITLE : request.artifactContent;
      const validate = new Ajv({ strict: false }).compile(responseFormat(mission, request.artifactContent).schema);
      assert.equal(validate(report(request.artifactContent)), true);
      assert.equal(validate(report(TITLE)), false, 'A title cannot replace the authored scene.');
      return { generation: { result: result(text) }, evidence: evidence(text) };
    } };
}
async function positive() {
  const ctx = context();
  assert.equal(generation.boundGeneration({ mission: ctx.mission, promptText: 'Native envelope', maxTokens: 100 }).stream, false);
  const selected = await native.elevateEvidence(ctx);
  assert.equal(selected.evidenceReport.workerArtifact.content.candidate, GOOD);
  assert.equal(selected.evidenceReport.qualityFeedback.qualitySatisfied, true);
  assert.equal(ctx.calls.filter(c => c.responseFormatOverride.schema.properties.premise).length, 1);
  assert.equal(ctx.calls.filter(c => c.responseFormatOverride.schema.properties.lines).length, 1);
  assert.equal(ctx.calls.filter(c => c.responseFormatOverride.schema.properties.preferred).length, 2);
  const usage = selected.evidenceReport.qualityFeedback.budget;
  assert.equal(usage.calls, ctx.calls.length + 2, 'Initial native call and materialization remain counted.');
  assert.equal(usage.tokens, usage.calls * 30);
  assert.equal(selected.consumed, usage.tokens);
  assert.ok(ctx.calls.every(c => c.mission === ctx.mission && c.executionRun.id === 'synthetic-native-run'));
  assert.ok(ctx.calls.every(c => c.stream === false), 'Structured quality calls require one complete JSON response.');
  const { meteredReply } = require('../src/services/qualityElevation/qualityRuntimeModelAdapter');
  assert.throws(() => meteredReply({ ...result(GOOD), tokenUsageMeasured: false }, GOOD), { code: 'GQEL_USAGE_UNVERIFIED' });
  assert.throws(() => meteredReply({ ...result(GOOD), finishReason: null }, GOOD), { code: 'GQEL_COMPLETION_UNVERIFIED' });
}
async function substitution() {
  await assert.rejects(native.elevateEvidence(context(true)), error => {
    assert.equal(error.code, 'GQEL_MATERIALIZATION_CHANGED');
    assert.equal(error.qualityFeedback.qualitySatisfied, false);
    return true;
  });
}
async function proseDialogue() {
  const ctx = context(), original = ctx.generate;
  ctx.generate = async input => input.responseFormatOverride.schema.properties.lines
    ? result(JSON.stringify({ lines: [...SILENT_LINES, 'Inès dit : "Voici la signature."'] }))
    : original(input);
  await assert.rejects(native.elevateEvidence(ctx), error => {
    assert.equal(error.code, 'WORKER_QUALITY_ELEVATION_FAILED');
    assert.ok(error.qualityFeedback.defects.some(defect => defect.code === 'DIALOGUE_MISSING'));
    return true;
  });
}
async function materializationRepair() {
  const ctx = context(), original = ctx.revise;
  let attempts = 0;
  ctx.revise = async request => {
    if (attempts++ > 0) return original(request);
    return generation.generate({ mission: ctx.mission, qualityRequest: request,
      promptText: request.prompt, maxTokens: 100 }, async () => ({ ...result('invalid envelope'),
      schemaViolation: { violations: ['candidate differs from the authored constant'] } }));
  };
  const selected = await native.elevateEvidence(ctx);
  assert.equal(attempts, 2);
  assert.equal(selected.evidenceReport.workerArtifact.content.candidate, GOOD);
  const usage = selected.evidenceReport.qualityFeedback.budget;
  assert.equal(usage.usageComplete, true);
  assert.equal(usage.calls, ctx.calls.length + 3);
  assert.equal(usage.tokens, usage.calls * 30);
  assert.equal(selected.consumed, usage.tokens, 'Rejected materialization usage is included once.');
}
async function contextOverflow() {
  const ctx = context();
  ctx.mission.prompt = MISSION_CONTEXT + 'x'.repeat(ctx.contract.maxPromptChars);
  await assert.rejects(native.elevateEvidence(ctx), error => error.code === 'GQEL_CONTEXT_OVERFLOW');
  assert.equal(ctx.calls.length, 0, 'Context is reserved before the first plan/scene provider call.');
}
async function materializationGuards() {
  const previous = authority.assertRun;
  try {
    for (const reason of ['cancelled', 'expired', 'authority']) await rejectsMaterialization(reason);
  } finally { authority.assertRun = previous; }
}
async function rejectsMaterialization(reason) {
  const ctx = context(), controller = new AbortController();
  if (reason === 'cancelled') controller.abort();
  if (reason === 'expired') ctx.mission.executionDeadlineAt = Date.now() - 1;
  authority.assertRun = async () => {
    if (reason === 'authority') throw Object.assign(new Error('Authority refused'), { code: 'AUTHORITY_REFUSED' });
  };
  let calls = 0;
  const options = require('../src/services/qualityElevation/qualityNativeNarrative').options({ ctx,
    contract: ctx.contract, usage: {} }, () => undefined, { revise: () => { calls++; } });
  const expected = { cancelled: 'GQEL_CANCELLED', expired: 'GQEL_TIME_BUDGET', authority: 'AUTHORITY_REFUSED' };
  await assert.rejects(options.materializer({ signal: controller.signal }), error => error.code === expected[reason]);
  assert.equal(calls, 0, 'No envelope/provider call is allowed after a failed runtime guard.');
}
function budget() {
  const ctx = context();
  const request = { operation: 'native_artifact_materialization', artifactContent: GOOD, maxOutputTokens: 2000 };
  const fields = generation.requestFields({ mission: ctx.mission, qualityRequest: request }, { maxTokens: 3000 });
  const bounded = generation.boundGeneration({ ...fields, mission: ctx.mission, promptText: 'package' });
  assert.ok(bounded.requestTokenBudget > GOOD.length + 2000, 'The exact candidate schema must be reserved.');
  assert.equal(fields.responseFormatOverride.schema.properties.workerArtifact.properties.content.properties.candidate.const, GOOD);
}
async function main() {
  const previous = [authority.assertRun, receipt.issueQualityReceipt, receipt.recordQualityCheckpoint, execution.recordExecutionEvent];
  authority.assertRun = async () => ({});
  receipt.issueQualityReceipt = async () => ({ schema: 'explicit-unit-test-stub' });
  receipt.recordQualityCheckpoint = async () => ({});
  execution.recordExecutionEvent = async () => ({});
  try { await positive(); await substitution(); await proseDialogue(); await materializationRepair(); await contextOverflow(); await materializationGuards(); budget(); }
  finally { [authority.assertRun, receipt.issueQualityReceipt, receipt.recordQualityCheckpoint, execution.recordExecutionEvent] = previous; }
  console.log('PASS native narrative: structural repair, metered plan/scenes/envelope, unchanged candidate and comparison (synthetic model replies).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
