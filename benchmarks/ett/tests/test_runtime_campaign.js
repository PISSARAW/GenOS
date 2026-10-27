'use strict';

const assert = require('node:assert/strict');
const { SCENARIO_IDS, LEVELS, SPECS, buildCase, referenceScore } = require('../scenarios/runtime');
const { scenarioModules, parseArguments, buildTasks, casePayload } = require('../run_runtime_campaign');
const { verifyInChild } = require('../evaluation/verifyInChild');
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
      assert.equal(executableModule.build(difficulty, 901).observation.domain, first.observation.domain);
      assert.equal(Number.isFinite(referenceScore(scenarioId, first.observation.candidates[0].evidence)), true);
    }
  }
  assert.notDeepEqual(buildCase('ETT-01', 'simple', 901).observation.candidates[0].evidence,
    buildCase('ETT-02', 'simple', 901).observation.candidates[0].evidence);
}

function testIndependentOracle() {
  const expected = { answerId: 'candidate-2' };
  const verified = verifyInChild(expected, { answerId: 'candidate-2', evidenceRefs: ['trace:1'] });
  const rejected = verifyInChild(expected, { answerId: 'candidate-1', evidenceRefs: ['trace:2'] });
  assert.equal(verified.verdict, 'supported');
  assert.equal(verified.usefulDiscoveries, 1);
  assert.equal(rejected.verdict, 'refuted');
  assert.equal(rejected.usefulDiscoveries, 0);
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
  assert.match(captures.get('periodic_llm_loop')[2], /Round 3\/3/);
  assert.match(captures.get('voyager_adapted')[1], /candidate-0/);
  assert.match(captures.get('ai_scientist_v2_adapted')[0], /competing interpretations/);
  assert.match(captures.get('ai_scientist_v2_adapted')[1], /candidate-0 is best/);
  assert.match(captures.get('darwin_godel_machine_adapted')[0], /bounded decision-policy/);
  assert.throws(() => createIndependentAdapter('unknown', { model: 'ollama://test' }));
}

async function main() {
  testScenarioRegistry();
  testIndependentOracle();
  testRunnerOptions();
  await testIndependentAdapters();
  process.stdout.write('ETT runtime campaign contracts passed.\n');
}

main();
