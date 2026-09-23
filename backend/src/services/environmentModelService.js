'use strict';

const store = new Map();
const historyByEnv = new Map();

function clampNumber(input, lower, upper) {
  const value = Number(input);
  if (!Number.isFinite(value)) return lower;
  if (value < lower) return lower;
  if (value > upper) return upper;
  return value;
}

function clamp01(input) {
  return clampNumber(input, 0, 1);
}

function nowIso() {
  return new Date().toISOString();
}

function safeInput(input) {
  if (input === undefined) return {};
  if (input === null) return {};
  if (typeof input !== 'object') return {};
  return input;
}

function textField(source, key, fallback) {
  const value = source[key];
  if (typeof value === 'string') return value;
  if (value === undefined) return fallback;
  if (value === null) return fallback;
  return String(value);
}

function arrayField(source, key) {
  const value = source[key];
  if (Array.isArray(value)) return value.slice();
  return [];
}

function objectField(source, key) {
  const value = source[key];
  if (value === undefined) return {};
  if (value === null) return {};
  if (typeof value !== 'object') return {};
  return value;
}

function defineEnvironment(input) {
  const source = safeInput(input);
  return {
    identity: textField(source, 'identity', 'env_default'),
    type: textField(source, 'type', 'workspace'),
    territory: objectField(source, 'territory'),
    resources: objectField(source, 'resources'),
    constraints: arrayField(source, 'constraints'),
    hazards: arrayField(source, 'hazards'),
    affordances: arrayField(source, 'affordances'),
    actors: arrayField(source, 'actors'),
    artifacts: arrayField(source, 'artifacts'),
    uncertainty: clamp01(source.uncertainty),
    volatility: clamp01(source.volatility),
    novelty: clamp01(source.novelty),
    resourcePressure: clamp01(source.resourcePressure),
    competitivePressure: clamp01(source.competitivePressure),
    cooperativePressure: clamp01(source.cooperativePressure),
    temporalState: textField(source, 'temporalState', 'present'),
    domainOracles: arrayField(source, 'domainOracles'),
    environmentalHistory: arrayField(source, 'environmentalHistory'),
    updatedAt: nowIso()
  };
}

function upsertEnvironment(input) {
  const env = defineEnvironment(safeInput(input));
  store.set(env.identity, env);
  pushHistory(env.identity, { kind: 'UPSERT', at: nowIso() });
  return env;
}

function historyList(envId) {
  const list = historyByEnv.get(envId);
  if (Array.isArray(list)) return list;
  return [];
}

function pushHistory(envId, event) {
  const list = historyList(envId);
  list.push(event);
  trimList(list);
  historyByEnv.set(envId, list);
  applyHistory(envId, list);
}

function trimList(list) {
  if (list.length > 50) list.shift();
}

function applyHistory(envId, list) {
  const env = store.get(envId);
  if (env === undefined) return;
  env.environmentalHistory = list.slice();
}

function getEnvironment(input) {
  const source = safeInput(input);
  const id = textField(source, 'identity', 'env_default');
  const found = store.get(id);
  if (found === undefined) return null;
  return found;
}

function stringifyField(value) {
  return JSON.stringify(value);
}

function driftSignal(previous, current) {
  const keys = ['constraints', 'hazards', 'resources', 'actors'];
  return keys.filter(byChange);
  function byChange(key) {
    return stringifyField(previous[key]) !== stringifyField(current[key]);
  }
}

function driftKind(changed, volatility) {
  if (changed.length > 0) return 'ENVIRONMENT_DRIFT';
  if (volatility > 0.6) return 'ENVIRONMENT_DRIFT';
  return 'STABLE';
}

function detectDrift(input) {
  const source = safeInput(input);
  const prev = safeInput(source.previous);
  const curr = safeInput(source.current);
  const changed = driftSignal(prev, curr);
  const volatility = clamp01(curr.volatility);
  const kind = driftKind(changed, volatility);
  return { drifted: kind !== 'STABLE', kind, changed, at: nowIso() };
}

function recordNicheConstruction(input) {
  const source = safeInput(input);
  const envId = textField(source, 'environment', 'env_default');
  const action = textField(source, 'action', 'trace');
  const found = store.get(envId);
  const env = found === undefined ? defineEnvironment({ identity: envId }) : found;
  appendArtifact(env, action, source.artifact);
  extendAffordances(env, action);
  store.set(envId, env);
  pushHistory(envId, { kind: 'NICHE_CONSTRUCTION', action, at: nowIso() });
  return env;
}

function appendArtifact(env, action, artifact) {
  env.artifacts = env.artifacts.concat([{ action, artifact, at: nowIso() }]);
}

function extendAffordances(env, action) {
  const merged = env.affordances.concat([action]);
  env.affordances = Array.from(new Set(merged));
}

function clearAll() {
  store.clear();
  historyByEnv.clear();
}

module.exports = {
  defineEnvironment,
  upsertEnvironment,
  getEnvironment,
  detectDrift,
  recordNicheConstruction,
  clearAll
};
