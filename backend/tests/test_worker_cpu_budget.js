'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { processCpuMs, prepareProcessCpuMeter } = require('../src/services/agents/workerProcessCpu');
const { startWorkerCpuBudget, runtimeStopped } = require('../src/services/agents/workerRuntimeBudgetService');
const { terminateChild } = require('../src/services/processTermination');

async function waitForClose(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CPU-limited child did not stop.')), timeoutMs);
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    child.once('error', (failure) => { clearTimeout(timer); reject(failure); });
  });
}

async function verifyCpuMeter() {
  const usage = await processCpuMs(process.pid, process.platform, {});
  assert.ok(Number.isFinite(usage) && usage >= 0, `invalid process CPU value: ${usage}`);
  assert.equal(runtimeStopped({ pid: process.pid, killed: false, exitCode: null, signalCode: null }), false);
  assert.equal(runtimeStopped({ pid: 2147483647, killed: false, exitCode: null, signalCode: null }), true);
}

async function verifyCpuLimitStopsBlockedChild() {
  const child = spawn(process.execPath, ['-e', 'const end=Date.now()+10000;while(Date.now()<end){}'], {
    stdio: 'ignore', windowsHide: true
  });
  let halt;
  const context = { child, normalizedMission: { workerContract: { resources: { maxCpuMs: 100 } } },
    haltRuntime: (...args) => { halt = args.slice(1); child.kill(); } };
  startWorkerCpuBudget(context);
  await waitForClose(child, 10000);
  assert.equal(halt?.[0], 'worker_cpu_budget');
  assert.equal(halt?.[1], 'worker_cpu_budget_exceeded');
  assert.ok(halt[3].observedCpuMs >= 100);
}

function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (_) { return false; }
}

async function verifyCpuLimitStopsDescendantLoad() {
  const script = "const p=require('node:child_process').spawn(process.execPath,['-e','const end=Date.now()+10000;while(Date.now()<end){}'],{stdio:'ignore'});console.log(p.pid);setInterval(()=>{},1000)";
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true, detached: process.platform !== 'win32' });
  let descendantPid = null;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (value) => { descendantPid = Number(value.trim().split(/\r?\n/).at(-1)); });
  let halt;
  const context = { child, normalizedMission: { workerContract: { resources: { maxCpuMs: 1000 } } },
    haltRuntime: (...args) => { halt = args.slice(1); terminateChild(child, process.platform !== 'win32'); } };
  startWorkerCpuBudget(context);
  await waitForClose(child, 10000);
  assert.equal(halt?.[0], 'worker_cpu_budget');
  assert.equal(halt?.[1], 'worker_cpu_budget_exceeded');
  assert.ok(halt[3].observedCpuMs >= 1000, 'descendant CPU must count toward the worker budget');
  assert.equal(pidAlive(descendantPid), false, 'CPU limit termination must include worker descendants');
}

async function main() {
  await prepareProcessCpuMeter();
  await verifyCpuMeter();
  await verifyCpuLimitStopsBlockedChild();
  await verifyCpuLimitStopsDescendantLoad();
  console.log('Worker CPU usage is measured and CPU-limited workers are terminated: PASS');
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; });
