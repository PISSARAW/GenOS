'use strict';

const { invalid } = require('./capabilityExecutionPolicy');

function positive(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw invalid(`${field} must be positive.`, 'HOLOBIONT_BUDGET_INVALID');
  return number;
}

function missionBudget(input) {
  const budget = input.budget || {};
  return { tokens: positive(budget.tokens ?? 10000, 'tokens'),
    latencyMs: positive(budget.latencyMs ?? 60000, 'latencyMs'),
    maxSteps: positive(budget.maxSteps ?? 32, 'maxSteps') };
}

function abortError(signal) {
  return signal.reason || invalid('Mission cancelled.', 'HOLOBIONT_MISSION_CANCELLED');
}

function awaitSignal(action, signal) {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError(signal));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(action).then((result) => {
      signal.removeEventListener('abort', abort);
      resolve(result);
    }, (error) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

function missionDeadline(input, budget) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(invalid('Mission latency budget exhausted.', 'BUDGET_EXHAUSTED')), budget.latencyMs);
  const external = input.signal;
  const forward = () => controller.abort(abortError(external));
  if (external?.aborted) forward();
  else external?.addEventListener('abort', forward, { once: true });
  return { signal: controller.signal, close: () => {
    clearTimeout(timer);
    external?.removeEventListener('abort', forward);
  } };
}

function boundedAdapter(adapter, signal) {
  if (typeof adapter !== 'function') return adapter;
  return (context) => awaitSignal(() => adapter({ ...context, signal }), signal);
}

module.exports = { missionBudget, missionDeadline, boundedAdapter, awaitSignal };
