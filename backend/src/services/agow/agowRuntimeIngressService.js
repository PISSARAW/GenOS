'use strict';

const workspace = require('../globalWorkspaceService');
const adapter = require('./candidates/candidateAdapterService');

function evidenceRefs(payload, event) {
  const refs = Array.isArray(payload.evidenceRefs) ? payload.evidenceRefs.filter(Boolean).map(String) : [];
  const eventId = payload.eventId || event.id;
  if (eventId) refs.push(String(eventId));
  return refs;
}

function outcomeSucceeded(event, payload) {
  return ['AGENT_COMPLETED', 'WORKER_TASK_COMPLETED'].includes(event.eventType)
    || payload.outcome === 'success' || payload.success === true;
}

function workerConfidence(success) {
  return { confidence: success ? 0.8 : 0.4, predictionError: success ? 0 : 0.7, severity: success ? 'normal' : 'high' };
}

function workerObservation(options) {
  const { ctx, event, payload, refs } = options;
  const success = outcomeSucceeded(event, payload);
  const confidence = workerConfidence(success);
  return {
    semanticType: 'worker_outcome', instanceId: event.eventId || event.id || null,
    artifactRef: payload.artifactRef || payload.artifactId || null,
    compactPreview: String(event.detail || event.eventType || '').slice(0, 500), evidenceRefs: refs,
    ...confidence, evidenceCoverage: refs.length ? 1 : 0, goalMatched: success, actionable: false,
    causalEvidence: refs.length > 0,
    redundancyKey: `worker:${ctx.agentId}:${event.eventType}:${payload.artifactRef || ''}`
  };
}

function outcomeCandidate(ctx, event) {
  const payload = event.payload || {};
  const refs = evidenceRefs(payload, event);
  return adapter.submit({
    db: ctx.db, agentId: ctx.agentId, module: 'worker', activeGoal: ctx.normalizedMission?.missionId || '',
    observation: workerObservation({ ctx, event, payload, refs })
  });
}

function observationItems(observation) {
  const data = observation.data || {};
  if (Array.isArray(data.items)) return data.items;
  return [{ id: observation.id, modality: observation.sensorId,
    confidence: Math.max(0, Math.min(1, 1 - (Number(observation.uncertaintyAfter) || 0))), features: data }];
}

async function processPerception(ctx, event) {
  const observation = event.payload?.observation;
  if (!observation?.id) return null;
  const gain = Math.max(0, Math.min(1, Number(observation.informationGain) || 0));
  return require('./perception/perceptualLoopService').process({
    db: ctx.db, agentId: ctx.agentId, goalMatched: Boolean(event.payload.goal),
    observation: { vector: [gain, Number(observation.uncertaintyAfter) || 0], levels: {}, items: observationItems(observation) }
  });
}

async function process(options) {
  const { ctx, event, finalEvent } = options;
  if (workspace.getMode() === 'off') return null;
  if (event.eventType === 'PERCEPTION_OBSERVED') return processPerception(ctx, event);
  return finalEvent ? outcomeCandidate(ctx, event) : null;
}

module.exports = { process };
