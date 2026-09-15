const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');

const DEFINITIONS = {
  'quorum.threshold': { defaultValue: 0.5, min: 0.35, max: 0.9, step: 0.05 },
  'gate.evidence_threshold': { defaultValue: 0.7, min: 0.5, max: 0.95, step: 0.05 },
  'somatic.throttle_threshold': { defaultValue: 0.6, min: 0.4, max: 0.85, step: 0.05 },
  'somatic.freeze_threshold': { defaultValue: 0.85, min: 0.65, max: 0.99, step: 0.05 },
  'route.alpha': { defaultValue: 0.35, min: 0.1, max: 0.8, step: 0.04 },
  'route.beta': { defaultValue: 0.4, min: 0.1, max: 0.8, step: 0.04 }
};

const DEFAULT_ROUTE_WEIGHTS = { alpha: 0.35, beta: 0.4, gamma: 0.25 };
const cache = new Map();

function definitionFor(key) {
  return DEFINITIONS[key] || null;
}

function boundedValue(key, value) {
  const definition = definitionFor(key);
  if (!definition || !Number.isFinite(Number(value))) return null;
  return Math.max(definition.min, Math.min(definition.max, Number(value)));
}

function cacheKey(scope, key) {
  return `${scope || 'global'}:${key}`;
}

function currentValue(key, scope = 'global') {
  const definition = definitionFor(key);
  if (!definition) return null;
  return cache.get(cacheKey(scope, key))?.value ?? definition.defaultValue;
}

function routeWeights(domain = 'software_engineering') {
  const alpha = currentValue('route.alpha', domain) ?? DEFAULT_ROUTE_WEIGHTS.alpha;
  const beta = currentValue('route.beta', domain) ?? DEFAULT_ROUTE_WEIGHTS.beta;
  const total = alpha + beta;
  const safeTotal = total > 0 ? total : 1;
  return { alpha: alpha / safeTotal * (1 - 0.2), beta: beta / safeTotal * (1 - 0.2), gamma: 0.2 };
}

function routeDefinition(key, value) {
  return definitionFor(key);
}

function observationTarget(definition, signal, success) {
  const margin = definition.step;
  const raw = success ? signal : signal + margin;
  return Math.max(definition.min, Math.min(definition.max, raw));
}

function nextValue(input) {
  if (input.sampleCount < 3) return input.current;
  const learningRate = Math.min(0.2, 1 / Math.max(5, input.sampleCount));
  const delta = Math.max(-input.definition.step, Math.min(input.definition.step, input.target - input.current));
  return Math.max(input.definition.min, Math.min(input.definition.max, input.current + delta * learningRate));
}

async function persist(key, scope, state) {
  try {
    const db = await getDatabase();
    await db.run(`INSERT INTO adaptive_parameters
      (scope, parameter_key, value, sample_count, success_count, last_signal, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(scope, parameter_key) DO UPDATE SET
        value = excluded.value, sample_count = excluded.sample_count,
        success_count = excluded.success_count, last_signal = excluded.last_signal,
        updated_at = CURRENT_TIMESTAMP`,
    scope, key, state.value, state.sampleCount, state.successCount, state.lastSignal);
  } catch (_) {}
}

async function load(scope = 'global') {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT scope, parameter_key, value, sample_count, success_count, last_signal FROM adaptive_parameters WHERE scope = ?', scope);
    for (const row of rows) {
      cache.set(cacheKey(row.scope, row.parameter_key), {
        value: Number(row.value), sampleCount: Number(row.sample_count),
        successCount: Number(row.success_count), lastSignal: Number(row.last_signal)
      });
    }
  } catch (_) {}
  return snapshot(scope);
}

function snapshot(scope = 'global') {
  const result = {};
  for (const key of Object.keys(DEFINITIONS)) result[key] = currentValue(key, scope);
  return result;
}

async function observe(key, observation = {}, scope = 'global') {
  const definition = routeDefinition(key, Number(observation.signal));
  const signal = boundedValue(key, observation.signal) ?? Number(observation.signal);
  if (!definition || !Number.isFinite(signal) || typeof observation.success !== 'boolean') return null;
  const id = cacheKey(scope, key);
  const previous = cache.get(id) || { value: definition.defaultValue, sampleCount: 0, successCount: 0 };
  const sampleCount = previous.sampleCount + 1;
  const value = nextValue({ current: previous.value, target: observationTarget(definition, signal, observation.success), definition, sampleCount });
  const state = { value, sampleCount, successCount: previous.successCount + (observation.success ? 1 : 0), lastSignal: signal };
  cache.set(id, state);
  await persist(key, scope, state);
  telemetry.emitEvent({
    eventType: 'ADAPTIVE_PARAMETER_UPDATED', agentId: observation.agentId || 'adaptive-controller', action: 'TUNE', severity: 'info',
    detail: `Adapted ${key} in scope ${scope} from observation ${signal}.`,
    payload: { key, scope, value, sampleCount, success: observation.success, signal }
  });
  return { key, scope, ...state };
}

async function observeRoute(domain, metrics = {}) {
  const quality = Number(metrics.quality);
  if (!Number.isFinite(quality) || typeof metrics.success !== 'boolean') return null;
  const route = metrics.route === 'beta' ? 'beta' : 'alpha';
  const result = await observe(`route.${route}`, { signal: quality, success: metrics.success, agentId: metrics.agentId }, domain);
  return { domain, route, result, weights: routeWeights(domain) };
}

module.exports = { currentValue, routeWeights, load, snapshot, observe, observeRoute, DEFINITIONS };