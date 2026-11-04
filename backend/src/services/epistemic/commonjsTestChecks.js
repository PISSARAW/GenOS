'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const contracts = require('./commonjsTestContract');

function check(subject, strategy) {
  contracts.assertSources(subject);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-commonjs-oracle-'));
  try {
    for (const source of subject.sources) fs.writeFileSync(path.join(root, source.path), source.content, {flag: 'wx'});
    const order = strategy === 'source_recompute' ? subject.contract.tests : [...subject.contract.tests].reverse();
    const tests = order.map(test => execute(root, test));
    return {schema: 'genos.workspace-postconditions/v1', strategy,
      status: tests.every(test => test.exitCode === 0 && !test.error) ? 'verified' : 'refuted',
      reason: 'sealed_commonjs_public_tests_executed', tests, nestedProcesses: tests.length,
      scope: 'sealed_public_tests_only_no_heldout_correctness_claim'};
  } finally {fs.rmSync(root, {recursive: true, force: true});}
}

function execute(root, test) {
  const sentinel = 'GENOS_ORACLE_COMPLETED_' + randomUUID();
  const input = fs.readFileSync(path.join(root, test), 'utf8')
    + '\n;process.once("beforeExit",()=>process.stdout.write(' + JSON.stringify('\n' + sentinel + '\n') + '));\n';
  const result = spawnSync(process.execPath, ['--permission', '--allow-fs-read=' + root, '-'], {cwd: root, windowsHide: true, input,
    env: require('../localCodeTestEnvironment').build(root), shell: false, timeout: 5000, maxBuffer: 65536});
  const completed = String(result.stdout || '').includes('\n' + sentinel + '\n');
  return {command: 'node ' + test, exitCode: completed ? result.status : 1,
    processExitCode: result.status, processId: result.pid, completed, signal: result.signal,
    error: result.error?.code || null, stdout: String(result.stdout || ''), stderr: String(result.stderr || '')};
}
module.exports = {check};
