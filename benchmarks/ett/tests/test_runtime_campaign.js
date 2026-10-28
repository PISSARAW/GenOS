'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { SCENARIO_IDS, LEVELS, SPECS, buildCase, referenceScore } = require('../scenarios/runtime');
const { scenarioModules, parseArguments, buildTasks, casePayload, remainingTasks,
  validateResume, validateStoredRecords, restoreAdapterState } = require('../run_runtime_campaign');
const { renameReportWithRetry } = require('../adapters/campaignReportWriter');
const { verifyInChild } = require('../evaluation/verifyInChild');
const { compareRows, compareSystems } = require('../evaluation/replay');
const { SYSTEM_IDS, createIndependentAdapter } = require('../adapters/independent');
const { testCampaignBudgetGuard } = require('./test_campaign_budget_guard');

function testActionFor(world, answerId, evidence = {}) {
  const next = world.observation.nextAction;
  if (!next) return { type: 'submit_answer', answerId };
  const action = { type: next.type };
  for (const [field, kind] of Object.entries(next.requiredFields)) {
    action[field] = testValue({ field, kind, next, scenarioId: world.scenarioId, answerId, evidence });
  }
  return action;
}

function testValue(input) {
  if (input.kind === 'candidate') return input.answerId;
  if (input.kind === 'text') return testText(input);
  if (input.kind === 'number' || input.kind === 'probability') return testNumber(input.next, input.evidence);
  if (input.kind === 'boolean') return testBoolean(input.next, input.evidence);
  if (input.kind === 'number_vector') return input.evidence.predictionsByCause;
  if (input.kind === 'boolean_vector') return input.evidence.predictionsOnFreshState;
  return null;
}

function testText(input) {
  const { field, next, scenarioId, evidence } = input;
  const values = { firstQuestion: 'Why does this sensor reading depart from its baseline?',
    rule: 'The signal follows a stable relation across independent observations.' };
  if (field === 'question' && scenarioId === 'ETT-01') return values.firstQuestion;
  if (field === 'question') return `What does cycle ${next.step} show about the evidence?`;
  if (field === 'rule') return values.rule;
  if (field === 'method') return 'compare repeated readings against the baseline';
  if (field === 'sourceIds') return evidence.independentSourceIds.join(',');
  return `${field} ${next.step} provides a falsifiable observation`;
}

function testNumber(next, evidence) {
  if (next.type === 'measure_heldout_transfer') return evidence.heldOutAccuracy;
  if (next.type === 'check_prior_task_retention') return evidence.oldTaskAccuracyAfter;
  if (next.type === 'update_belief_probability') return testPosterior(evidence);
  if (next.type === 'estimate_information_value') return testExpectedValue(evidence);
  if (next.type === 'resume_investigation') return evidence.restoredItems;
  if (next.type === 'synthesize_supported_claims') return evidence.citationsVerified
    ? evidence.supportedClaims : 0;
  return 2;
}

function testPosterior(evidence) {
  const numerator = evidence.priorProbability * evidence.likelihoodIfTrue;
  const denominator = numerator + (1 - evidence.priorProbability) * evidence.likelihoodIfFalse;
  return denominator === 0 ? 0 : numerator / denominator;
}

function testExpectedValue(evidence) {
  return evidence.expectedInformationGain * evidence.probabilityOfResolution - evidence.tokenCost
    - Math.max(0, evidence.uncertaintyAfter - evidence.uncertaintyBefore) * 0.5;
}

function testBoolean(next, evidence) {
  const decisions = { verify_checkpoint_integrity: () => evidence.checksumValid,
    resume_investigation: () => checkpointIsValid(evidence),
    compare_expected_value_and_cost: () => testExpectedValue(evidence) > 0,
    submit_corrected_conclusion: () => auditPasses(evidence),
    accept_or_rollback_patch: () => patchIsSafe(evidence),
    resolve_source_conflict: () => evidence.citationsVerified && evidence.unresolvedConflicts === 0 };
  return decisions[next.type]?.() ?? true;
}

function checkpointIsValid(evidence) {
  return evidence.checksumValid && evidence.decisionLogComplete
    && evidence.restoredItems === evidence.expectedItems && evidence.duplicateItems === 0;
}

