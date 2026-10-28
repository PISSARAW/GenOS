'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { SCENARIO_IDS, LEVELS, SPECS, buildCase, referenceScore } = require('../scenarios/runtime');
const { scenarioModules, parseArguments, buildTasks, casePayload, remainingTasks,
  validateResume, validateStoredRecords, restoreAdapterState } = require('../run_runtime_campaign');
const { verifyInChild } = require('../evaluation/verifyInChild');
const { compareRows, compareSystems } = require('../evaluation/replay');
const { SYSTEM_IDS, createIndependentAdapter } = require('../adapters/independent');

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
      assert.equal(world.observation.candidates.every((candidate) => !Object.hasOwn(candidate, 'evidence')), true);
      assert.equal(world.observation.availableActions.includes('inspect_candidate'), true);
      const inspected = world.act({ type: 'inspect_candidate', candidateId: world.observation.candidates[0].id });
      assert.equal(inspected.status, 'observed');
      assert.equal(Object.hasOwn(inspected, 'evidence'), true);
      const submitted = world.act({ type: 'submit_answer', answerId: first.oracle.answerId });
      assert.equal(submitted.status, 'submitted');
      assert.equal(world.terminal, true);
      assert.equal(world.result().answerId, first.oracle.answerId);
      assert.equal(Object.hasOwn(world.observation, 'oracle'), false);
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
  const report = { schema: 'genos.ett-runtime-campaign/v2', model: options.model,
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

  const interactive = SYSTEM_IDS.map((id) => {
    const prompts = [];
    let calls = 0;
    const ledger = { async generateJson(request) {
      prompts.push(request.prompt);
      calls += 1;
      const action = calls === 1
        ? { type: 'inspect_candidate', candidateId: 'candidate-0' }
        : { type: 'submit_answer', answerId: 'candidate-0' };
      return { value: { action } };
    }, takeSnapshot: () => ({ tokens: calls, usd: 0, seconds: 0,
      measured: true, calls, callDetails: [] }) };
    return { id, prompts, adapter: createIndependentAdapter(id,
      { model: 'ollama://test', ledger }) };
  });
  for (const entry of interactive) {
    const world = scenarioModules('priority').find((item) => item.id === 'ETT-01')
      .createWorld('simple', 1103);
    const proposal = await entry.adapter.solve({ caseId: world.caseId,
      scenarioId: 'ETT-01', difficulty: 'simple', observation: world.observation, world });
    assert.equal(proposal.answerId, 'candidate-0');
    assert.equal(proposal.actions, 2);
    assert.deepEqual(proposal.evidenceRefs, ['candidate:candidate-0:inspection']);
    assert.match(entry.prompts[1], /Latest environment response/);
  }
}

async function main() {
  testScenarioRegistry();
  testIndependentOracle();
  testReplayComparison();
  testRunnerOptions();
  testResumeContracts();
  await testIndependentAdapters();
  process.stdout.write('ETT runtime campaign contracts passed.\n');
}

main();
