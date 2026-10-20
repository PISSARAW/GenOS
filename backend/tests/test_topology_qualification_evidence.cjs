'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runner = require('./run_topology_contracts.cjs');

function sink() {
  let value = '';
  return { write: (chunk) => { value += chunk; }, value: () => value };
}

function fakeGitMetadata() {
  return { sha: 'abc123', dirty: true, status: [' M fixture.js'], observed: true };
}

function runCase(input) {
  const args = input.args || ['--topology=biocenose'];
  const stdout = sink();
  const stderr = sink();
  const evidenceFile = path.join(input.root, `${input.name}.json`);
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  const result = runner.main(args, {
    stdout, stderr, evidenceFile,
    env: { GENOS_TOPOLOGY_SUITE_TIMEOUT_MS: '1000', GENOS_TOPOLOGY_CHILD_TIMEOUT_MS: '500',
      GENOS_QUALIFICATION_SEED: 'seed-17', GENOS_QUALIFICATION_PROVIDER: 'provider-a',
      GENOS_QUALIFICATION_BUDGETS_JSON: '{"tokens":1200}',
      GENOS_QUALIFICATION_ARTIFACTS_JSON: '[{"path":"oracle.json"}]',
      GENOS_QUALIFICATION_PRODUCER_ID: 'producer-a',
      GENOS_QUALIFICATION_VERIFIER_ID: 'verifier-b' },
    dependencies: { spawnSync: input.spawnSync, gitMetadata: fakeGitMetadata }
  });
  const exitCode = process.exitCode;
  process.exitCode = previousExitCode;
  return { result, exitCode, stdout: stdout.value(), stderr: stderr.value(),
    dossier: JSON.parse(fs.readFileSync(evidenceFile, 'utf8')) };
}

function verifyCommon(dossier) {
  assert.equal(dossier.schema, 'genos.qualification-evidence-bundle/v1');
  assert.equal(dossier.terminal, true);
  assert.equal(dossier.revision.sha, 'abc123');
  assert.equal(dossier.revision.dirty, true);
  assert.equal(dossier.environment.platform, process.platform);
  assert.equal(dossier.experiment.seed, 'seed-17');
  assert.equal(dossier.experiment.provider, 'provider-a');
  assert.deepEqual(dossier.experiment.budgets, { tokens: 1200 });
  assert.equal(dossier.actors.independent, true);
  assert.deepEqual(dossier.artifacts, [{ path: 'oracle.json' }]);
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-topology-evidence-'));
  try {
    const passed = runCase({ root, name: 'qualified', spawnSync: () => ({ status: 0,
      signal: null, stdout: 'verified\n', stderr: '' }) });
    verifyCommon(passed.dossier);
    assert.equal(passed.dossier.verdict, 'qualified');
    assert.equal(passed.exitCode, 0);
    assert.equal(passed.dossier.commands[0].exitCode, 0);
    assert.equal(passed.dossier.testsNotRun.length, 0);

    const timeout = runCase({ root, name: 'timeout', spawnSync: () => ({ status: null, signal: 'SIGTERM',
      stdout: 'partial topology output\n', stderr: '',
      error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) }) });
    verifyCommon(timeout.dossier);
    assert.equal(timeout.dossier.verdict, 'inconclusive');
    assert.equal(timeout.exitCode, 1);
    assert.equal(timeout.dossier.commands[0].status, 'TIMEOUT');
    assert.match(timeout.dossier.commands[0].output.stdout.excerpt, /partial topology output/);

    const failed = runCase({ root, name: 'failed',
      spawnSync: () => ({ status: 9, signal: null, stdout: '', stderr: 'assertion failed\n' }),
      args: ['--topology=a_team'] });
    assert.equal(failed.dossier.verdict, 'failed');
    assert.equal(failed.dossier.commands.length, 1);
    assert.equal(failed.dossier.commands[0].exitCode, 9);
    const selected = runner.runSelection(['--topology=a_team']);
    const expectedSkipped = runner.plannedTests(selected).length - 1;
    assert.equal(failed.dossier.testsNotRun.length, expectedSkipped,
      'commands skipped after a failure must remain explicit');

    const blocked = runCase({ root, name: 'blocked', spawnSync: () => ({ status: null, signal: null,
      stdout: '', stderr: '',
      error: Object.assign(new Error('missing executable'), { code: 'ENOENT' }) }) });
    assert.equal(blocked.dossier.verdict, 'environment_blocked');
    assert.equal(blocked.exitCode, 1);

    const invalid = runCase({ root, name: 'runner-error',
      spawnSync: () => ({ status: 0, stdout: '', stderr: '' }), args: ['--topology=missing'] });
    assert.equal(invalid.dossier.verdict, 'failed');
    assert.equal(invalid.dossier.commands.length, 0);
    assert.equal(invalid.dossier.failures[0].testId, 'runner');
    assert.equal(invalid.exitCode, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('Topology qualification evidence: terminal dossiers and fail-closed verdicts PASS');
}

main();