function auditPasses(evidence) {
  return evidence.reportedPasses === evidence.independentRerunPasses
    && evidence.fixtureIntegrity && evidence.sourceTraceComplete;
}

function patchIsSafe(evidence) {
  return evidence.patchedHeldOut > evidence.baselineHeldOut
    && evidence.oldSuiteFailuresAdded === 0 && evidence.sandboxRollbackPassed;
}

function testScenarioRegistry() {
  const modules = scenarioModules('all');
  assert.deepEqual(modules.map((item) => item.id), SCENARIO_IDS);
  assert.equal(new Set(SCENARIO_IDS.map((id) => buildCase(id, 'simple', 901).observation.domain)).size, 12);
  for (const scenarioId of SCENARIO_IDS) {
    for (const difficulty of LEVELS) {
      const first = buildCase(scenarioId, difficulty, 901);
      const replay = buildCase(scenarioId, difficulty, 901);
      assert.deepEqual(first, replay);
      assert.equal(first.observation.candidates.length,
        difficulty === 'simple' ? 3 : difficulty === 'difficult' ? 6 : 9);
      assert.equal(first.observation.candidates.some((candidate) =>
        candidate.id === first.oracle.answerId), true);
      assert.equal(Object.hasOwn(first.observation, 'oracle'), false);
      const payload = casePayload(first, 'ollama://test');
      assert.equal(Object.hasOwn(payload, 'oracle'), false);
      assert.equal(Object.hasOwn(payload.publicObservation, 'oracle'), false);
      assert.equal(Object.hasOwn(first.observation.candidates[0], 'metrics'), false);
      assert.equal(typeof first.observation.domain, 'string');
      const executableModule = modules.find((module) => module.id === scenarioId);
      assert.equal(typeof executableModule.build, 'function');
      assert.equal(typeof executableModule.createWorld, 'function');
      assert.equal(typeof executableModule.run, 'function');
      assert.equal(executableModule.build(difficulty, 901).observation.domain, first.observation.domain);
      assert.equal(Number.isFinite(referenceScore(scenarioId, first.observation.candidates[0].evidence)), true);
      const world = executableModule.createWorld(difficulty, 901);
      const answerEvidence = first.observation.candidates.find((candidate) =>
        candidate.id === first.oracle.answerId).evidence;
      assert.equal(world.observation.candidates.every((candidate) => !Object.hasOwn(candidate, 'evidence')), true);
      assert.equal(typeof world.observation.nextAction.type, 'string');
      const early = world.act({ type: 'submit_answer', answerId: first.oracle.answerId });
      assert.equal(early.status, 'rejected');
      let last = early;
      while (!world.terminal) last = world.act(testActionFor(world, first.oracle.answerId, answerEvidence));
      assert.equal(last.status, 'submitted');
      assert.equal(world.terminal, true);
      assert.equal(world.result().answerId, first.oracle.answerId);
      assert.equal(Object.hasOwn(world.observation, 'oracle'), false);
      const validation = verifyInChild({ ...first.oracle, requireInspection: true,
        requireInteraction: true }, world.result());
      assert.equal(validation.verdict, 'supported',
        `${scenarioId}/${difficulty}: ${JSON.stringify(validation.domainMetrics)}`);
      const malformedWorld = executableModule.createWorld(difficulty, 902);
      const budgetBeforeInvalid = malformedWorld.remaining;
      assert.equal(malformedWorld.act(null).status, 'rejected');
      assert.equal(malformedWorld.remaining, budgetBeforeInvalid - 1);
    }
  }
  assert.notDeepEqual(buildCase('ETT-01', 'simple', 901).observation.candidates[0].evidence,
    buildCase('ETT-02', 'simple', 901).observation.candidates[0].evidence);
}

function testIndependentOracle() {
  const expected = { answerId: 'candidate-2', requireInspection: true };
  const verified = verifyInChild(expected,
    { answerId: 'candidate-2', evidenceRefs: ['candidate:candidate-2:inspection'] });
  const rejected = verifyInChild(expected, { answerId: 'candidate-1', evidenceRefs: ['trace:2'] });
  assert.equal(verified.verdict, 'supported');
  assert.equal(verified.usefulDiscoveries, 1);
  assert.equal(rejected.verdict, 'refuted');
  assert.equal(rejected.usefulDiscoveries, 0);
  const uninspected = verifyInChild(expected, { answerId: 'candidate-2', evidenceRefs: ['trace:1'] });
  assert.equal(uninspected.verdict, 'refuted');
  const legacyControl = verifyInChild({ answerId: 'candidate-2' },
    { answerId: 'candidate-2', evidenceRefs: ['trace:legacy'] });
  assert.equal(legacyControl.verdict, 'supported');
}

