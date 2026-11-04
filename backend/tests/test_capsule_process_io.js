'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');

function loadBoundary(spawn, terminateChild) {
  const filename = path.resolve(__dirname, '../src/services/capsuleProcessBoundary.js');
  const original = createRequire(filename);
  const loaded = { exports: {} };
  const localRequire = (request) => {
    if (request === 'node:child_process') return { spawn };
    if (request === './processTermination') return {
      terminateChild, gracePeriodMs: () => 0, clearTerminationTimer: () => {}
    };
    return original(request);
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: loaded, exports: loaded.exports, require: localRequire,
    process, setTimeout, clearTimeout, Buffer
  }, { filename });
  return loaded.exports;
}

function invocation(root, options = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const launches = [];
  const terminations = [];
  let notifyTermination;
  const terminated = new Promise(resolve => { notifyTermination = resolve; });
  const boundary = loadBoundary((command, args, options) => {
    launches.push({ command, args, options });
    return child;
  }, (...args) => { terminations.push(args); notifyTermination(); return true; });
  let state = 'pending';
  const outcome = boundary.run('isolated-capsule-fixture', ['fixture-argument'], { root, timeoutMs: options.timeoutMs ?? 5000 })
    .then(value => { state = 'resolved'; return { state, value }; },
      error => { state = 'rejected'; return { state, error }; });
  return { child, outcome, launches, terminations, terminated, state: () => state,
    close(code) { child.exitCode = code; child.emit('close', code); } };
}

async function tick() {
  await new Promise(resolve => setImmediate(resolve));
}

async function withinDeadline(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('capsule test did not settle within two seconds')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

async function streamFailure(root, stream) {
  const running = invocation(root);
  const failure = Object.assign(new Error('read ENOTCONN'), { code: 'ENOTCONN', syscall: 'read' });
  const secondary = Object.assign(new Error('later pipe failure'), { code: 'ECONNRESET' });
  try {
    assert.doesNotThrow(() => running.child[stream].emit('error', failure),
      `${stream} errors must be consumed by the capsule boundary`);
    await tick();
    assert.equal(running.state(), 'pending', 'a pipe failure must wait for child close');
    assert.equal(running.terminations.length, 1, 'request termination of the owned child exactly once');
    assert.equal(running.terminations[0][0], running.child);
    const other = stream === 'stdout' ? 'stderr' : 'stdout';
    assert.doesNotThrow(() => running.child[other].emit('error', secondary));
    await tick();
    assert.equal(running.state(), 'pending');
    assert.equal(running.terminations.length, 1);
    running.close(0);
    const outcome = await running.outcome;
    assert.equal(outcome.state, 'rejected', 'exit zero cannot erase a prior pipe failure');
    assert.equal(outcome.error.cause || outcome.error, failure, 'the first I/O failure must remain causal');
  } finally {
    running.close(1);
    await running.outcome;
  }
}

async function successfulOutput(root) {
  const running = invocation(root);
  try {
    assert.equal(running.launches.length, 1);
    assert.equal(path.resolve(running.launches[0].options.cwd), path.resolve(root));
    running.child.stdout.emit('data', Buffer.from('capsule-output\n'));
    running.child.stderr.emit('data', Buffer.from('diagnostic-only\n'));
    await tick();
    assert.equal(running.state(), 'pending', 'starting and producing output do not prove completion');
    running.close(0);
    const outcome = await running.outcome;
    assert.equal(outcome.state, 'resolved');
    assert.equal(outcome.value, 'capsule-output\n');
    assert.equal(running.terminations.length, 0);
  } finally {
    running.close(1);
    await running.outcome;
  }
}

async function unsuccessfulExit(root) {
  const running = invocation(root);
  try {
    running.child.stderr.emit('data', Buffer.from('native bootstrap refused'));
    running.close(7);
    const outcome = await running.outcome;
    assert.equal(outcome.state, 'rejected');
    assert.equal(outcome.error.code, 'CAPSULE_BOOTSTRAP_FAILED');
    assert.match(outcome.error.message, /native bootstrap refused/);
  } finally {
    running.close(1);
    await running.outcome;
  }
}

async function spawnFailure(root) {
  const running = invocation(root);
  const failure = Object.assign(new Error('spawn fixture ENOENT'), { code: 'ENOENT' });
  try {
    assert.doesNotThrow(() => running.child.emit('error', failure));
    running.close(-1);
    const outcome = await running.outcome;
    assert.equal(outcome.state, 'rejected');
    assert.equal(outcome.error, failure);
  } finally {
    running.close(1);
    await running.outcome;
  }
}

async function timeoutWithConfirmedClose(root) {
  const running = invocation(root, { timeoutMs: 100 });
  try {
    await withinDeadline(running.terminated);
    assert.equal(running.terminations.length, 1);
    assert.equal(running.state(), 'pending', 'timeout must wait for confirmed process closure');
    running.close(0);
    const outcome = await withinDeadline(running.outcome);
    assert.equal(outcome.state, 'rejected', 'a late successful exit cannot erase a timeout');
    assert.equal(outcome.error.code, 'CAPSULE_BOOTSTRAP_TIMEOUT');
  } finally {
    running.close(1);
    await running.outcome;
  }
}

async function unconfirmedStopRemainsRejectedAfterLateClose(root) {
  const running = invocation(root);
  const failure = Object.assign(new Error('read ENOTCONN'), { code: 'ENOTCONN', syscall: 'read' });
  const started = Date.now();
  try {
    assert.doesNotThrow(() => running.child.stdout.emit('error', failure));
    const outcome = await withinDeadline(running.outcome);
    assert.ok(Date.now() - started < 2000, 'unconfirmed cleanup must have a bounded watchdog');
    assert.equal(outcome.state, 'rejected');
    assert.match(outcome.error.code, /UNCONFIRMED/);
    assert.equal(outcome.error.cleanupPending, true);
    assert.equal(running.terminations.length, 1);
    running.close(0);
    await tick();
    assert.equal(running.state(), 'rejected', 'late close zero cannot retroactively certify cleanup');
    assert.equal((await running.outcome).error, outcome.error);
    assert.doesNotThrow(() => running.child.stderr.emit('error', new Error('late stream error')));
    assert.equal(running.terminations.length, 1);
  } finally {
    running.close(1);
    await running.outcome;
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-process-io-'));
  const failures = [];
  const cases = [
    ['stdout ENOTCONN', () => streamFailure(root, 'stdout')],
    ['stderr ENOTCONN', () => streamFailure(root, 'stderr')],
    ['successful output', () => successfulOutput(root)],
    ['unsuccessful exit', () => unsuccessfulExit(root)],
    ['spawn error', () => spawnFailure(root)],
    ['timeout with confirmed close', () => timeoutWithConfirmedClose(root)],
    ['unconfirmed stop and late close', () => unconfirmedStopRemainsRejectedAfterLateClose(root)]
  ];
  try {
    for (const [name, run] of cases) {
      try { await run(); console.log(`Capsule process I/O: ${name}: PASS`); }
      catch (error) { failures.push(error); console.error(`Capsule process I/O: ${name}: FAIL`, error); }
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  if (failures.length) throw new AggregateError(failures, `${failures.length} capsule process I/O checks failed`);
  console.log(`Capsule process I/O: ${cases.length} checks passed (isolated fake child; no process spawned).`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
