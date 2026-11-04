'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { compileQualityContract, digest } = require('../src/services/qualityElevation/qualityContract');
const { validatePlanStructure } = require('../src/services/qualityElevation/qualityPlanValidation');
const { preparePlan } = require('../src/services/qualityElevation/qualityPlanWorkflow');
const { createInvoker } = require('../src/services/qualityElevation/qualityBudget');
const { executeElevationLoop } = require('../src/services/qualityElevation/qualityElevationService');
const { samplePlan, reply, reviewer, payload } = require('./helpers/gqelProgressFixture.cjs');
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function plan(count = 7) {
  const source = samplePlan();
  source.scenes = Array.from({ length: count }, (_, index) => ({ ...source.scenes[0], id: `S${index + 1}`,
    heading: `INT. ARCHIVES ${index + 1} - NUIT` }));
  return source;
}
function distinct(source) {
  const result = structuredClone(source);
  result.scenes.forEach((scene, index) => { scene.stateAfter += ` au repère ${index + 1}`; });
  return result;
}
function contract(options = {}) {
  return compileQualityContract({ domain: 'screenplay', mission: 'Une agente extrait une preuve des archives.',
    policy: 'fast', requireCalibration: false, maxProtocolRepairs: 2, maxPlanRepairs: 1,
    minSceneCount: 1, maxSceneCount: 12, ...options });
}
function context(generator, options = {}) {
  const compiled = contract(options), session = { calls: [], events: [], protocolAttempts: [], plans: [], planRepairs: [],
    budget: { calls: 0, tokens: 0, usageComplete: true, startedAt: Date.now() } };
  return { contract: compiled, session, generator, reviewers: [reviewer()], iteration: 1,
    repairPlan: { stage: 'plan', obligations: [] }, invoke: createInvoker(compiled, session) };
}
test('seven copied causal tuples are rejected with literal bounded diagnostic provenance', () => {
  const source = plan(), before = structuredClone(source);
  assert.throws(() => validatePlanStructure(source, contract()), error => {
    assert.equal(error.code, 'GQEL_PLAN_INVALID');
    const defect = error.defects[0];
    assert.equal(defect.code, 'PLAN_CAUSAL_REPETITION');
    assert.deepEqual(defect.provenance.sceneIds, source.scenes.map(scene => scene.id));
    assert.equal(defect.provenance.canonicalPlanDigest, digest(source));
    assert.equal(defect.metrics.copies, 7);
    for (const evidence of defect.evidence) {
      const scene = source.scenes.find(item => item.id === evidence.sceneId);
      assert.ok(scene[evidence.field].startsWith(evidence.quote));
      assert.equal(evidence.fieldDigest, digest(scene[evidence.field]));
      assert.ok([...evidence.quote].length <= 240);
    }
    return true;
  });
  assert.deepEqual(source, before);
});
test('canonical case, whitespace and Unicode variants do not disguise the same tuple', () => {
  const source = plan(3);
  for (const field of ['decision', 'consequence', 'stateAfter']) {
    source.scenes[1][field] = '  ' + source.scenes[0][field].toUpperCase().replaceAll(' ', '  ') + '\n';
    source.scenes[2][field] = source.scenes[0][field].normalize('NFD');
  }
  assert.throws(() => validatePlanStructure(source, contract()), { code: 'GQEL_PLAN_INVALID' });
});
test('two reprises or a group without strict majority remain valid structure', () => {
  for (const count of [2, 6, 7]) {
    const source = distinct(plan(count)), copies = count === 2 ? 2 : 3;
    source.scenes.slice(0, copies).forEach(scene => { scene.stateAfter = source.scenes[0].stateAfter; });
    assert.equal(validatePlanStructure(source, contract()), source);
  }
});
test('three copies that dominate five scenes are rejected', () => {
  const source = distinct(plan(5));
  source.scenes.slice(0, 3).forEach(scene => { scene.stateAfter = source.scenes[0].stateAfter; });
  assert.throws(() => validatePlanStructure(source, contract()), { code: 'GQEL_PLAN_INVALID' });
});
test('different consequences or exit states remain accepted without claiming semantic quality', () => {
  for (const field of ['consequence', 'stateAfter']) {
    const source = plan(7);
    source.scenes.forEach((scene, index) => { scene[field] += ` au repère ${index + 1}`; });
    assert.equal(validatePlanStructure(source, contract()), source);
  }
});
test('copied-plan repair stays in the canonical metered protocol loop', async () => {
  const bad = plan(), good = distinct(bad), requests = [];
  const ctx = context(async request => { requests.push(request); return reply(requests.length === 1 ? bad : good); });
  const state = await preparePlan(ctx);
  assert.equal(state.provisional, false);
  assert.deepEqual(state.plan, good);
  assert.equal(requests.length, 2);
  assert.equal(ctx.session.plans.length, 1);
  assert.equal(ctx.session.budget.calls, 3, 'Two plan calls and one real invoker review call.');
  assert.equal(ctx.session.budget.tokens, 90);
  assert.equal(ctx.session.budget.usageComplete, true);
  const repair = payload(requests[1]).protocolRepair;
  assert.deepEqual(repair.defects[0].provenance.sceneIds, bad.scenes.map(scene => scene.id));
  assert.equal(repair.defects[0].provenance.canonicalPlanDigest, digest(bad));
  assert.deepEqual(repair.previousReply, bad);
  assert.match(requests[1].prompt, /transitions causales/);
  assert.doesNotMatch(requests[1].prompt, /Corrige UNIQUEMENT le format ou les références/);
  assert.equal(ctx.session.protocolAttempts[0].defects[0].code, 'PLAN_CAUSAL_REPETITION');
});
test('exhaustion cannot reach provisional drafting or multiply through plan and artifact rounds', async () => {
  let providerCalls = 0, sceneCalls = 0, reviewCalls = 0;
  const result = await executeElevationLoop({ contract: contract({ maxIterations: 3, maxPlanRepairs: 5 }),
    generator: async request => { providerCalls++; if (request.operation.startsWith('write:')) sceneCalls++; return reply(plan()); },
    reviewers: [{ ...reviewer(), review: async () => { reviewCalls++; throw new Error('Unexpected review'); } }] });
  assert.equal(result.promoted, false);
  assert.equal(result.terminalError.code, 'GQEL_PLAN_INVALID');
  assert.equal(result.totalIterations, 1);
  assert.equal(providerCalls, 3);
  assert.equal(sceneCalls, 0);
  assert.equal(reviewCalls, 0);
  assert.equal(result.session.plans.length, 0);
  assert.equal(result.session.events.some(event => event.type === 'PROVISIONAL_DRAFT_AUTHORIZED'), false);
  assert.deepEqual(result.session.protocolAttempts.map(attempt => attempt.attempt), [0, 1, 2]);
});
test('unmeasured usage and exhausted call budgets do not become plan repair authority', async () => {
  const unknown = context(async () => ({ content: plan() }));
  await assert.rejects(preparePlan(unknown), { code: 'GQEL_USAGE_UNVERIFIED' });
  assert.equal(unknown.session.calls.length, 1);
  const capped = context(async () => reply(plan()), { maxCalls: 1 });
  await assert.rejects(preparePlan(capped), { code: 'GQEL_CALL_BUDGET' });
  assert.equal(capped.session.calls.length, 1);
});
if (process.env.GENOS_PLAN_REPETITION_PROOF) {
  test('the actual rejected campaign plan is a negative probe only', () => {
    const proof = JSON.parse(fs.readFileSync(process.env.GENOS_PLAN_REPETITION_PROOF, 'utf8'));
    const quality = proof.quality.find(record => record.checkpoints.length);
    const actual = quality.checkpoints.at(-1).session.plans.at(-1).plan;
    assert.throws(() => validatePlanStructure(actual, contract()), error => {
      assert.equal(error.defects[0].provenance.canonicalPlanDigest, digest(actual));
      assert.equal(error.defects[0].metrics.copies, 7);
      return true;
    });
  });
}
(async () => {
  for (const item of tests) { await item.run(); console.log('PASS ' + item.name); }
  console.log(`Dominant copied causal plans: ${tests.length}/${tests.length} PASS; no artistic acceptance.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