function verifyDomainFailure(expected, actionTrace) {
  const proposal = { answerId: expected.answerId, actionTrace,
    evidenceRefs: [`candidate:${expected.answerId}:inspection`, ...expected.requiredActionRefs] };
  return verifyInChild({ ...expected, requireInspection: true, requireInteraction: true }, proposal);
}

function testDomainOracleRejections() {
  const curiosity = buildCase('ETT-01', 'simple', 2301).oracle;
  const weakQuestion = verifyDomainFailure(curiosity, [{ type: 'form_research_question',
    action: { question: 'What is happening here?' } }]);
  assert.equal(weakQuestion.domainChecksPassed, false);
  const wrongTest = verifyDomainFailure(curiosity, [
    { type: 'form_research_question', action: { question: 'Why does this sensor reading depart from its baseline?' } },
    { type: 'test_anomaly_hypothesis', action: { candidateId: curiosity.answerId,
      method: 'random unrelated operation' } }
  ]);
  assert.equal(wrongTest.domainChecksPassed, false);

  const chain = buildCase('ETT-02', 'open', 2301).oracle;
  const repeatedCycles = Array.from({ length: chain.evaluation.minimumUsefulCycles }, () => ({
    stepId: 'research_cycle', action: { question: 'same question each time',
      evidenceCandidateId: chain.answerId } }));
  assert.equal(verifyDomainFailure(chain, repeatedCycles).domainChecksPassed, false);

  const transfer = buildCase('ETT-04', 'simple', 2301).oracle;
  const metrics = transfer.evaluation.metricsByCandidate[transfer.answerId];
  const poorTransfer = verifyDomainFailure(transfer, [
    { type: 'measure_heldout_transfer', action: { candidateId: transfer.answerId,
      prediction: metrics.heldOutAccuracy + 40 } },
    { type: 'check_prior_task_retention', action: { candidateId: transfer.answerId,
      prediction: metrics.oldTaskAccuracyAfter } }
  ]);
  assert.equal(poorTransfer.domainChecksPassed, false);

  const discovery = buildCase('ETT-09', 'simple', 2301).oracle;
  const target = discovery.evaluation.predictionsByCandidate[discovery.answerId];
  const wrong = [...target];
  wrong[0] = !wrong[0];
  const falsePrediction = verifyDomainFailure(discovery, [
    { type: 'state_latent_rule', action: { rule: 'A stable relation predicts new observations.',
      falsifier: 'A repeated contradiction refutes the rule.' } },
    { type: 'predict_fresh_state', action: { candidateId: discovery.answerId, prediction: wrong } },
    { type: 'verify_fresh_prediction', action: { candidateId: discovery.answerId, prediction: wrong } }
  ]);
  assert.equal(falsePrediction.domainChecksPassed, false);
}

function testReplayComparison() {
  const row = { scenarioId: 'ETT-01', difficulty: 'simple', seed: 1001,
    failed: false, proposal: { answerId: 'candidate-1', evidenceRefs: ['evidence:1'] },
    verdict: 'supported', usefulDiscoveries: 1, actions: 2, elapsedMs: 3 };
  const replayed = { ...row, elapsedMs: 900 };
  assert.equal(compareRows([row], [replayed]).mismatches, 0);
  assert.equal(compareRows([row], [{ ...replayed, verdict: 'refuted' }]).mismatches, 1);
  assert.equal(compareSystems([{ id: 'adapter', rows: [row] }],
    [{ id: 'adapter', rows: [replayed] }]).mismatches, 0);
}

