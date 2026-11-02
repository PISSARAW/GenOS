'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { citations, reviewPrompt, CALIBRATION } = require('../src/services/qualityElevation/qualityReviewService');
const { validatePlanStructure, durationDefects, pacingGuide } = require('../src/services/qualityElevation/qualityPlanValidation');
const { reviewSchema, planSchema, comparisonSchema } = require('../src/services/qualityElevation/qualitySchemas');
const { createOllamaAdapter } = require('../../scripts/experiments/ollama_gqel_driver.cjs');
const { persistVersions, argumentsOf } = require('../../scripts/experiments/run_writing_mission_gqel.cjs');
const { mirroredComparison } = require('../src/services/qualityElevation/qualityComparisonService');
const { createElevationSession } = require('../src/services/qualityElevation/qualityElevationService');
const { createInvoker } = require('../src/services/qualityElevation/qualityBudget');
const { digest } = require('../src/services/qualityElevation/qualityContract');
const { GOOD, BAD, reply, payload, checks, samplePlan, reviewer, contract, execute } = require('./helpers/gqelProgressFixture.cjs');
const tests = [];
function test(name, run) { tests.push({ name, run }); }
test('opposite-meaning quotation sharing a long suffix is rejected', () => {
  assert.throws(() => citations([{ quote: 'Alain accepte de sortir de la station.' }], 'Alain refuse de sortir de la station.'), { code: 'GQEL_REVIEW_UNGROUNDED' });
});
test('invented prefix cannot borrow a real subphrase', () => {
  assert.throws(() => citations([{ quote: 'Alain meurt après que Vera ouvre la porte.' }], 'Vera ouvre la porte.'), { code: 'GQEL_REVIEW_UNGROUNDED' });
});
test('stitched excerpts must remain distinct evidence entries', () => {
  const text = 'Vera bloque le sas.\nAlain lit le registre.';
  assert.throws(() => citations([{ quote: 'Vera bloque le sas. Alain lit le registre.' }], text));
  assert.equal(citations([{ quote: 'Vera bloque le sas.' }, { quote: 'Alain lit le registre.' }], text).length, 2);
});
test('exact quotations retain their complete source range', () => {
  const result = citations([{ quote: '  Alain refuse de sortir.  ' }], 'Vera attend. Alain refuse de sortir.')[0];
  assert.equal(result.quote, 'Alain refuse de sortir.'); assert.equal(result.end - result.start, result.quote.length);
});
test('plan prompt does not require finished scenes', () => {
  const prompt = reviewPrompt({ phase: 'plan', criteria: [], artifact: 'plan', mission: 'brief' });
  assert.match(prompt, /PHASE PLAN/); assert.match(prompt, /ne demande ni dialogues/); assert.doesNotMatch(prompt, /PHASE ARTEFACT/);
});
test('artifact prompt still requires enacted resolution', () => {
  const prompt = reviewPrompt({ phase: 'artifact', criteria: [], artifact: GOOD, mission: 'brief' });
  assert.match(prompt, /PHASE ARTEFACT/); assert.match(prompt, /ne remplace pas sa mise en scène/);
});
test('shared goal and summarized plan have positive control cases', () => {
  for (const id of ['shared_goal', 'plan_summary']) assert.equal(CALIBRATION.find(sample => sample.id === id).expected, 'pass');
});
test('judge rejecting shared goals fails the control instead of vetoing the story', async () => {
  const r = reviewer(), base = r.review;
  r.review = async request => payload(request).artifact === CALIBRATION.find(sample => sample.id === 'shared_goal').text
    ? reply(checks(payload(request), 'fail')) : base(request);
  const result = await execute({ contract: contract({ requireCalibration: true }), reviewers: [r] });
  assert.equal(result.terminalError.code, 'GQEL_REVIEWER_CONTROL_FAILED'); assert.equal(result.progress.scenesWritten, 0);
});
test('26-minute estimates do not become silently rescaled facts', () => {
  const plan = samplePlan(26), before = JSON.stringify(plan), c = contract({ targetMinutes: 20 });
  validatePlanStructure(plan, c);
  assert.equal(durationDefects(plan, c).length, 1);
  const guide = pacingGuide(plan, c);
  assert.equal(guide.allocations[0].suggestedMinutes, 20); assert.equal(guide.durationVerified, false);
  assert.equal(guide.proposedMinutes, 26); assert.equal(JSON.stringify(plan), before);
});
test('runtime pacing allocations sum to the target including rounding', () => {
  const plan = samplePlan(5);
  plan.scenes = Array.from({ length: 7 }, (_, i) => ({ ...plan.scenes[0], id: `S${i + 1}` }));
  const allocations = pacingGuide(plan, contract({ targetMinutes: 20 })).allocations;
  assert.equal(allocations.reduce((sum, item) => sum + Math.round(item.suggestedMinutes * 1000), 0), 20000);
});
test('duration repairs preserve previous plan and do not consume an artifact round', async () => {
  let plans = 0;
  const result = await execute({ contract: contract({ targetMinutes: 20 }), generator: async request => {
    if (request.stage !== 'plan') return reply(GOOD);
    const data = payload(request); plans++;
    if (plans === 2) { assert.equal(data.previousPlan.scenes[0].plannedMinutes, 26); assert.equal(data.pacingGuide.targetMinutes, 20); }
    return reply(samplePlan(plans === 1 ? 26 : 20));
  } });
  assert.equal(result.promoted, true); assert.equal(result.progress.planRepairs, 1);
  assert.equal(result.totalIterations, 1); assert.equal(result.progress.scenesWritten, 1);
});
test('persistent duration discrepancy permits only provisional drafting', async () => {
  const r = reviewer((value, data) => data.phase === 'artifact' ? { checks: value.checks.map(check =>
    check.criterionId === 'duration_supported' ? { ...check, verdict: 'fail' } : check) } : value);
  const result = await execute({ contract: contract({ targetMinutes: 20 }), reviewers: [r],
    generator: async request => reply(request.stage === 'plan' ? samplePlan(30) : GOOD) });
  assert.equal(result.promoted, false); assert.equal(result.progress.draftsProduced, 1);
  assert.equal(result.lastCandidate.provisionalPlan, true);
  assert.equal(result.session.plans.at(-1).plan.scenes[0].plannedMinutes, 30);
  assert.ok(result.bestVersion.defects.some(item => item.code === 'CRITERION_duration_supported'));
});
test('semantic plan failure is not itself final-artifact rejection', async () => {
  const r = reviewer((value, data) => data.phase === 'plan' ? checks(data, 'fail') : value);
  const result = await execute({ reviewers: [r] });
  assert.equal(result.progress.plansProduced, 2); assert.equal(result.progress.scenesWritten, 1);
  assert.equal(result.bestVersion.evaluation.phase, 'artifact'); assert.equal(result.promoted, true);
  assert.ok(result.session.events.some(event => event.type === 'PROVISIONAL_DRAFT_AUTHORIZED'));
});
test('unresolved final causal defect still blocks promotion', async () => {
  const r = reviewer((_, data) => checks(data, 'fail'));
  const result = await execute({ reviewers: [r] });
  assert.equal(result.progress.draftsProduced, 1); assert.equal(result.promoted, false);
  assert.ok(result.bestVersion.defects.some(item => item.code === 'CRITERION_causal_chain'));
});
test('strict plan option remains an explicit operator choice', async () => {
  const result = await execute({ contract: contract({ allowProvisionalDraft: false }), reviewers: [reviewer((_, data) => checks(data, 'fail'))] });
  assert.equal(result.progress.scenesWritten, 0); assert.equal(result.promoted, false);
});
test('malformed plans cannot receive provisional drafting authority', async () => {
  const result = await execute({ generator: async () => reply({ premise: 'only' }) });
  assert.equal(result.progress.scenesWritten, 0); assert.equal(result.terminalError.code, 'GQEL_PLAN_INVALID');
  assert.equal(result.totalIterations, 1); assert.equal(result.progress.protocolRepairs, 2);
});
test('malformed review is repaired without regenerating the artifact', async () => {
  let attempts = 0, generations = 0;
  const r = reviewer((value, data, request) => {
    attempts++; if (attempts === 1) return { checks: [] };
    assert.equal(request.protocolAttempt, 1); assert.equal(data.artifact, GOOD); return value;
  });
  const result = await execute({ planScenes: false, reviewers: [r], generator: async () => { generations++; return reply(GOOD); } });
  assert.equal(result.promoted, true); assert.equal(generations, 1); assert.equal(result.totalIterations, 1);
  assert.equal(result.progress.protocolRepairs, 1); assert.equal(result.session.budget.calls, 3);
});
test('protocol repair does not convert a substantive failure into a pass', async () => {
  let attempts = 0;
  const r = reviewer((_, data) => ++attempts === 1 ? { checks: [] } : checks(data, 'fail'));
  const result = await execute({ planScenes: false, reviewers: [r] });
  assert.equal(result.promoted, false); assert.equal(result.progress.protocolRepairs, 1);
});
test('ungrounded evidence can be resubmitted without loosening validation', async () => {
  let attempts = 0;
  const r = reviewer(value => {
    if (++attempts === 1) value.checks[0].evidence = [{ quote: 'Inès brûle le registre et tue le gardien.' }];
    return value;
  });
  const result = await execute({ planScenes: false, reviewers: [r] });
  assert.equal(result.promoted, true); assert.equal(result.progress.protocolRepairs, 1);
  assert.equal(result.session.protocolAttempts[0].code, 'GQEL_REVIEW_UNGROUNDED');
});
test('exhausted review retries preserve unaccepted complete draft', async () => {
  const r = reviewer(value => { value.checks[0].evidence = [{ quote: 'Une preuve entièrement inventée ici.' }]; return value; });
  const result = await execute({ planScenes: false, reviewers: [r] });
  assert.equal(result.promoted, false); assert.equal(result.bestVersion, null); assert.equal(result.lastCandidate.content, GOOD);
  assert.equal(result.progress.protocolRepairs, 2); assert.equal(result.session.budget.calls, 4);
});
test('all protocol retries remain inside the shared call budget', async () => {
  const result = await execute({ contract: contract({ maxCalls: 2, maxProtocolRepairs: 5 }), planScenes: false,
    reviewers: [reviewer(() => ({ checks: [] }))] });
  assert.equal(result.session.budget.calls, 2); assert.equal(result.terminalError.code, 'GQEL_CALL_BUDGET');
  assert.equal(result.promoted, false); assert.equal(result.lastCandidate.content, GOOD);
});
test('timeouts are not retried as malformed JSON', async () => {
  let calls = 0;
  const r = reviewer(); r.review = () => { calls++; return new Promise(() => {}); };
  const result = await execute({ contract: contract({ callTimeoutMs: 20 }), planScenes: false, reviewers: [r] });
  assert.equal(calls, 1); assert.equal(result.terminalError.code, 'GQEL_CALL_TIMEOUT'); assert.equal(result.promoted, false);
});
test('a scene formatting failure retries locally', async () => {
  let sceneCalls = 0;
  const result = await execute({ generator: async request => {
    if (request.stage === 'plan') return reply(samplePlan());
    return reply(++sceneCalls === 1 ? 'Une scène résumée sans en-tête.' : GOOD);
  } });
  assert.equal(result.promoted, true); assert.equal(result.progress.protocolRepairs, 1); assert.equal(result.totalIterations, 1);
});
test('wrong scene heading is repaired before it can replace the planned scene', async () => {
  let sceneCalls = 0;
  const result = await execute({ generator: async request => request.stage === 'plan' ? reply(samplePlan())
    : reply(++sceneCalls === 1 ? GOOD.replace('ARCHIVES', 'CAFÉ') : GOOD) });
  assert.equal(result.promoted, true); assert.equal(sceneCalls, 2);
});
test('earlier scene draft survives a later scene failure', async () => {
  const plan = samplePlan(); plan.scenes.push({ ...plan.scenes[0], id: 'S2', heading: 'EXT. COUR - NUIT' });
  const result = await execute({ generator: async request => {
    if (request.stage === 'plan') return reply(plan);
    return reply(request.operation === 'write:S1' ? GOOD : 'Pas de scène valide.');
  } });
  assert.equal(result.promoted, false); assert.equal(result.progress.scenesWritten, 1);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gqel-progress-'));
  try { persistVersions(directory, result.session); assert.equal(fs.readFileSync(path.join(directory, 'scene-draft-1-unaccepted.md'), 'utf8'), GOOD); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('no full screenplay is accepted from a partial scene list', async () => {
  const result = await execute({ contract: contract({ minSceneCount: 2 }), generator: async () => reply(samplePlan()) });
  assert.equal(result.promoted, false); assert.equal(result.lastCandidate, null);
});
test('new protocol and planning limits are validated', () => {
  assert.throws(() => contract({ maxProtocolRepairs: -1 })); assert.throws(() => contract({ maxPlanRepairs: 1.5 }));
  assert.throws(() => contract({ allowProvisionalDraft: 'yes' }));
  assert.equal(contract({ maxPlanRepairs: 0 }).maxPlanRepairs, 0);
});
test('schemas constrain structured responses and preserve prose generation', () => {
  const c = contract(); assert.equal(reviewSchema(c.criteria).properties.checks.minItems, c.criteria.length);
  assert.equal(planSchema(c).properties.scenes.minItems, 1); assert.ok(comparisonSchema().required.includes('evidence'));
});
test('Ollama receives the actual JSON schema rather than only json mode', async () => {
  let sent;
  const adapter = createOllamaAdapter({ model: 'mock', fetchImpl: async (_, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ done: true, done_reason: 'stop', model: 'mock', message: { content: '{}' }, prompt_eval_count: 1, eval_count: 1 }) };
  } });
  const schema = reviewSchema(contract().criteria);
  await adapter({ operation: 'review:test', prompt: 'Review', maxOutputTokens: 100, responseSchema: schema });
  assert.deepEqual(sent.format, schema); assert.equal(sent.options.temperature, 0);
});
test('schema bytes are included in the conservative context bound', async () => {
  const adapter = createOllamaAdapter({ model: 'mock', contextSize: 1000, fetchImpl: () => { throw Error('must not call'); } });
  await assert.rejects(adapter({ operation: 'review:test', prompt: 'Read', maxOutputTokens: 100,
    responseSchema: { description: 'x'.repeat(2000) } }), { code: 'GQEL_CONTEXT_OVERFLOW' });
});
test('strict plan and local retry CLI options are accepted but malformed booleans are not', () => {
  assert.equal(argumentsOf(['--strict-plan=true', '--protocol-repairs=1'])['strict-plan'], 'true');
  assert.throws(() => argumentsOf(['--strict-plan=maybe']));
});
test('mirrored comparison repairs one malformed preference and preserves the two orders', async () => {
  const c = contract(), session = createElevationSession(c), invoke = createInvoker(c, session); let calls = 0;
  const r = reviewer(); r.review = async request => {
    const data = payload(request); calls++;
    if (calls === 1) return reply({ preferred: 'invalid' });
    return reply({ preferred: calls === 2 ? 'B' : 'A', reason: 'Préférence simulée pour le texte concret.',
      evidence: { A: { quote: data.A.slice(0, 40) }, B: { quote: data.B.slice(0, 40) } } });
  };
  const result = await mirroredComparison({ contract: c, session, invoke, reviewer: r,
    a: { content: BAD, digest: digest(BAD) }, b: { content: GOOD, digest: digest(GOOD) } });
  assert.equal(result.improvementSupported, true); assert.equal(calls, 3); assert.equal(session.budget.calls, 3);
});
test('persisted drafts are immutable by digest', async () => {
  const result = await execute({ planScenes: false }), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gqel-persist-'));
  try {
    persistVersions(directory, result.session);
    fs.writeFileSync(path.join(directory, 'draft-1-unaccepted.md'), 'changed');
    assert.throws(() => persistVersions(directory, result.session), /hash differs/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('null scene and character entries report repairable protocol shape errors', () => {
  const plan = samplePlan(); plan.scenes = [null];
  assert.throws(() => validatePlanStructure(plan, contract()), { code: 'GQEL_PLAN_INVALID' });
  const other = samplePlan(); other.characters = [null];
  assert.throws(() => validatePlanStructure(other, contract()), { code: 'GQEL_PLAN_INVALID' });
});
test('a non-finite total duration cannot be hidden by pacing allocation', () => {
  const plan = samplePlan(1e308); plan.scenes.push({ ...plan.scenes[0], id: 'S2' });
  assert.throws(() => pacingGuide(plan, contract({ targetMinutes: 20 })), { code: 'GQEL_PLAN_INVALID' });
});
async function run() {
  for (const item of tests) { await item.run(); console.log(`PASS ${item.name}`); }
  console.log(`GQEL progression: ${tests.length}/${tests.length}. Synthetic model replies only.`);
  return tests.length;
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };
