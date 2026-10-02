'use strict';

const { randomUUID } = require('node:crypto');
const ledger = require('../gvxDevelopmentLedger');
const graph = require('./selfTwinGraph');
const candidateAdapter = require('../agow/candidates/candidateAdapterService');

function validateScope(scope) {
  if (!scope?.organizationId || !scope?.projectId || !scope?.entityId) throw new Error('self-twin-scope-required');
}

function makePrediction(input) {
  if (!input?.target || !input?.intervention) throw new Error('self-twin-intervention-required');
  const affected = graph.manifest().edges.filter((edge) => edge.source.endsWith(`:${input.target}`) || edge.target.endsWith(`:${input.target}`));
  return {
    predictionId: randomUUID(), target: input.target, intervention: input.intervention,
    effects: Array.isArray(input.effects) ? input.effects : affected.map((edge) => ({
      component: edge.source.endsWith(`:${input.target}`) ? edge.target : edge.source,
      relation: edge.properties.relation, expected: 'unknown', confidence: 0.15
    })),
    evidenceClass: Array.isArray(input.evidenceRefs) && input.evidenceRefs.length ? 'evidence_informed' : 'prior_model',
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    uncertainty: 0.85, createdAt: new Date().toISOString()
  };
}

async function predict(options) {
  const { db, scope, input } = options;
  validateScope(scope);
  const prediction = makePrediction(input);
  await ledger.appendEvent(db, { ...scope, type: 'evidence_attached', payload: { kind: 'self_twin_prediction', ...prediction } });
  return prediction;
}

async function observe(options) {
  const { db, scope, predictionId, observations, evidenceRefs = [] } = options;
  validateScope(scope);
  if (!predictionId || !Array.isArray(observations) || observations.length === 0) throw new Error('self-twin-observation-required');
  const events = await ledger.listEvents(db, { ...scope, limit: 2000 });
  const prediction = events.find((event) => event.payload?.kind === 'self_twin_prediction' && event.payload.predictionId === predictionId)?.payload;
  if (!prediction) throw new Error('self-twin-prediction-not-found');
  const discrepancy = compare(prediction, observations);
  const record = { observationId: randomUUID(), predictionId, observations, evidenceRefs, discrepancy, createdAt: new Date().toISOString() };
  await ledger.appendEvent(db, { ...scope, type: 'evidence_attached', payload: { kind: 'self_twin_observation', ...record } });
  if (discrepancy.epsilon > 0) {
    await ledger.appendEvent(db, { ...scope, type: 'evidence_attached', payload: { kind: 'self_twin_discrepancy', ...record } });
    const candidate = candidateAdapter.build({
      module: 'epistemic', agentId: scope.entityId, now: Date.now(),
      observation: {
        candidateId: `self-twin:${predictionId}:${record.observationId}`,
        semanticType: 'self_twin_prediction_error',
        compactPreview: `Erreur de prédiction ${discrepancy.epsilon.toFixed(4)} sur ${discrepancy.comparedMetrics} métrique(s)`,
        predictionError: discrepancy.epsilon, confidence: 0.5,
        evidenceCoverage: evidenceRefs.length ? 1 : 0, evidenceRefs,
        causalParents: [predictionId], causalEvidence: evidenceRefs.length > 0,
        actionable: false, constraints: { integrity: 'review' }
      }
    });
    const admission = options.candidateSubmitter ? await options.candidateSubmitter({
      db, candidate, triggerCycle: false
    }) : null;
    record.agowCandidate = { ...candidate, admission };
  }
  return record;
}

function compare(prediction, observations) {
  const byMetric = new Map(observations.filter((item) => Number.isFinite(item.predicted) && Number.isFinite(item.observed))
    .map((item) => [item.metric, Math.min(1, Math.abs(item.observed - item.predicted) / Math.max(1, Math.abs(item.predicted)))]));
  const errors = [...byMetric.values()];
  return { epsilon: errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : 0,
    comparedMetrics: errors.length, status: errors.length ? 'measured' : 'unmeasured', predictionId: prediction.predictionId };
}

async function intervene(options) {
  if (typeof options?.executor !== 'function') throw new Error('isolated-intervention-executor-required');
  const prediction = await predict({ ...options, input: options.input });
  const result = await options.executor({ prediction, context: options.context || {}, budget: options.budget || {} });
  if (!result || !Array.isArray(result.observations)) throw new Error('intervention-observations-required');
  const record = await observe({ ...options, predictionId: prediction.predictionId, observations: result.observations, evidenceRefs: result.evidenceRefs || [] });
  return { prediction, result, record };
}

module.exports = { predict, observe, intervene, compare, makePrediction };
