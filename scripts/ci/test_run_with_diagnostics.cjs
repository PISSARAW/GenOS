'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const runner = path.join(__dirname, 'run_with_diagnostics.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ci-diagnostics-'));
const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'validation.yml'), 'utf8');

function execute(name, source) {
  const report = path.join(directory, `${name}.json`);
  const result = spawnSync(process.execPath, [runner, '--output', report, '--name', name,
    '--', process.execPath, '-e', source], { encoding: 'utf8' });
  return { result, report: JSON.parse(fs.readFileSync(report, 'utf8')) };
}

try {
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest\]/);
  assert.match(workflow, /node: \[20, 22\]/);
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /Publish CI diagnostics[\s\S]+if: always\(\)/);
  assert.match(workflow, /if-no-files-found: error/);

  const success = execute('success', "process.stdout.write('probe-ok')");
  assert.equal(success.result.status, 0);
  assert.match(success.result.stdout, /probe-ok/);
  assert.equal(success.report.schema, 'genos.ci-command-diagnostic/v1');
  assert.equal(success.report.outcome, 'passed');
  assert.equal(success.report.exitCode, 0);
  assert.equal(success.report.environment.nodeVersion, process.version);
  assert.match(success.report.environment.lockfiles['package-lock.json'], /^sha256:[a-f0-9]{64}$/);
  assert.equal(fs.readFileSync(path.join(directory, 'success.stdout.log'), 'utf8'), 'probe-ok');

  const failure = execute('failure', "process.stderr.write('probe-failed'); process.exit(7)");
  assert.equal(failure.result.status, 7);
  assert.match(failure.result.stderr, /probe-failed/);
  assert.equal(failure.report.outcome, 'failed');
  assert.equal(failure.report.exitCode, 7);
  assert.equal(fs.readFileSync(path.join(directory, 'failure.stderr.log'), 'utf8'), 'probe-failed');

  console.log('CI diagnostic runner preserves output, context and command failures.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
