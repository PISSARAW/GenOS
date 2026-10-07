'use strict';

const dependencies = require('./dependencies');
const policy = require('./policy');
const { AdaptiveStateService } = require('../adaptiveStateService');

async function create(input) {
  const config = policy.normalize(input.options);
  if (config.mode === 'off') return null;
  const files = dependencies.resolveDependencies(input.workspaceRoot, config.files);
  const store = new AdaptiveStateService(input.db);
  const state = policy.initialState({ agentId: input.agentId, runId: input.runId, mode: config.mode }, files.map(dependencies.sample));
  const observer = { config, files, store, state, pending: Promise.resolve(), pendingWrites: 0, timer: null, onChange: null };
  await store.persistObject('continuous_execution', input.runId, state, 1);
  return observer;
}

function persist(observer) {
  if (observer.pendingWrites >= observer.config.maxPendingWrites) {
    failCoverage(observer, 'observation_queue_overflow');
    return;
  }
  const snapshot = JSON.parse(JSON.stringify(observer.state));
  observer.pendingWrites += 1;
  observer.pending = observer.pending.then(() => observer.store.persistObject(
    'continuous_execution', snapshot.runId, snapshot, snapshot.planRevision + 1
  )).catch((error) => {
    observer.state.persistenceFailure = String(error.message).slice(0, 300);
    notify(observer, { reason: 'observation_persistence_failed', observations: [] });
  }).finally(() => { observer.pendingWrites -= 1; });
}

function notify(observer, change) {
  if (observer.onChange) observer.onChange(change);
}

function failCoverage(observer, reason) {
  if (observer.state.coverageFailure) return;
  observer.state.coverageFailure = reason;
  clearInterval(observer.timer);
  notify(observer, { reason, observations: [] });
}

function scan(observer, verification = false) {
  if (observer.state.closed) return policy.verdict(observer.state);
  if (observer.state.coverageFailure) return policy.verdict(observer.state);
  const counter = verification ? 'verifications' : 'scans';
  const limit = verification ? observer.config.maxVerifications : observer.config.maxScans;
  if (observer.state[counter] >= limit) {
    failCoverage(observer, 'observation_budget_exhausted');
    return policy.verdict(observer.state);
  }
  observer.state[counter] += 1;
  try {
    const observations = policy.observe(observer.state, observer.files.map(dependencies.sample), Date.now());
    if (observations.length) {
      persist(observer);
      notify(observer, { reason: 'plan_dependencies_changed', observations });
    }
  } catch (error) {
    failCoverage(observer, 'dependency_observation_failed');
  }
  return policy.verdict(observer.state);
}

function start(observer, onChange) {
  if (!observer || observer.timer) return;
  observer.onChange = onChange;
  observer.timer = setInterval(() => scan(observer), observer.config.intervalMs);
  observer.timer.unref();
}

async function close(observer) {
  if (!observer || observer.state.closed) return;
  clearInterval(observer.timer);
  scan(observer, true);
  observer.state.closed = true;
  persist(observer);
  await observer.pending;
}

module.exports = { create, scan, start, close, persist };
