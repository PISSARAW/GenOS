'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compileQualityContract, createElevationSession, executeElevationLoop, recordIterationVersion, buildRepairPrompt } = require('../src/services/qualityElevation/qualityElevationService');
const { evaluateContent } = require('../src/services/qualityElevation/qualityEvaluatorRegistry');
const { digest } = require('../src/services/qualityElevation/qualityContract');
const { validateReview, CALIBRATION } = require('../src/services/qualityElevation/qualityReviewService');
const { evaluateDoubleBlindConsistency, compareVersions } = require('../src/services/qualityElevation/qualityComparisonService');
const { enforceQualityContract, bindQualityResult } = require('../src/services/qualityElevation/workerQualityContractEnforcer');
const { validatePlan } = require('../src/services/qualityElevation/qualityNarrativeWorkflow');
const { buildRepairPlan } = require('../src/services/qualityElevation/qualityRepairPlanner');
const { createOllamaAdapter } = require('../../scripts/experiments/ollama_gqel_driver.cjs');
const tests = [];
function test(name, body) { tests.push({ name, body }); }
function reply(content, overrides = {}) { return { content, usage: { inputTokens: 10, outputTokens: 20 }, finishReason: 'stop', model: 'mock:only', ...overrides }; }
function payload(request) { return JSON.parse(request.prompt.slice(request.prompt.indexOf('\n') + 1)); }
const GOOD = 'INT. ARCHIVES - NUIT\nInès glisse la copie sous la vitre. Le gardien compare la signature au registre, déverrouille la porte et recule. Inès franchit le seuil.';
const BAD = 'INT. ARCHIVES - NUIT\nUne confrontation révèle la vérité et rend Inès libre. La scène est intense.';
function checks(data, options = {}) {
  return { checks: data.criteria.map(criterion => ({ criterionId: criterion.id,
    verdict: options.verdict || 'pass', rating: criterion.kind === 'soft' ? (options.rating ?? 4) : null,
    reason: 'Fixture de contrôle logiciel : décision synthétique et non avis artistique.',
    evidence: [{ quote: data.artifact.slice(0, Math.min(70, data.artifact.length)) }] })) };
}
function reviewer(options = {}) {
  return { id: options.id || 'critic-1', model: options.model || 'mock:only', dependencyGroup: options.group || 'mock:only',
    review: async request => {
      const data = payload(request);
      if (request.operation === 'reviewer_control') return reply(checks(data, { verdict: data.artifact === CALIBRATION[0].text ? 'fail' : 'pass' }));
      if (request.operation === 'order_balanced_comparison') return reply({ preferred: data.B.includes('glisse') ? 'B' : 'A',
        reason: 'La fixture concrète est préférée à la fixture résumée.', evidence: { A: { quote: data.A.slice(0, 50) }, B: { quote: data.B.slice(0, 50) } } });
      const result = checks(data, { verdict: data.artifact.includes('Une confrontation') ? 'fail' : 'pass' });
      return reply(options.transform ? options.transform(result, data) : result);
    } };
}
function contract(overrides = {}) { return compileQualityContract({ policy: 'fast', domain: 'creative_writing', mission: 'Écrire un scénario.', ...overrides }); }
function execute(options = {}) { return executeElevationLoop({ contract: contract(), planScenes: false, generator: async () => reply(GOOD), reviewers: [reviewer()], ...options }); }
test('compiled contracts are frozen and reject invalid limits', () => {
  assert.throws(() => contract({ maxIterations: -1 })); assert.throws(() => contract({ budgetMaxTokens: NaN }));
  assert.throws(() => contract({ maxIterations: 1.5 })); assert.throws(() => contract({ minSceneCount: 10, maxSceneCount: 2 }));
  assert.throws(() => contract({ criteria: [{ id: 'craft', kind: 'soft', description: 'weaken' }] }));
  assert.throws(() => contract({ requireDoubleBlind: 'false' }));
  const c = contract(); assert.ok(Object.isFrozen(c.criteria)); assert.throws(() => { c.criteria[0].description = 'override'; });
});
test('the original V3 cannot pass as a 20-minute commission', () => {
  const source = fs.readFileSync(path.join(__dirname, 'fixtures/gqel-dernier-sas-v3.md'), 'utf8');
  const c = contract({ minSceneCount: 6, minBodyWords: 1200, targetMinutes: 20 });
  const evaluation = evaluateContent(c.domain, source, { contract: c });
  assert.equal(evaluation.score, null); assert.equal(evaluation.passed, false); assert.equal(evaluation.metrics.sceneCount, 4);
  assert.ok(evaluation.metrics.bodyWords < 400); assert.ok(evaluation.defects.some(item => item.code === 'DELIVERABLE_INCOMPLETE'));
});
test('keyword stuffing cannot mint artistic scores', () => {
  const keywords = 'PRÉMISSE PERSONNAGES Secret Objectif Acte I conflit tension climax NOTE DRAMATURGIQUE '.repeat(100);
  const result = evaluateContent('creative_writing', keywords, { contract: contract() });
  assert.equal(result.overallScore, null); assert.equal(result.valid, false); assert.equal(result.metrics.sceneCount, 0);
});
test('a silent single-scene work is not forced to have two characters or four lines', () => {
  const result = evaluateContent('creative_writing', GOOD, { contract: contract() });
  assert.equal(result.structuralPassed, true); assert.equal(result.valid, false);
});
test('generic text no longer gets 80 merely by existing', () => { assert.equal(evaluateContent('generic', 'long enough but entirely wrong text').score, null); });
test('inline comments are not executed code tests', () => {
  const evaluation = evaluateContent('software_engineering', 'module.exports = {}; // test: 1 === 1');
  assert.equal(evaluation.metrics.testsExecuted, false); assert.equal(evaluation.passed, false);
  assert.ok(evaluateContent('software_engineering', 'function broken( {').defects.some(d => d.code === 'SYNTAX_ERROR'));
});
test('review omissions, duplicates, invented citations and invalid scores are rejected', () => {
  const c = contract(), data = { artifact: GOOD, criteria: c.criteria };
  assert.throws(() => validateReview({ checks: [] }, c.criteria, GOOD));
  const fake = checks(data); fake.checks[0].evidence = [{ quote: 'citation inventée absente du document' }];
  assert.throws(() => validateReview(fake, c.criteria, GOOD), { code: 'GQEL_REVIEW_UNGROUNDED' });
  const dupe = checks(data); dupe.checks[1].criterionId = dupe.checks[0].criterionId;
  assert.throws(() => validateReview(dupe, c.criteria, GOOD));
  const nan = checks(data); nan.checks.find(x => x.criterionId === 'craft').rating = 999;
  assert.throws(() => validateReview(nan, c.criteria, GOOD));
});
test('untrusted evaluation cannot be added to a session', () => {
  assert.throws(() => recordIterationVersion(createElevationSession(contract()), GOOD,
    { artifactDigest: digest(GOOD), score: 100, passed: true, defects: [] }), { code: 'GQEL_UNTRUSTED_EVALUATION' });
});
test('positive full runtime path is reachable with metered synthetic adapters', async () => {
  const result = await execute(); assert.equal(result.promoted, true);
  assert.equal(result.session.controls.length, 1); assert.equal(result.session.budget.calls, 4);
  assert.equal(result.demonstratedGain, null); assert.equal(result.improvementEvidence.humanValidated, false);
});
test('negative-to-positive repair is compared in both orders', async () => {
  const result = await execute({ contract: contract({ requireDoubleBlind: true }), generator: async request => reply(request.iteration === 1 ? BAD : GOOD) });
  assert.equal(result.promoted, true); assert.equal(result.bestVersion.version, 2); assert.equal(result.isImproved, true);
  assert.equal(result.demonstratedGain, null); assert.equal(result.session.calls.filter(call => call.operation === 'order_balanced_comparison').length, 2);
});
test('one false pass cannot override a hard failure', async () => {
  const positive = reviewer({ id: 'critic-2', transform: result => ({ checks: result.checks.map(check => ({ ...check, verdict: 'pass' })) }) });
  const result = await execute({ contract: contract({ critiques: 2, maxIterations: 1 }), reviewers: [reviewer(), positive], generator: async () => reply(BAD) });
  assert.equal(result.promoted, false);
});
test('unconditional praise fails the negative reviewer control', async () => {
  const r = reviewer(); r.review = async request => reply(checks(payload(request)));
  const result = await execute({ reviewers: [r] }); assert.equal(result.terminalError.code, 'GQEL_REVIEWER_CONTROL_FAILED');
});
test('unconditional rejection fails the positive reviewer control', async () => {
  const r = reviewer(); r.review = async request => reply(checks(payload(request), { verdict: 'fail' }));
  const result = await execute({ reviewers: [r] }); assert.equal(result.terminalError.code, 'GQEL_REVIEWER_CONTROL_FAILED');
});
test('missing reviewers fail closed', async () => { const result = await execute({ reviewers: [] }); assert.equal(result.terminalError.code, 'GQEL_REVIEWERS_MISSING'); });
test('same-model roles are not independent groups', async () => {
  const result = await execute({ contract: contract({ critiques: 2, minDependencyGroups: 2 }), reviewers: [reviewer(), reviewer({ id: 'two' })] });
  assert.equal(result.terminalError.code, 'GQEL_DEPENDENCE_LIMIT');
});
test('duplicate identities cannot inflate the panel', async () => {
  const result = await execute({ contract: contract({ critiques: 2 }), reviewers: [reviewer(), reviewer()] });
  assert.equal(result.terminalError.code, 'GQEL_REVIEWER_DUPLICATED');
});
test('unknown judgements prevent promotion', async () => {
  const result = await execute({ reviewers: [reviewer({ transform: result => ({ checks: result.checks.map(check => ({ ...check, verdict: 'unknown' })) }) })] });
  assert.equal(result.promoted, false); assert.ok(result.session.versions[0].defects.length > 0);
});
test('budget includes controls and critics', async () => {
  const result = await execute({ contract: contract({ maxCalls: 3 }) }); assert.equal(result.session.budget.calls, 3); assert.equal(result.terminalError.code, 'GQEL_CALL_BUDGET');
});
test('token reservation prevents an unaffordable call', async () => {
  const result = await execute({ contract: contract({ budgetMaxTokens: 10 }) }); assert.equal(result.session.budget.calls, 0); assert.equal(result.terminalError.code, 'GQEL_TOKEN_BUDGET');
});
test('unmetered adapters cannot result in success', async () => {
  const result = await execute({ generator: async () => GOOD }); assert.equal(result.terminalError.code, 'GQEL_USAGE_UNVERIFIED'); assert.equal(result.promoted, false);
});
test('truncation is explicit failure', async () => {
  const result = await execute({ generator: async () => reply(GOOD, { finishReason: 'length' }) }); assert.equal(result.terminalError.code, 'GQEL_TRUNCATED_OUTPUT');
});
test('per-call timeout aborts without promotion', async () => {
  const result = await execute({ contract: contract({ callTimeoutMs: 20 }), generator: () => new Promise(() => {}) }); assert.equal(result.terminalError.code, 'GQEL_CALL_TIMEOUT');
});
test('stagnation cannot exceed maximum rounds', async () => {
  let calls = 0;
  const result = await execute({ contract: contract({ maxIterations: 2 }), generator: async () => { calls++; return reply(BAD); } });
  assert.equal(calls, 2); assert.equal(result.totalIterations, 2); assert.equal(result.promoted, false);
});
test('position bias is not accepted as improvement', () => {
  assert.equal(evaluateDoubleBlindConsistency('A', 'A').consistent, false); assert.equal(evaluateDoubleBlindConsistency('tie', 'tie').favored, 'tie');
});
test('mirrored comparison bias preserves the incumbent', async () => {
  const r = reviewer(), normal = r.review;
  r.review = async request => {
    if (request.operation !== 'order_balanced_comparison') return normal(request);
    const data = payload(request); return reply({ preferred: 'A', reason: 'Fixture volontairement biaisée vers la première position.',
      evidence: { A: { quote: data.A.slice(0, 40) }, B: { quote: data.B.slice(0, 40) } } });
  };
  const result = await execute({ contract: contract({ requireDoubleBlind: true }), reviewers: [r], generator: async request => reply(request.iteration === 1 ? BAD : GOOD) });
  assert.equal(result.promoted, false); assert.equal(result.bestVersion.version, 1);
});
test('comparison detects regressions against the incumbent', () => {
  const a = { version: 1, score: 50, defects: [{ code: 'X' }], evaluation: { contractDigest: 'c', reviews: [] } };
  const b = { version: 3, score: 100, defects: [{ code: 'Y' }], evaluation: { contractDigest: 'c', reviews: [] } };
  assert.equal(compareVersions(a, b).regressionFree, false);
});
test('repair preserves full previous text, not first 4000 characters', () => {
  assert.ok(buildRepairPrompt('Write', { content: 'x'.repeat(7000) + 'THE_END', defects: [] }).includes('THE_END'));
});
test('causal defects replan and scene repairs invalidate downstream consumers', () => {
  const text = `${GOOD}\n\nEXT. COUR - NUIT\nInès longe le mur.\n\nINT. TAXI - NUIT\nInès donne une adresse.`;
  const plan = buildRepairPlan({ content: text, defects: [{ code: 'C', stage: 'scene', evidence: [{ quote: 'Inès longe le mur.' }] }] });
  assert.deepEqual(plan.invalidated, ['S2', 'S3']); assert.equal(buildRepairPlan({ content: text, defects: [{ stage: 'plan' }] }).stage, 'plan');
});
test('worker enforcer rejects forgery, accepts bound runtime assessment', async () => {
  const c = contract(), worker = { workerContract: { qualityElevation: c } };
  assert.throws(() => enforceQualityContract(worker, { output: GOOD, quality: { passed: true, score: 100 } }, null));
  const result = await execute({ contract: c, worker }); assert.equal(enforceQualityContract(worker, { output: GOOD }, null).passed, true);
  assert.throws(() => enforceQualityContract(worker, { output: GOOD + ' altered' }, null));
  assert.throws(() => bindQualityResult(worker, JSON.parse(JSON.stringify(result))));
  assert.equal(enforceQualityContract({ workerContract: {} }, {}, null), null);
});
test('persisted sessions cannot replay trust without re-verification', async () => {
  const result = await execute(); await assert.rejects(execute({ contract: result.contract, session: result.session }), { code: 'GQEL_RESUME_REVERIFY_REQUIRED' });
});
test('claimed successful code tests need an external verifier', async () => {
  const result = await execute({ contract: contract({ domain: 'software_engineering', mission: 'Implement calc' }), generator: async () => reply('module.exports = {}; // Tests all pass') });
  assert.equal(result.promoted, false); assert.ok(result.bestVersion.defects.some(item => item.code === 'EXECUTION_PROOF_MISSING'));
});
function samplePlan() {
  return { premise: 'Inès doit sortir avec une preuve.', rules: ['La porte reste verrouillée sans validation du registre.'],
    characters: [{ name: 'Inès', want: 'sortir', fear: 'être retenue', knowledge: 'elle connaît la signature' }],
    scenes: [{ id: 'S1', heading: 'INT. ARCHIVES - NUIT', goal: 'sortir', obstacle: 'porte verrouillée', decision: 'présenter la preuve',
      consequence: 'le gardien ouvre', stateAfter: 'Inès sort', plannedMinutes: 1, timingRationale: 'vérification silencieuse du document' }] };
}
test('workflow executes planning, plan review, scene generation and final review', async () => {
  const operations = [];
  const result = await execute({ planScenes: true, generator: async request => { operations.push(request.operation); return reply(request.stage === 'plan' ? JSON.stringify(samplePlan()) : GOOD); } });
  assert.equal(result.promoted, true); assert.deepEqual(operations, ['narrative_plan', 'write:S1']); assert.equal(result.session.plans.length, 1); assert.equal(result.session.sceneDrafts.length, 1);
});
test('invalid plans are retried within the cap without drafting scenes', async () => {
  const ops = [], result = await execute({ planScenes: true, generator: async request => { ops.push(request.operation); return reply('{"premise":"only"}'); } });
  assert.equal(result.promoted, false); assert.deepEqual(ops, ['narrative_plan', 'narrative_plan']);
});
test('duplicate scene IDs and incompatible durations invalidate plans', () => {
  const plan = samplePlan(); plan.scenes.push({ ...plan.scenes[0] });
  assert.throws(() => validatePlan(plan, contract())); assert.throws(() => validatePlan(samplePlan(), contract({ targetMinutes: 20 })));
});
test('Ollama adapter maps usage and output cap', async () => {
  let body;
  const adapter = createOllamaAdapter({ model: 'mock', fetchImpl: async (_, options) => {
    body = JSON.parse(options.body); return { ok: true, json: async () => ({ done: true, done_reason: 'stop', model: 'mock', message: { content: GOOD }, prompt_eval_count: 11, eval_count: 21 }) };
  } });
  const result = await adapter({ prompt: 'Write', operation: 'generate', maxOutputTokens: 100 }); assert.equal(body.options.num_predict, 100); assert.equal(result.usage.outputTokens, 21);
});
test('Ollama HTTP errors and over-context prompts are rejected', async () => {
  const adapter = createOllamaAdapter({ model: 'mock', fetchImpl: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(adapter({ prompt: 'Write', operation: 'generate', maxOutputTokens: 100 }), { code: 'GQEL_OLLAMA_HTTP_ERROR' });
  await assert.rejects(adapter({ prompt: 'x'.repeat(40000), operation: 'generate', maxOutputTokens: 100 }), { code: 'GQEL_CONTEXT_OVERFLOW' });
});
test('different declared groups cannot disguise the same underlying model', async () => {
  const result = await execute({ contract: contract({ critiques: 2, minDependencyGroups: 2 }), reviewers: [reviewer({ group: 'one' }), reviewer({ id: 'two', group: 'two' })] });
  assert.equal(result.terminalError.code, 'GQEL_DEPENDENCE_LIMIT');
});
test('unknown soft ratings stay null rather than becoming a score', async () => {
  const r = reviewer({ transform: result => ({ checks: result.checks.map(item => item.criterionId === 'craft' ? { ...item, verdict: 'unknown' } : item) }) });
  const result = await execute({ reviewers: [r] }); assert.equal(result.promoted, false); assert.equal(result.bestVersion.score, null);
});
test('explicit code profile is not changed by scenario keyword', () => { assert.equal(contract({ domain: 'software_engineering', mission: 'Coder un scénario de test.' }).profile, 'code'); });
test('semantic plan rejection prevents all scene drafting', async () => {
  const r = reviewer({ transform: (result, data) => data.phase === 'plan' ? { checks: result.checks.map(item => ({ ...item, verdict: 'fail' })) } : result });
  const operations = [], result = await execute({ planScenes: true, reviewers: [r], generator: async request => { operations.push(request.operation); return reply(JSON.stringify(samplePlan())); } });
  assert.equal(result.promoted, false); assert.deepEqual(operations, ['narrative_plan', 'narrative_plan']); assert.equal(result.session.plans.length, 2);
});
test('planning receipt cannot authorize a finished artifact', async () => {
  const result = await execute({ planScenes: true, generator: async request => reply(request.stage === 'plan' ? JSON.stringify(samplePlan()) : GOOD) });
  assert.throws(() => recordIterationVersion(createElevationSession(result.contract), JSON.stringify(samplePlan(), null, 2), result.session.plans[0].assessment), { code: 'GQEL_UNTRUSTED_EVALUATION' });
});
test('failed checkpoint prevents promotion', async () => {
  const result = await execute({ onCheckpoint: () => { throw new Error('disk full'); } }); assert.equal(result.promoted, false); assert.equal(result.terminalError.message, 'disk full');
});
test('provider overspend stops without hiding usage', async () => {
  const result = await execute({ generator: async () => reply(GOOD, { usage: { inputTokens: 1, outputTokens: 999999 } }) });
  assert.equal(result.promoted, false); assert.equal(result.terminalError.code, 'GQEL_OUTPUT_CAP_EXCEEDED'); assert.equal(result.session.calls.at(-1).usage.outputTokens, 999999);
});
test('reviewer model substitution is rejected', async () => {
  const r = reviewer(), normal = r.review; r.review = async request => ({ ...await normal(request), model: 'undisclosed:other' });
  const result = await execute({ reviewers: [r] }); assert.equal(result.terminalError.code, 'GQEL_MODEL_MISMATCH');
});
test('changed worker contract cannot consume old receipt', async () => {
  const c = contract(), worker = { workerContract: { qualityElevation: c } }; await execute({ contract: c, worker });
  worker.workerContract.qualityElevation = contract({ minQualityScore: 100 }); assert.throws(() => enforceQualityContract(worker, { output: GOOD }, null));
});
test('solid ordinal rating maps to the balanced threshold', async () => {
  const r = reviewer({ transform: result => ({ checks: result.checks.map(check => ({ ...check, rating: check.rating === null ? null : 3 })) }) });
  const result = await execute({ contract: contract({ minQualityScore: 80 }), reviewers: [r] }); assert.equal(result.promoted, true); assert.equal(result.bestVersion.score, 80);
});
test('empty brief cannot become a successful mission', async () => { await assert.rejects(execute({ contract: contract({ mission: '' }) }), { code: 'GQEL_MISSION_REQUIRED' }); });
test('Ollama reported model must match configured route', async () => {
  const adapter = createOllamaAdapter({ model: 'mock', fetchImpl: async () => ({ ok: true, json: async () => ({ done: true, done_reason: 'stop', model: 'other', message: { content: GOOD }, prompt_eval_count: 1, eval_count: 1 }) }) });
  await assert.rejects(adapter({ prompt: 'Write', operation: 'generate', maxOutputTokens: 100 }), { code: 'GQEL_MODEL_MISMATCH' });
});
test('security heuristic for literal secrets is retained', () => {
  const result = evaluateContent('software_engineering', 'const password = "examplecredentialfortestonly"; module.exports = {};');
  assert.ok(result.defects.some(item => item.code === 'HARDCODED_SECRET_DETECTED')); assert.equal(result.valid, false);
});
test('domain aliases remain case insensitive', () => { assert.equal(evaluateContent(' SOFTWARE_ENGINEERING ', 'module.exports = {};').domain, 'software_engineering'); });
async function run() {
  let passed = 0;
  for (const item of tests) {
    try { await item.body(); passed++; console.log(`PASS ${item.name}`); }
    catch (error) { console.error(`FAIL ${item.name}`); throw error; }
  }
  console.log(`GQEL V2: ${passed}/${tests.length} tests passed. All model replies in this suite are synthetic.`); return passed;
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };
