'use strict';

const { randomUUID } = require('node:crypto');
const ledger = require('../gvxDevelopmentLedger');

const STATES = ['hypothesis', 'correlated', 'causally_supported', 'causally_refuted'];

function validateInput(input) {
  if (!input?.source || !input?.target || !input?.relation || !Number.isFinite(input.effect)) {
    throw new TypeError('Self-Twin edge outcome requires identity and numeric effect.');
  }
  if (!Array.isArray(input.evidenceRefs) || !input.evidenceRefs.length) {
    throw new TypeError('Self-Twin edge outcomes require evidence references.');
  }
}

function isControlled(input) {
  return input.design === 'randomized_controlled' && input.isolationVerified === true
    && Number.isFinite(input.controlEffect);
}

function edgeKey(edge) { return `${edge.source}|${edge.target}|${edge.relation}`; }

async function recordOutcome(options) {
  validateScope(options.scope);
  validateInput(options.input);
  const prior = await listEdges(options.db, options.scope);
  const edge = updateEdge(prior.find((item) => edgeKey(item) === edgeKey(options.input)), options.input);
  const event = { observationId: randomUUID(), edge, design: options.input.design || 'observational',
    isolationVerified: options.input.isolationVerified === true, evidenceRefs: options.input.evidenceRefs,
    context: options.input.context || {}, createdAt: new Date().toISOString() };
  await ledger.appendEvent(options.db, { ...options.scope, type: 'evidence_attached',
    payload: { kind: 'self_twin_edge_learning', ...event } });
  return edge;
}

function updateEdge(prior, input) {
  const controlled = isControlled(input);
  const effect = controlled ? input.effect - input.controlEffect : input.effect;
  const priorEffects = prior?.effectDistribution?.samples || [];
  const samples = [...priorEffects, { effect, controlled }].slice(-100);
  const controlledEffects = samples.filter((sample) => sample.controlled).map((sample) => sample.effect);
  const supportCount = controlledEffects.filter((value) => Math.abs(value) > threshold(input)).length;
  const contradictionCount = controlledEffects.length - supportCount;
  return { source: input.source, target: input.target, relation: input.relation,
    status: inferStatus(controlledEffects, threshold(input)), effectDistribution: distribution(samples),
    confidence: confidence(controlledEffects.length), supportCount, contradictionCount,
    contextConditions: input.context || {}, evidenceRefs: [...new Set([...(prior?.evidenceRefs || []), ...input.evidenceRefs])],
    sampleCount: samples.length };
}

function inferStatus(effects, minimumEffect) {
  if (!effects.length) return 'correlated';
  const positive = effects.filter((value) => value > minimumEffect).length;
  const negative = effects.filter((value) => value < -minimumEffect).length;
  const nullEffects = effects.length - positive - negative;
  if (effects.length >= 2 && nullEffects === effects.length) return 'causally_refuted';
  if (effects.length >= 2 && (positive === effects.length || negative === effects.length)) return 'causally_supported';
  return 'correlated';
}

function distribution(samples) {
  const values = samples.map((sample) => sample.effect);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return { mean, variance, samples };
}

function threshold(input) {
  return Number.isFinite(input.minimumDetectableEffect) && input.minimumDetectableEffect >= 0
    ? input.minimumDetectableEffect : 0.01;
}

function confidence(sampleCount) { return Math.min(0.95, sampleCount / (sampleCount + 3)); }

async function listEdges(db, scope) {
  validateScope(scope);
  const events = await ledger.listEvents(db, { ...scope, limit: 5000 });
  const latest = new Map();
  for (const event of events) {
    const payload = event.payload;
    if (payload?.kind === 'self_twin_edge_learning') latest.set(edgeKey(payload.edge), payload.edge);
  }
  return [...latest.values()];
}

function validateScope(scope) {
  if (!scope?.organizationId || !scope?.projectId || !scope?.entityId) throw new Error('self-twin-scope-required');
}

module.exports = { STATES, validateInput, isControlled, updateEdge, inferStatus, recordOutcome, listEdges };
