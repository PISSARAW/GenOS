'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const oracles = require('./holdout-oracles/regime-change-oracles.cjs');
const analysis = require('./regime-change-analysis.cjs');
const adapters = require('./comparisonAdapters.cjs');
const qualification = require('./regime-change-qualification.cjs');
const { selectFrozen } = require('./run-regime-change-campaign.cjs');

test('regime oracles accept valid candidates and reject violations', () => {
  const cap = { oracle: 'verifyCapacity', oracleParams: { items: [{ id: 'a', w: 2 }, { id: 'b', w: 3 }], bins: 2, cap: 3 } };
  assert.equal(oracles.verifyRegimeCandidate(cap, { bins: [['a'], ['b']] }).passed, true);
  assert.equal(oracles.verifyRegimeCandidate(cap, { bins: [['a', 'b'], []] }).passed, false);
  const dag = { oracle: 'verifyOrder', oracleParams: { steps: ['a', 'b'], edges: [['a', 'b']], revealedEdges: [] } };
  assert.equal(oracles.verifyRegimeCandidate(dag, { order: ['a', 'b'] }).passed, true);
  assert.equal(oracles.verifyRegimeCandidate(dag, { order: ['b', 'a'] }).passed, false);
  assert.throws(() => oracles.verifyRegimeCandidate({ oracle: 'nope' }, {}), /Unknown regime oracle/);
});

test('paired analysis reports a fully positive interval only on real gains', () => {
  const winning = Array.from({ length: 20 }, (_, i) => ({ adaptive: true, control: i < 12 }));
  const stats = analysis.pairedDifference(winning);
  assert.ok(stats.lo > 0);
  const tied = Array.from({ length: 10 }, () => ({ adaptive: true, control: true }));
  assert.equal(analysis.mcnemarP(0, 0), 1);
  assert.ok(analysis.pairedDifference(tied).lo <= 0);
});

test('adapter resolves frozen and imposed topologies per task', () => {
  const task = { adaptedTopology: 'a_team', wrongTopology: 'TriNity' };
  assert.equal(adapters.resolvedTopology({ id: 'genos-wrong' }, task), 'trinity');
  assert.equal(adapters.resolvedTopology({ id: 'genos-frozen', topology: 'biome' }, task), 'biome');
  assert.equal(adapters.resolvedTopology({ id: 'genos-adaptive' }, task), null);
  assert.equal(adapters.resolvedAutonomous({}), true);
  assert.equal(adapters.resolvedAutonomous({ autonomous: false }), false);
});

test('nonzero GenOS exit preserves a valid receipt and stdout/stderr diagnostics', async () => {
  const { EventEmitter } = require('node:events');
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  const receipt = { orchestratorId: 'orchestrator-1', token_usage: { totalTokens: 4 } };
  const resultPromise = adapters.executeGenos({ payload: {}, env: {}, repo: __dirname,
    state: { budget: { latencyMs: 1000 }, spawnProcess: () => {
      setImmediate(() => {
        child.stdout.emit('data', `${JSON.stringify(receipt)}\n`);
        child.stderr.emit('data', 'runtime failure detail');
        child.emit('close', 2);
      });
      return child;
    } } });
  const execution = await resultPromise;
  assert.equal(execution.exitCode, 2);
  assert.equal(execution.receipt.orchestratorId, receipt.orchestratorId);
  assert.match(execution.stdoutExcerpt, /orchestrator-1/);
  assert.match(execution.stderrExcerpt, /runtime failure detail/);
});

test('frozen selection prefers pass rate, then tokens, then name', () => {
  const plan = { training: { taskIds: ['train-cap-01'], candidateTopologies: ['trinity', 'a_team', 'biome'] } };
  const attempts = [
    { family: 'regime-cap', topology: 'trinity', parsePassed: true, servedModelOk: true, budgetOk: true, oraclePassed: true, tokenUsage: { total: 9 } },
    { family: 'regime-cap', topology: 'a_team', parsePassed: true, servedModelOk: true, budgetOk: true, oraclePassed: true, tokenUsage: { total: 5 } },
    { family: 'regime-cap', topology: 'biome', parsePassed: true, servedModelOk: true, budgetOk: true, oraclePassed: false, tokenUsage: { total: 1 } }
  ];
  assert.equal(selectFrozen(attempts, plan)['regime-cap'], 'a_team');
});

