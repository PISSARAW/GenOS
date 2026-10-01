'use strict';

const { AdaptiveStateService } = require('../adaptiveStateService');
const { LEVELS, levelOf, posterior, evidenceGate } = require('./timescalePolicy');

const SCOPE = 'predictive_timescale_v1';
const ROUTE_AFTER = 3;

function emptyState() {
  return { levels: Object.fromEntries(LEVELS.map((level) => [level.id, { ...level, values: {}, errors: {}, evidence: {}, updatedAt: null }])), routes: [] };
}

function ensureState(state) {
  const base = emptyState();
  for (const level of LEVELS) base.levels[level.id] = { ...base.levels[level.id], ...(state?.levels?.[level.id] || {}) };
  return { ...base, ...(state || {}), levels: base.levels, routes: Array.isArray(state?.routes) ? state.routes : [] };
}

function inheritedPrior(state, levelId, metric) {
  const index = LEVELS.findIndex((item) => item.id === levelId) + 1;
  const upper = LEVELS.slice(index).find((item) => Number.isFinite(state.levels[item.id].values[metric]?.posterior));
  return upper ? { value: state.levels[upper.id].values[metric].posterior, source: upper.id } : { value: 0, source: 'local' };
}

function addEvidence(entry, input) {
  const evidence = new Set(entry.evidence[input.metric] || []);
  for (const ref of input.evidenceRefs || []) if (typeof ref === 'string' && ref) evidence.add(ref);
  entry.evidence[input.metric] = [...evidence].slice(-100);
  return evidence;
}

function updateErrorCount(entry, input, predictionError) {
  const isError = Math.abs(predictionError) > Number(input.tolerance ?? 0.1);
  entry.errors[input.metric] = (entry.errors[input.metric] || 0) + Number(isError);
  return isError;
}

function canRouteError(options) {
  const { level, input, next, evidence } = options;
  const independentCount = new Set(input.independentRefs || []).size;
  return Math.abs(next.predictionError) > Number(input.tolerance ?? 0.1)
    && evidenceGate({ levelId: level.id, evidenceCount: evidence.size, independentCount });
}

function updateLevel(state, input) {
  const level = levelOf(input.timescale);
  const entry = state.levels[level.id];
  const current = entry.values[input.metric] || {};
  const inherited = inheritedPrior(state, level.id, input.metric);
  const trust = 1 / (1 + (entry.errors[input.metric] || 0));
  const next = posterior({ prior: current.posterior ?? inherited.value, prediction: input.prediction,
    observation: input.observation, precision: input.precision ?? trust, learningRate: level.learningRate });
  next.priorSource = current.posterior == null ? inherited.source : 'local';
  entry.values[input.metric] = next;
  updateErrorCount(entry, input, next.predictionError);
  const evidence = addEvidence(entry, input);
  entry.updatedAt = input.now || new Date().toISOString();
  return { level, entry, next, eligibleForUpwardRoute: canRouteError({ level, input, next, evidence }) };
}

function routeError(state, input, update) {
  if (!update.eligibleForUpwardRoute) return null;
  const streak = (state.levels[input.timescale].errors[input.metric] || 0);
  if (streak < ROUTE_AFTER) return null;
  const index = LEVELS.findIndex((level) => level.id === input.timescale);
  if (index < 0 || index >= LEVELS.length - 1) return null;
  const next = LEVELS[index + 1];
  const route = { from: input.timescale, to: next.id, metric: input.metric,
    error: update.next.predictionError, evidenceRefs: [...(input.evidenceRefs || [])], createdAt: input.now || new Date().toISOString() };
  state.routes.push(route);
  state.routes = state.routes.slice(-500);
  return route;
}

async function record(options) {
  const { db, agentId, input } = options || {};
  if (!db || !agentId || !input?.metric || !Array.isArray(input.evidenceRefs)) throw new Error('timescale-record-input-invalid');
  const store = new AdaptiveStateService(db);
  const state = ensureState(await store.restoreObject(SCOPE, agentId));
  const update = updateLevel(state, input);
  const route = routeError(state, input, update);
  await store.persistObject(SCOPE, agentId, state, Date.now());
  return { timescale: update.level.id, metric: input.metric, ...update.next,
    persistentErrorCount: update.entry.errors[input.metric], route, state: update.entry };
}

async function getState(db, agentId) {
  const state = await new AdaptiveStateService(db).restoreObject(SCOPE, agentId);
  return ensureState(state);
}

function agowCandidate(route, agentId, now = Date.now()) {
  if (!route) return null;
  return require('../agow/candidates/candidateAdapterService').build({
    module: 'epistemic', agentId, now,
    observation: {
      candidateId: `timescale:${route.from}:${route.metric}:${now}`,
      semanticType: 'cross_scale_prediction_error',
      compactPreview: `Erreur persistante ${route.metric}: ${route.from} vers ${route.to}`,
      predictionError: Math.min(1, Math.abs(route.error)), confidence: 0.5,
      evidenceCoverage: route.evidenceRefs.length ? 1 : 0,
      evidenceRefs: route.evidenceRefs, causalEvidence: route.evidenceRefs.length > 0,
      actionable: false, constraints: { integrity: 'review' },
      epistemicContext: { causalDescendantCount: 0 }
    }
  });
}

module.exports = { record, getState, updateLevel, routeError, ensureState, agowCandidate, SCOPE };
