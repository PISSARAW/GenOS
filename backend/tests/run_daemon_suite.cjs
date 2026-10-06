'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pattern = /^test_(daemon_|resident_daemon|holobiont_resident_daemon|rhizome_daemon|topology_daemon|apoptosis_and_daemon|controlled_finding_runner|morphogenesis_control_daemon_findings).*\.js$/;

function runTest(test) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-daemon-suite-'));
  const env = { ...process.env, GENOS_DB_PATH: path.join(root, 'test.db'),
    GENOS_CONFIG_DIR: path.join(root, 'config'), GENOS_REPORT_DIR: path.join(root, 'reports'),
    GENOS_STARTUP_DIR: path.join(root, 'startup'), GENOS_GITHUB_PROJECTS_DIR: path.join(root, 'repos'),
    GENOS_ADMIN_PASSWORD: 'isolated-daemon-test-password', GENOS_DB_BACKUP_SKIP: '1' };
  fs.mkdirSync(env.GENOS_GITHUB_PROJECTS_DIR);
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], {
    env, cwd: path.resolve(__dirname, '..'), timeout: 300000, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
  });
  const passed = result.status === 0 && !result.error;
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${test}\n`);
  if (!passed) process.stderr.write(`${result.error?.message || ''}\n${result.stdout || ''}${result.stderr || ''}`);
  return { test, passed, status: result.status, error: result.error?.message || null };
}

function main() {
  const tests = fs.readdirSync(__dirname).filter((name) => pattern.test(name)).sort();
  const selected = process.argv.slice(2);
  const results = tests.filter((test) => selected.length === 0 || selected.some((name) => test.includes(name))).map(runTest);
  const passed = results.filter((result) => result.passed).length;
  process.stdout.write(`Daemon suites: ${passed}/${results.length}\n`);
  process.exitCode = results.length > 0 && passed === results.length ? 0 : 1;
}

main();
