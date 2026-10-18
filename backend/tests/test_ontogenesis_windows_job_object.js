'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchInWindowsJob } = require('../src/services/ontogenesis/windowsJobObject');
const { processAlive } = require('../src/services/ontogenesis/processResources');

const FIXTURE = path.join(__dirname, 'helpers', 'windowsJobTreeFixture.cjs');

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(50);
  }
  return predicate();
}

function stop(pid) {
  if (!processAlive(pid)) return;
  try { process.kill(pid); } catch (_) {}
}

async function windowsCheck() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-job-object-'));
  const marker = path.join(directory, 'tree.json');
  let started;
  let tree;
  try {
    started = await launchInWindowsJob({ application: process.execPath,
      arguments: [FIXTURE, marker], cwd: path.resolve(__dirname, '..'), ownerPid: process.pid,
      memoryMb: 256, env: { ...process.env, GENOS_JOB_TEST: 'inherited' } });
    assert.strictEqual(started.confinement, 'windows-job-object');
    assert.strictEqual(started.memoryLimitMb, 256);
    assert.ok(await waitUntil(() => fs.existsSync(marker), 10000));
    tree = JSON.parse(fs.readFileSync(marker, 'utf8'));
    assert.strictEqual(tree.rootPid, started.pid);
    assert.strictEqual(tree.inherited, 'inherited');
    assert.ok(processAlive(tree.rootPid));
    assert.ok(processAlive(tree.leafPid));
    stop(started.hostPid);
    assert.ok(await waitUntil(() => !processAlive(tree.rootPid) && !processAlive(tree.leafPid), 10000),
      'la fermeture du détenteur doit tuer tout le Job Object');
  } finally {
    if (started) stop(started.hostPid);
    if (tree) { stop(tree.rootPid); stop(tree.leafPid); }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  await assert.rejects(launchInWindowsJob({ application: process.execPath, arguments: [], cwd: '.',
    ownerPid: process.pid, memoryMb: 1 }, { platform: 'linux' }), /windows-requis/);
  if (process.platform === 'win32') await windowsCheck();
  console.log(`Ontogenesis Windows Job Object checks passed (${process.platform}).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
