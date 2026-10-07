'use strict';

const { createHash } = require('node:crypto');

const SUPPORTED = new Set(['lpt', 'subset_sum']);

function inputError(message) {
  return Object.assign(new Error(message), { code: 'WORKER_PROCEDURE_INPUT_INVALID' });
}

function boundedInteger(value, maximum) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function validateLptInput(jobs, machines) {
  if (!Array.isArray(jobs) || !jobs.length || jobs.length > 10000 || !boundedInteger(machines, 64) || machines < 1) {
    throw inputError('LPT requires 1-10000 jobs and 1-64 machines.');
  }
  const ids = new Set();
  for (const job of jobs) {
    if (!validJob(job, ids)) {
      throw inputError('LPT job identifiers must be unique and durations positive safe integers.');
    }
    ids.add(job.id);
  }
}

function validJob(job, ids) {
  return typeof job?.id === 'string' && Boolean(job.id.trim()) && !ids.has(job.id)
    && boundedInteger(job.duration, Number.MAX_SAFE_INTEGER) && job.duration > 0;
}

function lpt(parameters = {}) {
  const { jobs, machines } = parameters;
  validateLptInput(jobs, machines);
  const ordered = [...jobs].sort((a, b) => b.duration - a.duration || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const assignments = Array.from({ length: machines }, (_, index) => ({ machine: index, jobs: [], load: 0 }));
  for (const job of ordered) {
    const target = assignments.reduce((best, item) => item.load < best.load ? item : best);
    if (!Number.isSafeInteger(target.load + job.duration)) throw inputError('LPT load exceeds the safe integer range.');
    target.jobs.push(job.id);
    target.load += job.duration;
  }
  return { assignments, makespan: Math.max(...assignments.map((item) => item.load)) };
}

function validateSubsetInput(values, target) {
  if (!Array.isArray(values) || !values.length || values.length > 1000
    || !boundedInteger(target, 1000000) || values.some((value) => !boundedInteger(value, 1000000))) {
    throw inputError('Subset sum requires 1-1000 nonnegative integer values and a target up to 1000000.');
  }
  if (values.length * (target + 1) > 2000000) throw inputError('Subset sum exceeds the bounded search budget.');
}

function subsetSum(parameters = {}) {
  const { values, target } = parameters;
  validateSubsetInput(values, target);
  const reachable = new Map([[0, []]]);
  for (const [index, value] of values.entries()) {
    for (const [sum, indices] of [...reachable]) {
      const next = sum + value;
      if (next <= target && !reachable.has(next)) reachable.set(next, [...indices, index]);
    }
  }
  const indices = reachable.get(target) || null;
  return { found: indices !== null, indices, sum: indices ? target : null, reachableCount: reachable.size };
}

function runProcedure(methodContract) {
  const methodId = String(methodContract?.methodId || '').trim().toLowerCase();
  if (!SUPPORTED.has(methodId)) {
    throw Object.assign(new Error(`No deterministic implementation for '${methodId}'.`), { code: 'WORKER_EXECUTOR_UNAVAILABLE' });
  }
  const parameters = methodContract.parameters || {};
  const output = methodId === 'lpt' ? lpt(parameters) : subsetSum(parameters);
  const inputDigest = createHash('sha256').update(JSON.stringify({ methodId, parameters })).digest('hex');
  const receiptDigest = createHash('sha256').update(JSON.stringify({ methodId, inputDigest, output })).digest('hex');
  return { methodId, output, receipt: { id: `solver://sha256:${receiptDigest}`, methodId,
    inputDigest: `sha256:${inputDigest}`, result: output } };
}

function assertProcedureInput(methodContract) {
  const methodId = methodContract?.methodId;
  const parameters = methodContract?.parameters || {};
  if (!SUPPORTED.has(methodId)) throw inputError('A registered deterministic procedure is required.');
  if (methodId === 'lpt') validateLptInput(parameters.jobs, parameters.machines);
  else validateSubsetInput(parameters.values, parameters.target);
  return true;
}

module.exports = { SUPPORTED, runProcedure, assertProcedureInput };
