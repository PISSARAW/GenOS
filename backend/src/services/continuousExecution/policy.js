'use strict';

function integer(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error('Invalid continuous execution budget.');
  return value;
}

function normalize(options) {
  if (options === undefined) return { mode: 'off' };
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid continuous execution configuration.');
  const mode = options.mode || 'observe';
  if (!['off', 'observe', 'control'].includes(mode)) throw new Error('Unknown continuous execution mode.');
  if (mode === 'off') return { mode };
  if (options.intervalMs !== undefined && options.intervalMs < 100) throw new Error('Observation interval must be at least 100 ms.');
  return {
    mode, files: options.files,
    intervalMs: integer(options.intervalMs, 250, 60000),
    maxScans: integer(options.maxScans, 256, 10000),
    maxVerifications: integer(options.maxVerifications, 16, 128),
    maxPendingWrites: integer(options.maxPendingWrites, 32, 128)
  };
}

function initialState(identity, baselines) {
  return {
    ...identity, planRevision: 0, launchRevision: 0, scans: 0, verifications: 0,
    observations: [], baselines, latest: baselines, invalidated: false,
    coverageFailure: null, persistenceFailure: null, closed: false
  };
}

function observe(state, samples, now) {
  const changes = samples.filter((item) => state.latest.find((prior) => prior.target === item.target)?.digest !== item.digest);
  if (!changes.length) return [];
  state.latest = samples;
  state.planRevision += 1;
  state.invalidated = true;
  const observations = changes.map((item) => ({
    id: `${state.runId}:${state.planRevision}:${item.target}`, agentId: state.agentId,
    runId: state.runId, planRevision: state.planRevision, observedAt: now,
    target: item.target, digest: item.digest, bytes: item.bytes,
    evidenceRef: `dependency:${state.runId}:${state.planRevision}:${item.target}`, outcome: 'observed'
  }));
  state.observations = [...state.observations, ...observations].slice(-32);
  return observations;
}

function verdict(state) {
  if (state.persistenceFailure) return { eligible: false, reason: 'observation_persistence_failed' };
  if (state.coverageFailure) return { eligible: false, reason: state.coverageFailure };
  if (state.invalidated) return { eligible: false, reason: 'plan_dependencies_changed' };
  return { eligible: true, reason: null };
}

module.exports = { normalize, initialState, observe, verdict };
