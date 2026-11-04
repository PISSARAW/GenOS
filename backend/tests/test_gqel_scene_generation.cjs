'use strict';
const assert = require('node:assert/strict');
const { compileQualityContract, fail, digest } = require('../src/services/qualityElevation/qualityContract');
const { createInvoker } = require('../src/services/qualityElevation/qualityBudget');
const { createAdapter } = require('../src/services/qualityElevation/qualityRuntimeModelAdapter');
const { parseObject } = require('../src/services/qualityElevation/qualityReviewService');
const { assertSceneNovelty } = require('../src/services/qualityElevation/qualitySceneRepetition');
const { sceneBudget } = require('../src/services/qualityElevation/qualitySceneBudget');
const { generateScene } = require('../src/services/qualityElevation/qualitySceneGeneration');
const authority = require('../src/services/missionEnvelopeAuthority');
const { samplePlan, GOOD, reviewer } = require('./helpers/gqelProgressFixture.cjs');
const MODEL = 'ollama://scene-fixture';

function reply(content, fields = {}) {
  return { content, usage: { inputTokens: 7, outputTokens: 11 }, finishReason: 'stop', model: MODEL, ...fields };
}
function context(generator, overrides = {}) {
  const contract = compileQualityContract({ domain: 'screenplay', mission: 'Une preuve ouvre les archives.',
    policy: 'fast', requireCalibration: false, maxProtocolRepairs: 2, minBodyWords: 20,
    maxOutputTokens: 16000, budgetMaxTokens: 200000, maxCalls: 20, ...overrides });
  const session = { calls: [], protocolAttempts: [], events: [],
    budget: { calls: 0, tokens: 0, usageComplete: true, startedAt: Date.now() } };
  return { contract, session, generator, iteration: 1, plan: samplePlan(), input: {},
    invoke: createInvoker(contract, session) };
}
function input(ctx) {
  const scene = ctx.plan.scenes[0];
  return { scene, prompt: 'Écris une scène complète et concrète.\n' + JSON.stringify({ scene, previousScenes: [] }),
    validate: raw => assertSceneNovelty(parseObject(raw).sceneText, { sceneId: scene.id, previousScenes: [] }) };
}
function complete() { return JSON.stringify({ sceneText: GOOD }); }
function limits() {
  const plan = { scenes: [{ id: 'S1', plannedMinutes: 3 }, { id: 'S2', plannedMinutes: 1 }] };
  const contract = { minBodyWords: 1200, maxOutputTokens: 16000, targetMinutes: null };
  const first = sceneBudget(contract, plan, plan.scenes[0]);
  const last = sceneBudget(contract, plan, plan.scenes[1]);
  assert.equal(first.targetWords, 900);
  assert.equal(last.targetWords, 300);
  assert.ok(first.maxOutputTokens < 16000 && last.maxOutputTokens < first.maxOutputTokens);
  assert.equal(sceneBudget({ ...contract, maxOutputTokens: 100 }, plan).maxOutputTokens, 100);
  assert.throws(() => sceneBudget(contract, { scenes: [] }), { code: 'GQEL_PLAN_INVALID' });
}
async function measuredRepair() {
  const requests = [], bad = '{"sceneText":"TRUNCATED_REPLY_MUST_NOT_BE_PROMPTED';
  const ctx = context(async request => {
    requests.push(request);
    return requests.length === 1 ? reply(bad, { finishReason: 'length',
      usage: { inputTokens: 7, outputTokens: request.maxOutputTokens } }) : reply(complete());
  });
  assert.equal(await generateScene(ctx, input(ctx)), GOOD);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(request => request.sceneAttempt), [0, 1]);
  assert.ok(requests.every(request => request.maxOutputTokens === 1536));
  assert.ok(requests.every(request => request.responseSchema.properties.sceneText.maxLength === 4096));
  assert.ok(!requests[1].prompt.includes('TRUNCATED_REPLY_MUST_NOT_BE_PROMPTED'));
  const repair = JSON.parse(requests[1].prompt.slice(requests[1].prompt.indexOf('\n') + 1)).sceneAttemptRepair;
  assert.equal(repair.responseDigest, digest(bad));
  assert.equal(ctx.session.budget.tokens, 7 + 1536 + 7 + 11);
  assert.equal(ctx.session.budget.usageComplete, true);
  assert.equal(ctx.session.sceneAttempts[0].untrustedResponse, bad);
  assert.equal(Object.isFrozen(ctx.session.sceneAttempts[0]), true);
  assert.ok(ctx.session.sceneAttempts.every(attempt => attempt.acceptedForDelivery === false));
}
async function repetitiveRepair() {
  const phrase = 'Je ne peux pas signer ce registre sans obtenir la preuve originale.';
  const repeated = 'INT. ARCHIVES - NUIT\n' + ('INÈS\n' + phrase + '\n').repeat(16);
  let calls = 0;
  const ctx = context(async () => reply(JSON.stringify({ sceneText: ++calls === 1 ? repeated : GOOD })));
  assert.equal(await generateScene(ctx, input(ctx)), GOOD);
  assert.equal(calls, 2);
  assert.equal(ctx.session.sceneAttempts[0].code, 'GQEL_SCENE_REPETITIVE');
  assert.ok(ctx.session.sceneAttempts[0].defects[0].evidence[0].quote);
  assert.equal(ctx.session.budget.tokens, 36);
}
async function exhausted() {
  const ctx = context(async request => reply('truncated', { finishReason: 'length',
    usage: { inputTokens: 7, outputTokens: request.maxOutputTokens } }), { maxProtocolRepairs: 1 });
  await assert.rejects(generateScene(ctx, input(ctx)), { code: 'GQEL_TRUNCATED_OUTPUT' });
  assert.equal(ctx.session.calls.length, 2);
  assert.equal(ctx.session.sceneAttempts.length, 2);
  assert.equal(ctx.session.budget.tokens, 2 * (7 + 1536));
  assert.equal(ctx.session.sceneAttempts[1].repairEligible, false);
}
async function noUnsafeRetry() {
  for (const code of ['GQEL_USAGE_UNVERIFIED', 'GQEL_TRUNCATED_OUTPUT', 'GQEL_CALL_TIMEOUT']) {
    const ctx = context(async () => { throw fail(code, 'No verified reply.'); });
    await assert.rejects(generateScene(ctx, input(ctx)), { code });
    assert.equal(ctx.session.calls.length, 1);
    assert.equal(ctx.session.budget.usageComplete, false);
    assert.equal(ctx.session.sceneAttempts[0].repairEligible, false);
  }
  const ctx = context(async request => reply(complete(), {
    usage: { inputTokens: 7, outputTokens: request.maxOutputTokens + 1 } }));
  await assert.rejects(generateScene(ctx, input(ctx)), { code: 'GQEL_OUTPUT_CAP_EXCEEDED' });
  assert.equal(ctx.session.calls.length, 1);
}
async function globalCaps() {
  let calls = 0;
  const ctx = context(async request => { calls++; return reply('truncated', { finishReason: 'length',
    usage: { inputTokens: 7, outputTokens: request.maxOutputTokens } }); }, { maxCalls: 1 });
  await assert.rejects(generateScene(ctx, input(ctx)), { code: 'GQEL_CALL_BUDGET' });
  assert.equal(calls, 1);
  assert.equal(ctx.session.calls.length, 1);
}
function nativeResult(request, status) {
  return { text: complete(), model: MODEL, servedModel: 'scene-fixture', provider: 'ollama',
    inputTokens: 7, outputTokens: request.maxTokens, tokenUsageMeasured: true, finishReason: 'length',
    routeAttemptId: 'native-attempt-1', schemaViolation: { error: 'OUTPUT_SCHEMA_VIOLATION' }, ...status };
}
async function nativeRefusal(kind) {
  const original = authority.assertRun;
  let checks = 0, providers = 0, blocked = false;
  const ctx = context(null), usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const native = { db: {}, contract: ctx.contract, usage, executionRun: { id: 'synthetic-run' },
    mission: { agentId: 'synthetic-author', executionDeadlineAt: Date.now() + 60000 },
    generationContext: { latencyMs: 10000 }, isCancelled: () => kind === 'cancel' && blocked };
  authority.assertRun = async () => { checks++; if (kind === 'authority' && blocked) throw fail('AUTHORITY_REVOKED', 'Revoked.'); };
  native.generate = async request => {
    providers++; blocked = true;
    if (kind === 'deadline') native.mission.executionDeadlineAt = Date.now() - 1;
    const invalid = { usage: { tokenUsageMeasured: false }, completion: { finishReason: null, schemaViolation: null } };
    return nativeResult(request, invalid[kind] || {});
  };
  ctx.generator = createAdapter(native, MODEL);
  const expected = { cancel: 'GQEL_CANCELLED', authority: 'AUTHORITY_REVOKED', deadline: 'GQEL_TIME_BUDGET',
    usage: 'GQEL_USAGE_UNVERIFIED', completion: 'GQEL_COMPLETION_UNVERIFIED' };
  try { await assert.rejects(generateScene(ctx, input(ctx)), { code: expected[kind] }); }
  finally { authority.assertRun = original; }
  assert.equal(providers, 1, 'No provider call follows a lost native authority, cancellation or deadline.');
  assert.equal(checks, kind === 'authority' ? 2 : 1);
  assert.equal(usage.inputTokens, 7);
  assert.equal(usage.outputTokens, 1536);
}
async function nativeMeasuredRepair() {
  const original = authority.assertRun, ctx = context(null);
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let checks = 0, providers = 0;
  authority.assertRun = async () => { checks++; };
  ctx.generator = createAdapter({ db: {}, contract: ctx.contract, usage, executionRun: { id: 'synthetic-native-run' },
    mission: { agentId: 'synthetic-author', executionDeadlineAt: Date.now() + 60000 }, generationContext: { latencyMs: 10000 },
    generate: async request => nativeResult(request, ++providers === 1 ? {} : {
      finishReason: 'stop', outputTokens: 11, schemaViolation: null, routeAttemptId: 'native-attempt-2' }) }, MODEL);
  try { assert.equal(await generateScene(ctx, input(ctx)), GOOD); }
  finally { authority.assertRun = original; }
  assert.equal(providers, 2);
  assert.equal(checks, 2);
  assert.equal(usage.inputTokens, 14);
  assert.equal(usage.outputTokens, 1536 + 11);
  assert.equal(ctx.session.budget.tokens, usage.inputTokens + usage.outputTokens);
  assert.deepEqual(ctx.session.sceneAttempts.map(attempt => attempt.routeAttemptId), ['native-attempt-1', 'native-attempt-2']);
}
async function unicodeBound() {
  const text = GOOD + '\n' + '🙂'.repeat(2000);
  assert.ok(text.length > 4096 && Array.from(text).length < 4096);
  const ctx = context(async () => reply(JSON.stringify({ sceneText: text })));
  assert.equal(await generateScene(ctx, input(ctx)), text);
}
async function noOuterMultiplication() {
  const phrase = 'Je ne peux pas signer ce registre sans obtenir la preuve originale.';
  const repeated = 'INT. ARCHIVES - NUIT\n' + ('INÈS\n' + phrase + '\n').repeat(16);
  const ctx = context(null, { maxProtocolRepairs: 1, maxIterations: 3 });
  let sceneCalls = 0;
  const result = await require('../src/services/qualityElevation/qualityElevationService').executeElevationLoop({
    contract: ctx.contract, reviewers: [reviewer()],
    generator: async request => request.stage === 'plan' ? reply(samplePlan())
      : (sceneCalls++, reply(JSON.stringify({ sceneText: repeated }))) });
  assert.equal(result.promoted, false);
  assert.equal(result.terminalError.code, 'GQEL_SCENE_REPETITIVE');
  assert.equal(result.totalIterations, 1);
  assert.equal(sceneCalls, 2, 'Exhausted local scene repairs cannot restart through outer artifact rounds.');
  assert.equal(result.session.sceneAttempts.length, 2);
}
async function main() {
  limits(); await measuredRepair(); await repetitiveRepair(); await exhausted(); await noUnsafeRetry(); await globalCaps();
  await unicodeBound(); await noOuterMultiplication(); await nativeMeasuredRepair();
  for (const kind of ['cancel', 'authority', 'deadline', 'usage', 'completion']) await nativeRefusal(kind);
  console.log('Scene generation: bounded schema/output, fresh measured repairs, cumulative accounting and native authority/cancel/deadline refusals PASS (synthetic model replies).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
