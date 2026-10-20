'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const processRunner = require('./helpers/suiteProcessRunner.cjs');
const biocenose = require('./run_biocenose_suite.js');
const topology = require('./run_topology_contracts.cjs');
const validation = require('./run_validation_suite.js');

const fixture = path.join(__dirname, 'fixtures', 'suiteRunnerChild.cjs');

function sink() {
  let value = '';
  return { write: (chunk) => { value += chunk; }, value: () => value };
}

function runFixture(mode, timeoutMs) {
  return processRunner.runProcess({
    command: process.execPath, args: [fixture, mode], cwd: path.join(__dirname, '..'),
    env: process.env, timeoutMs, deadlineMs: Date.now() + 2000
  });
}

function testProcessOutcomes() {
  const passed = runFixture('pass', 1000);
  assert.equal(passed.status, 'PASS');
  assert.match(passed.stdout, /complete output/);

  const failed = runFixture('fail', 1000);
  assert.equal(failed.status, 'FAIL');
  assert.equal(failed.exitCode, 7);
  assert.match(failed.stdout, /partial stdout/);
  assert.match(failed.stderr, /failure detail/);

  const timedOut = runFixture('timeout', 500);
  assert.equal(timedOut.status, 'TIMEOUT');
  assert.equal(timedOut.errorCode, 'ETIMEDOUT');
  assert.match(timedOut.stdout, /partial before timeout/);
  assert.match(processRunner.formatOutcome('fixture', timedOut), /signal=.*error=ETIMEDOUT/);
}

function testBiocenoseDeadline() {
  const stdout = sink();
  const stderr = sink();
  let clock = -30;
  let spawns = 0;
  const now = () => { clock += 30; return clock; };
  const spawnSync = () => { spawns += 1; return { status: 0, stdout: '', stderr: '' }; };
  const result = biocenose.runSuite({
    args: [], catalog: ['test_biocenose_one.js', 'test_biocenose_two.js'],
    env: { GENOS_BIOCENOSE_SUITE_TIMEOUT_MS: '100', GENOS_BIOCENOSE_TEST_TIMEOUT_MS: '90' },
    stdout, stderr
  }, { now, spawnSync });
  assert.equal(spawns, 1);
  assert.equal(result.passed, 1);
  assert.equal(result.timedOut, 1);
  assert.match(stdout.value(), /\[TIMEOUT\].*SUITE_DEADLINE_EXCEEDED/);
  assert.match(stdout.value(), /Biocenose summary: total=2 passed=1 failed=0 timedOut=1/);
}

function testTimeoutMainExit() {
  const stdout = sink();
  const stderr = sink();
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  const result = biocenose.main([], {
    catalog: ['test_biocenose_timeout.js'], stdout, stderr,
    env: { GENOS_BIOCENOSE_SUITE_TIMEOUT_MS: '1', GENOS_BIOCENOSE_TEST_TIMEOUT_MS: '1' },
    dependencies: { now: () => 10, spawnSync: () => ({
      status: null, signal: 'SIGTERM', stdout: 'partial\n', stderr: '',
      error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })
    }) }
  });
  assert.equal(result.timedOut, 1);
  assert.equal(process.exitCode, 1);
  assert.match(stdout.value(), /Biocenose summary:.*timedOut=1/);
  process.exitCode = previousExitCode;
}

function timeoutResult() {
  return {
    status: null, signal: 'SIGTERM', stdout: 'partial topology output\n', stderr: '',
    error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })
  };
}

function testTopologyTimeoutMainExit() {
  const stdout = sink();
  const stderr = sink();
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  const result = topology.main(['--topology=biocenose'], {
    stdout, stderr, env: { GENOS_TOPOLOGY_SUITE_TIMEOUT_MS: '1000',
      GENOS_TOPOLOGY_CHILD_TIMEOUT_MS: '100' },
    dependencies: { spawnSync: timeoutResult }
  });
  assert.equal(result.failures.length, 1);
  assert.equal(process.exitCode, 1);
  assert.match(stdout.value(), /partial topology output/);
  assert.match(stdout.value(), /\[TIMEOUT\].*error=ETIMEDOUT/);
  assert.match(stdout.value(), /Topology runner summary: failures=1/);
  process.exitCode = previousExitCode;
}

