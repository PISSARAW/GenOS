'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { processCpuMs, prepareProcessCpuMeter, processIdentity, processIdentities } = require('../src/services/agents/workerProcessCpu');
const { startWorkerDeadline, startWorkerCpuBudget, runtimeStopped } = require('../src/services/agents/workerRuntimeBudgetService');
const { terminateChild } = require('../src/services/processTermination');
const TERMINATION_TIMEOUT_MS = 60000;
const FIXTURE_LIFETIME_MS = 3 * TERMINATION_TIMEOUT_MS;
const BUSY_SCRIPT = `const end=Date.now()+${FIXTURE_LIFETIME_MS};while(Date.now()<end){}`;

async function waitForClose(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CPU-limited child did not stop.')), timeoutMs);
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    child.once('error', (failure) => { clearTimeout(timer); reject(failure); });
  });
}

async function waitForTerminationProof(child, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.genosTerminationReceipt?.verified) return child.genosTerminationReceipt;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (child.genosTerminationReceipt?.verified) return child.genosTerminationReceipt;
  throw new Error(`Process-tree termination was not verified: ${JSON.stringify(child.genosTerminationReceipt)}`);
}

async function verifyCpuMeter() {
  const usage = await processCpuMs(process.pid, process.platform, {});
  assert.ok(Number.isFinite(usage) && usage >= 0, `invalid process CPU value: ${usage}`);
  assert.equal(runtimeStopped({ pid: process.pid, killed: false, exitCode: null, signalCode: null }), false);
  assert.equal(runtimeStopped({ pid: 2147483647, killed: false, exitCode: null, signalCode: null }), true);
}

function verifyWorkerDeadlineBound() {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const originalNow = Date.now;
  let scheduledDelay;
  let callback;
  let haltedWith;
  let now = 1000;
  global.setInterval = (fn, delay) => {
    callback = fn;
    scheduledDelay = delay;
    return 1;
  };
  global.clearInterval = () => {};
  Date.now = () => now;
  try {
    const child = new EventEmitter();
    startWorkerDeadline({ child, normalizedMission: { timeoutMs: Number.MAX_VALUE }, haltRuntime(...args) { haltedWith = args; } });
    assert.equal(scheduledDelay, 1000, 'the timer interval must be a fixed value');
    now += 24 * 60 * 60 * 1000;
    callback();
    assert.equal(haltedWith?.[1], 'worker_deadline');
    assert.equal(haltedWith?.[4]?.maxTimeMs, 24 * 60 * 60 * 1000,
      'untrusted timeout values must be capped at the worker deadline maximum');
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    Date.now = originalNow;
  }
}

async function verifyCpuLimitStopsBlockedChild() {
  const child = spawn(process.execPath, ['-e', BUSY_SCRIPT], {
    stdio: 'ignore', windowsHide: true
  });
  let halt;
  const context = { child, normalizedMission: { workerContract: { resources: { maxCpuMs: 100 } } },
    haltRuntime: (...args) => { halt = args.slice(1); child.kill(); } };
  try {
    startWorkerCpuBudget(context);
    await waitForClose(child, TERMINATION_TIMEOUT_MS);
    assert.equal(halt?.[0], 'worker_cpu_budget');
    assert.equal(halt?.[1], 'worker_cpu_budget_exceeded');
    assert.ok(halt[3].observedCpuMs >= 100);
  } finally { cleanupMeasuredTree(child); }
}

function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (_) { return false; }
}

async function verifyCpuLimitStopsDescendantLoad() {
  const branch = `const p=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(BUSY_SCRIPT)}],{stdio:'ignore'});console.log('leaf:'+p.pid);setTimeout(()=>{},${FIXTURE_LIFETIME_MS})`;
  const script = `const p=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(branch)}],{stdio:['ignore','pipe','ignore']});console.log('branch:'+p.pid);p.stdout.pipe(process.stdout);setTimeout(()=>{},${FIXTURE_LIFETIME_MS})`;
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true, detached: process.platform !== 'win32' });
  const descendants = new Map();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    const [kind, pid] = line.split(':');
    if (kind && Number.isSafeInteger(Number(pid))) descendants.set(kind, Number(pid));
  });
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    stdio: 'ignore', windowsHide: true
  });
  const unrelatedIdentity = processIdentity(unrelated.pid);
  let halt;
  const context = { child, normalizedMission: { workerContract: { resources: { maxCpuMs: 1000 } } },
    haltRuntime: (...args) => { halt = args.slice(1); terminateChild(child, process.platform !== 'win32'); } };
  try {
    assert.ok(unrelatedIdentity, 'the unrelated process must have an observed creation identity');
    startWorkerCpuBudget(context);
    await waitForClose(child, TERMINATION_TIMEOUT_MS);
    const receipt = await waitForTerminationProof(child, TERMINATION_TIMEOUT_MS);
    assert.equal(halt?.[0], 'worker_cpu_budget');
    assert.equal(halt?.[1], 'worker_cpu_budget_exceeded');
    assert.ok(halt[3].observedCpuMs >= 1000, 'grandchild CPU must count toward the worker budget');
    assert.ok(descendants.has('branch') && descendants.has('leaf'), 'the test must observe both descendants');
    assertDescendantsStopped(child, descendants, { child: unrelated, identity: unrelatedIdentity });
    assert.equal(receipt.scope, 'measured_process_tree');
    assert.deepEqual(receipt.survivorPids, [], 'termination proof must rescan every measured identity');
  } finally {
    lines.close();
    unrelated.kill('SIGKILL');
    cleanupMeasuredTree(child);
  }
}

function assertDescendantsStopped(child, descendants, unrelated) {
  const members = [...child.genosProcessScope.members.values()];
  const current = processIdentities([...descendants.values(), unrelated.child.pid]);
  descendants.forEach((pid) => {
    const measured = members.filter((member) => member.pid === pid);
    assert.ok(measured.length, `descendant ${pid} must be in the measured process tree`);
    const identity = current.get(pid);
    if (!identity) assert.equal(pidAlive(pid), false, `live PID ${pid} must have an observable identity`);
    measured.forEach((member) => assert.notEqual(identity, member.identity,
      `descendant ${member.identity} must stop`));
  });
  assert.equal(current.get(unrelated.child.pid), unrelated.identity,
    `the same unrelated process must remain alive: ${JSON.stringify({ exitCode: unrelated.child.exitCode,
      signalCode: unrelated.child.signalCode })}`);
}

function cleanupMeasuredTree(child) {
  if (child.genosTerminationReceipt?.verified) return;
  const members = [...(child.genosProcessScope?.members?.values() || [])];
  const current = processIdentities(members.map((member) => member.pid));
  members.forEach((member) => {
    if (current.get(member.pid) !== member.identity) return;
    try { process.kill(member.pid, 'SIGKILL'); } catch (_) {}
  });
  child.kill('SIGKILL');
}

async function main() {
  verifyWorkerDeadlineBound();
  await prepareProcessCpuMeter();
  await verifyCpuMeter();
  await verifyCpuLimitStopsBlockedChild();
  await verifyCpuLimitStopsDescendantLoad();
  console.log('Worker CPU usage is measured and CPU-limited workers are terminated: PASS');
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; });