function testRunnerOptions() {
  const options = parseArguments(['--model', 'ollama://test', '--seeds', '2',
    '--scenarios', 'all', '--conditions', 'full,llm_only,react_classic,voyager_adapted', '--token-budget', '5000',
    '--output', 'receipt.json']);
  assert.deepEqual(options.conditions, ['full', 'llm_only', 'react_classic', 'voyager_adapted']);
  assert.throws(() => parseArguments(['--conditions', 'invented', '--output', 'x.json']));
  const tasks = buildTasks({ seeds: 2, conditions: ['full', 'react_classic'] }, scenarioModules('all'));
  assert.equal(tasks.length, 2 * 12 * 3 * 2);
  assert.equal(new Set(tasks.map((task) => `${task.scenario.id}:${task.difficulty}:${task.seed}:${task.condition}`)).size,
    tasks.length);
  const resume = parseArguments(['--resume', 'receipt.json', '--model', 'ollama://test',
    '--seeds', '2', '--scenarios', 'all', '--conditions', 'full,react_classic',
    '--token-budget', '5000']);
  assert.equal(resume.output, 'receipt.json');
  assert.throws(() => parseArguments(['--resume', 'one.json', '--output', 'two.json']));
}

function testResumeContracts() {
  const options = parseArguments(['--resume', 'receipt.json', '--model', 'ollama://test',
    '--conditions', 'full,voyager_adapted']);
  const report = { schema: 'genos.ett-runtime-campaign/v4', model: options.model,
    scenarioSet: options.scenarios, conditions: options.conditions, seeds: [1001],
    tokenBudget: options.tokenBudget, split: 'development', holdout: false,
    measuredTokens: 200000, status: 'partial_global_token_budget_reserve_reached', records: [] };
  assert.doesNotThrow(() => validateResume(report, options));
  assert.equal(report.status, 'partial_campaign_token_budget_reached');
  const extended = parseArguments(['--resume', 'receipt.json', '--model', 'ollama://test',
    '--seeds', '10', '--conditions', 'full,voyager_adapted']);
  assert.doesNotThrow(() => validateResume(report, extended));
  assert.equal(report.seeds.length, 10);
  const increased = parseArguments(['--resume', 'receipt.json', '--model', 'ollama://test',
    '--seeds', '10', '--token-budget', '1000000', '--conditions', 'full,voyager_adapted']);
  assert.doesNotThrow(() => validateResume(report, increased));
  assert.equal(report.tokenBudget, 1000000);
  assert.equal(report.budgetAdjustments.at(-1).previousTokenBudget, 250000);
  const exhausted = { ...report, status: 'partial_campaign_token_budget_reached', measuredTokens: 1000000 };
  assert.throws(() => validateResume(exhausted, increased), /budget is exhausted/);
  const world = scenarioModules('priority').find((scenario) => scenario.id === 'ETT-01')
    .createWorld('simple', 1001);
  const observationHash = createHash('sha256').update(JSON.stringify(world.observation)).digest('hex');
  const previous = { scenarioId: 'ETT-01', difficulty: 'simple', seed: 1001,
    condition: 'voyager_adapted', observation: world.observation, observationHash,
    outcome: { submittedAnswerId: 'candidate-1', oracleVerdict: 'supported' } };
  assert.doesNotThrow(() => validateStoredRecords({ conditions: options.conditions,
    records: [previous] }, scenarioModules('priority')));
  assert.throws(() => validateStoredRecords({ conditions: options.conditions,
    records: [{ ...previous, observationHash: 'changed' }] }, scenarioModules('priority')),
  /scenario data changed/);
  assert.equal(remainingTasks([{ scenario: { id: 'ETT-01' }, difficulty: 'simple',
    seed: 1001, condition: 'voyager_adapted' }], [previous]).length, 0);
  let restored = 0;
  restoreAdapterState(new Map([['voyager_adapted', { recordVerified: (_testCase, _proposal, verdict) => {
    if (verdict.verdict === 'supported') restored += 1;
  } }]]), [previous]);
  assert.equal(restored, 1);
}

