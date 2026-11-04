'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { hash, tree } = require('./io.cjs');
const protocol = require('./protocol.json');
const cases = {
  'stateful-rollback-trap': require('./graders/rollback.cjs'),
  'silent-swallow-trap': require('./graders/swallow.cjs'),
  'budget-spiral-trap': require('./graders/spiral.cjs')
};
function environment() {
  return Object.fromEntries(['SystemRoot', 'WINDIR'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
}
function execute(workspace, script) {
  const started = Date.now();
  const sentinel = `DPB_COMPLETED_${randomUUID()}`;
  const input = `${script}\n;process.once('beforeExit',()=>process.stdout.write(${JSON.stringify('\n' + sentinel + '\n')}));\n`;
  const result = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${workspace}`, '-'], {
    cwd: workspace, input, env: environment(), encoding: 'utf8', timeout: protocol.testTimeoutMs,
    maxBuffer: 256 * 1024, windowsHide: true
  });
  const completed = Boolean(result.stdout?.includes('\n' + sentinel + '\n'));
  return { executed: true, exitCode: completed ? result.status : 1, processExitCode: result.status, completed,
    signal: result.signal, timedOut: result.error?.code === 'ETIMEDOUT', error: result.error?.code || null,
    stdout: (result.stdout || '').replace('\n' + sentinel + '\n', ''), stderr: result.stderr || '', elapsedMs: Date.now() - started };
}
function test(workspace, name) {
  const script = fs.readFileSync(path.join(workspace, name), 'utf8');
  return { command: `node ${name}`, scriptHash: hash(script), ...execute(workspace, script) };
}
function hidden(workspace, run) {
  const before = tree(workspace);
  const checks = cases[run.task].map(check => {
    const script = `'use strict';const assert=require('node:assert/strict');const n=${13 + run.seed % 79};\n${check.script}`;
    const result = execute(workspace, script);
    return { id: check.id, passed: result.exitCode === 0 && !result.timedOut, ...result };
  });
  if (JSON.stringify(before) !== JSON.stringify(tree(workspace))) throw Error('ORACLE_CHANGED_WORKSPACE');
  return { checks, passed: checks.filter(check => check.passed).length, total: 8, tree: before };
}
module.exports = { execute, test, hidden };