test('frozen selection refuses to rank a family without a verified Qwen oracle pass', () => {
  const plan = { training: { taskIds: ['train-cap-01'], candidateTopologies: ['biome', 'trinity'] } };
  const attempts = [
    { family: 'regime-cap', topology: 'biome', parsePassed: false, servedModelOk: false, budgetOk: false,
      oraclePassed: false, tokenUsage: { total: null }, error: 'runtime unavailable' },
    { family: 'regime-cap', topology: 'trinity', parsePassed: false, servedModelOk: false, budgetOk: false,
      oraclePassed: false, tokenUsage: { total: null }, error: 'runtime unavailable' }
  ];
  assert.throws(() => selectFrozen(attempts, plan), /No verified Qwen training outcome for family regime-cap/);
});

test('le plan fige actuel est pilote, non confirmatoire', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'regime-change-plan.json'), 'utf8'));
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, plan.taskSetFile), 'utf8'));
  assert.equal(plan.evidenceGrade, 'pilot');
  assert.ok(plan.executionBudget.minimumWorkerTokens >= 1000, 'worker token floor must cover observed morphology prompts');
  assert.equal(plan.executionBudget.minimumWorkerTokens, data.budgets.minimumWorkerTokens);
  assert.equal(plan.requiredRepetitions, 3);
  const result = qualification.qualifyRegimePlan(plan, data.tasks);
  assert.equal(result.grade, 'pilot');
  assert.ok(result.repetitions < result.requiredRepetitions);
  assert.ok(result.reasons.some((r) => /repetitions/i.test(r)));
  assert.ok(result.reasons.some((r) => /familles non disjointes/i.test(r)));
  assert.ok(result.reasons.some((r) => /injection temporelle externe/i.test(r)));
  assert.throws(() => qualification.assertConfirmatory(plan, data.tasks), /non confirmatoire/);
});

test('garde : une repetition et familles communes rejettent confirmatory', () => {
  const plan = { seeds: [104729], requiredRepetitions: 3, familyDisjointness: 'required',
    revealMechanism: 'external-temporal-injection', revealActual: 'external-temporal-injection',
    revealSpec: 'injection externe a mi-mission',
    training: { taskIds: ['train-cap-01'] } };
  const tasks = [
    { id: 'train-cap-01', family: 'regime-cap', split: 'training' },
    { id: 'rc-cap-01', family: 'regime-cap', split: 'holdout' }
  ];
  const result = qualification.qualifyRegimePlan(plan, tasks);
  assert.equal(result.grade, 'pilot');
  assert.ok(result.reasons.some((r) => /repetitions/i.test(r)));
  assert.ok(result.reasons.some((r) => /familles non disjointes/i.test(r)));
  assert.throws(() => qualification.assertConfirmatory(plan, tasks), /non confirmatoire/);
});

test('garde : revelation dans le prompt rejette confirmatory meme avec 3 seeds', () => {
  const plan = { seeds: [1, 2, 3], requiredRepetitions: 3, familyDisjointness: 'required',
    revealMechanism: 'external-temporal-injection', revealActual: 'in-prompt-informational',
    revealSpec: 'La contrainte de phase 2 est contenue dans le prompt.',
    training: { taskIds: ['train-cap-01'] } };
  const tasks = [
    { id: 'train-cap-01', family: 'regime-cap', split: 'training' },
    { id: 'rc-dag-01', family: 'regime-dag', split: 'holdout' }
  ];
  const result = qualification.qualifyRegimePlan(plan, tasks);
  assert.equal(result.grade, 'pilot');
  assert.ok(result.reasons.some((r) => /injection temporelle externe/i.test(r)));
  assert.throws(() => qualification.assertConfirmatory(plan, tasks), /non confirmatoire/);
});

test('garde : 3 repetitions, familles disjointes et injection externe autorisent confirmatory', () => {
  const plan = { seeds: [11, 22, 33], requiredRepetitions: 3, familyDisjointness: 'required',
    revealMechanism: 'external-temporal-injection', revealActual: 'external-temporal-injection',
    revealSpec: 'La contrainte est injectee par l\'exterieur a la frontiere temporelle.',
    training: { taskIds: ['train-cap-01'] } };
  const tasks = [
    { id: 'train-cap-01', family: 'regime-cap', split: 'training' },
    { id: 'rc-dag-01', family: 'regime-dag', split: 'holdout' }
  ];
  const result = qualification.qualifyRegimePlan(plan, tasks);
  assert.equal(result.grade, 'confirmatory');
  assert.deepEqual(result.reasons, []);
  assert.equal(qualification.assertConfirmatory(plan, tasks).grade, 'confirmatory');
});