function testCatalogAndFilters() {
  const catalog = ['test_biocenose_alpha.js', 'test_biocenose_beta.js'];
  assert.deepEqual(biocenose.selectedFiles([], catalog), catalog);
  assert.deepEqual(biocenose.selectedFiles(['--test=test_biocenose_beta.js'], catalog),
    ['test_biocenose_beta.js']);
  assert.throws(() => biocenose.selectedFiles(['--test=missing.js'], catalog), /Unknown Biocenose test/);
  assert.deepEqual(topology.selectedTopologies(['--topology=biocenose']).map((item) => item.id),
    ['biocenose']);
  assert.throws(() => topology.selectedTopologies(['--topology=missing']), /Unknown topology/);
}

function testCompletionAdapterCampaignCatalog() {
  const dynamic = [
    ['trinity', 'tests/run_trinity_suite.js', /^test_trinity_.*\.js$/],
    ['biome', 'tests/run_biome_suite.js', /^test_biome_.*\.js$/],
    ['biocenose', 'tests/run_biocenose_suite.js', /^test_biocenose_.*\.js$/],
    ['rhizome', 'tests/run_rhizome_suite.js', /^test_rhizome.*\.js$/],
    ['holobionte', 'tests/run_holobiont_suite.js', /^test_holobion[t_].*\.js$/]
  ];
  const covered = new Set();
  for (const [id, carrier, pattern] of dynamic) {
    const check = topology.topologyChecks.find((item) => item.id === id);
    const test = `test_${id}_completion_adapter.js`;
    assert.ok(check.scripts.some((command) => command[0] === carrier), `${id} carrier missing`);
    assert.ok(pattern.test(test), `${test} is outside the dynamic suite catalog`);
    assert.ok(fs.existsSync(path.join(__dirname, test)), `${test} missing`);
    covered.add(id);
  }
  const aTeam = topology.topologyChecks.find((item) => item.id === 'a_team');
  assert.ok(aTeam.scripts.some((command) => command[0] ===
    'tests/test_ateam_completion_adapter.js'));
  covered.add('a_team');
  const metapopulation = topology.topologyChecks.find((item) => item.id === 'metapopulation');
  assert.ok(metapopulation.scripts.some((command) => command.join(' ') ===
    'tests/run_validation_suite.js metapopulation'));
  assert.ok(validation.suites.metapopulation.some(([, file]) =>
    file === 'test_metapopulation_completion_adapter.js'));
  covered.add('metapopulation');
  assert.deepEqual([...covered].sort(),
    ['a_team', 'biocenose', 'biome', 'holobionte', 'metapopulation', 'rhizome', 'trinity']);
}

function testCoherentParentDeadline() {
  const policy = biocenose.createPolicy({
    GENOS_BIOCENOSE_SUITE_TIMEOUT_MS: '10000',
    GENOS_PARENT_DEADLINE_EPOCH_MS: '5000', GENOS_RUNNER_GRACE_MS: '500'
  }, 1000);
  assert.equal(policy.deadlineMs, 4500);
  assert.equal(topology.createPolicy({
    GENOS_TOPOLOGY_SUITE_TIMEOUT_MS: '5000', GENOS_TOPOLOGY_CHILD_TIMEOUT_MS: '1000'
  }, 100).deadlineMs, 5100);
  assert.throws(() => biocenose.createPolicy({
    GENOS_BIOCENOSE_SUITE_TIMEOUT_MS: '1', GENOS_BIOCENOSE_TEST_TIMEOUT_MS: '0'
  }, 0), /GENOS_BIOCENOSE_TEST_TIMEOUT_MS/);
  assert.throws(() => topology.createPolicy({ GENOS_TOPOLOGY_SUITE_TIMEOUT_MS: '-1' }, 0),
    /GENOS_TOPOLOGY_SUITE_TIMEOUT_MS/);
}

function testChildDeadlinePropagation() {
  let propagated;
  const spawnSync = (command, args, options) => {
    propagated = Number(options.env.GENOS_PARENT_DEADLINE_EPOCH_MS);
    return { status: 0, stdout: '', stderr: '' };
  };
  const outcome = topology.runScript(['tests/unused.js'], {
    env: {}, now: () => 1000, policy: { deadlineMs: 10000, childTimeoutMs: 2000 },
    dependencies: { spawnSync, now: () => 1000 }
  });
  assert.equal(outcome.status, 'PASS');
  assert.equal(propagated, 3000);
}

testProcessOutcomes();
testBiocenoseDeadline();
testTimeoutMainExit();
testTopologyTimeoutMainExit();
testCatalogAndFilters();
testCompletionAdapterCampaignCatalog();
testCoherentParentDeadline();
testChildDeadlinePropagation();
console.log('Suite runners: deadlines, child timeout, partial output, failures and filters PASS');
