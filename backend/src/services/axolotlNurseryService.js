'use strict';

const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const { hash, error } = require('./axolotlStateStore');
const WORKER = path.join(__dirname, 'axolotlNurseryWorker.cjs');

function validateContract(contract) {
  if (!Array.isArray(contract?.requiredRoles) || !contract.requiredRoles.length || !Array.isArray(contract.probes)
      || !contract.probes.length || contract.probes.length > 1000) throw error('AXOLOTL_FUNCTIONAL_CONTRACT_REQUIRED');
  if (contract.probes.some((item) => !validProbe(item))) throw error('AXOLOTL_PROBE_INVALID');
  if (new Set(contract.probes.map((item) => item.id)).size !== contract.probes.length) throw error('AXOLOTL_PROBE_ID_DUPLICATED');
  return structuredClone(contract);
}

function validProbe(item) {
  if (!item?.id || !Object.hasOwn(item, 'expected')) return false;
  if (item.kind === 'recall') return typeof item.key === 'string' && item.key.length > 0;
  return item.kind === 'route' && typeof item.from === 'string' && typeof item.to === 'string' && Object.hasOwn(item, 'payload');
}

function validateBudget(budget = {}) {
  const normalized = { events: budget.events ?? 1000, durationMs: budget.durationMs ?? 10000, experiments: budget.experiments ?? 32 };
  if (!Object.values(normalized).every((value) => Number.isSafeInteger(value) && value > 0)) throw error('AXOLOTL_BUDGET_INVALID');
  if (normalized.durationMs > 60000 || normalized.events > 100000 || normalized.experiments > 128) throw error('AXOLOTL_BUDGET_INVALID');
  return normalized;
}

function evaluate(input) {
  if (!Number.isFinite(input.budget.durationMs) || input.budget.durationMs <= 0) return Promise.reject(error('AXOLOTL_DURATION_BUDGET_EXHAUSTED'));
  if (input.contract.probes.length > input.budget.events) return Promise.reject(error('AXOLOTL_EVENT_BUDGET_EXHAUSTED'));
  const verifierDigest = hash(['axolotlNurseryWorker.cjs', 'axolotlRuntimeKernel.js', 'axolotlRegenerationHelpers.js']
    .map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8')));
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, { workerData: { topology: input.topology, contract: input.contract }, env: {},
      resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 } });
    let received = false;
    const timer = setTimeout(() => { worker.terminate(); reject(error('AXOLOTL_DURATION_BUDGET_EXHAUSTED')); }, input.budget.durationMs);
    worker.once('message', (result) => {
      received = true;
      clearTimeout(timer);
      if (!Number.isSafeInteger(result.events)) { reject(error('AXOLOTL_PROBE_INVALID_RESULT')); return; }
      resolve({ ...result, verifierDigest, processId: process.pid, workerId: worker.threadId, isolated: true });
    });
    worker.once('error', (failure) => { clearTimeout(timer); reject(failure); });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (!received) reject(error(code === 0 ? 'AXOLOTL_PROBE_NO_RESULT' : 'AXOLOTL_PROBE_CRASHED'));
    });
  });
}

module.exports = { validateContract, validateBudget, evaluate };
