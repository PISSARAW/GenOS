'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { processCpuMs } = require('../src/services/agents/workerProcessCpu');
const { startWorkerCpuBudget } = require('../src/services/agents/workerRuntimeBudgetService');

async function waitForClose(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CPU-limited child did not stop.')), timeoutMs);
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    child.once('error', (failure) => { clearTimeout(timer); reject(failure); });
  });
}

async function verifyCpuMeter() {
  const usage = await processCpuMs(process.pid);
  assert.ok(Number.isFinite(usage) && usage >= 0, `invalid process CPU value: ${usage}`);
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

async function main() {
  await verifyCpuMeter();
  await verifyCpuLimitStopsBlockedChild();
  console.log('Worker CPU usage is measured and a blocked process is terminated at its budget: PASS');
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; });