async function testIndependentAdapters() {
  assert.deepEqual(SYSTEM_IDS, ['react_classic', 'periodic_llm_loop', 'voyager_adapted',
    'ai_scientist_v2_adapted', 'darwin_godel_machine_adapted']);
  const captures = new Map();
  const ledgers = SYSTEM_IDS.map((id) => {
    const calls = [];
    captures.set(id, calls);
    return { async generateJson(request) {
      calls.push(request.prompt);
      return { value: { answerId: 'candidate-0', evidenceRefs: ['candidate-0:metric'],
        hypothesis: 'candidate-0 is best', experiment: 'compare the public metric' } };
    }, takeSnapshot: () => ({ tokens: calls.length, usd: 0, seconds: 0,
      measured: true, calls: calls.length, callDetails: [] }) };
  });
  const adapters = SYSTEM_IDS.map((id, index) => createIndependentAdapter(id,
    { model: 'ollama://test', ledger: ledgers[index] }));
  assert.equal(new Set(adapters).size, SYSTEM_IDS.length);
  for (const adapter of adapters) {
    assert.equal(typeof adapter.solve, 'function');
    assert.equal(typeof adapter.recordVerified, 'function');
    assert.equal(typeof adapter.takeUsage, 'function');
    assert.match(adapter.disclosure, /Independent/);
  }
  const testCase = buildCase('ETT-01', 'simple', 1001);
  const checks = adapters.map(async (adapter) => {
    const proposal = await adapter.solve(testCase);
    adapter.recordVerified(testCase, proposal, { verdict: 'supported' });
    return adapter.solve(testCase);
  });
  await Promise.all(checks);
  assert.deepEqual(SYSTEM_IDS.map((id) => captures.get(id).length), [2, 6, 2, 4, 4]);
  assert.match(captures.get('react_classic')[0], /thought\/action\/observation/);
  assert.match(captures.get('periodic_llm_loop')[2], /Re-evaluation 3\/3/);
  assert.match(captures.get('voyager_adapted')[1], /candidate-0/);
  assert.match(captures.get('ai_scientist_v2_adapted')[0], /competing interpretations/);
  assert.match(captures.get('ai_scientist_v2_adapted')[1], /candidate-0 is best/);
  assert.match(captures.get('darwin_godel_machine_adapted')[0], /bounded decision-policy/);
  assert.throws(() => createIndependentAdapter('unknown', { model: 'ollama://test' }));

  for (const id of SYSTEM_IDS) {
    const caseData = buildCase('ETT-01', 'simple', 1103);
    const answerEvidence = caseData.observation.candidates.find((candidate) =>
      candidate.id === caseData.oracle.answerId).evidence;
    const world = scenarioModules('priority').find((item) => item.id === 'ETT-01')
      .createWorld('simple', 1103);
    const prompts = [];
    let calls = 0;
    const ledger = { async generateJson(request) {
      prompts.push(request.prompt);
      calls += 1;
      return { value: { action: testActionFor(world, caseData.oracle.answerId, answerEvidence) } };
    }, takeSnapshot: () => ({ tokens: calls, usd: 0, seconds: 0,
      measured: true, calls, callDetails: [] }) };
    const adapter = createIndependentAdapter(id, { model: 'ollama://test', ledger });
    const proposal = await adapter.solve({ caseId: world.caseId,
      scenarioId: 'ETT-01', difficulty: 'simple', observation: world.observation, world });
    assert.equal(proposal.answerId, caseData.oracle.answerId);
    assert.equal(proposal.actions, world.observation.totalSteps + 1);
    assert.equal(proposal.evidenceRefs.includes(`candidate:${caseData.oracle.answerId}:inspection`), true);
    const verification = verifyInChild({ ...caseData.oracle, requireInspection: true,
      requireInteraction: true }, proposal);
    assert.equal(verification.verdict, 'supported');
    assert.match(prompts[1], /Latest environment response/);
  }
}

function testReportRenameRetry() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ett-report-'));
  const source = path.join(directory, 'report.tmp');
  const destination = path.join(directory, 'report.json');
  const rename = fs.renameSync;
  let attempts = 0;
  fs.writeFileSync(source, 'updated');
  fs.writeFileSync(destination, 'prior');
  fs.renameSync = (...args) => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('temporary lock'), { code: 'EPERM' });
    return rename(...args);
  };
  try {
    renameReportWithRetry(source, destination, 1);
    assert.equal(attempts, 2);
    assert.equal(fs.readFileSync(destination, 'utf8'), 'updated');
    assert.equal(fs.existsSync(source), false);
  } finally {
    fs.renameSync = rename;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  testScenarioRegistry();
  testIndependentOracle();
  testDomainOracleRejections();
  testReplayComparison();
  testRunnerOptions();
  testResumeContracts();
  testReportRenameRetry();
  await testCampaignBudgetGuard();
  await testIndependentAdapters();
  process.stdout.write('ETT runtime campaign contracts passed.\n');
}

main();
