'use strict';

// Bridges the existing telemetry bus into autobiographical memory: not every
// event deserves a durable memory, only salient ones (see salience.js).

const { computeSalience, DEFAULT_SALIENCE_THRESHOLD } = require('./salience');
const episodeStore = require('./episodeStore');

const EVENT_KIND_MAP = {
  AGENT_RUNTIME_STARTED: 'mission_start',
  AGENT_PLAN_CREATED: 'strategy_change',
  WORKER_CAPABILITY_LEASED: 'worker_created',
  AGENT_STEP: 'step',
  EVIDENCE_REPORT: 'evidence_validated',
  STRATEGY_PRIMITIVE_EXEC: 'strategy_change',
  STRATEGY_FEEDBACK_LOOP_TRIGGERED: 'strategy_change',
  WORKER_RECOVERY_STARTED: 'rollback',
  TRINITY_WINNER_PROMOTED: 'promotion',
  AGENT_COMPLETED: 'mission_end',
  AGENT_FAILED: 'primitive_failure',
  APOPTOSIS_TRIGGERED: 'quarantine',
  ORCHESTRATION_DECISION_BLOCKED: 'primitive_failure',
  HUMAN_DECISION: 'human_decision'
};

let attached = false;
let salienceThreshold = DEFAULT_SALIENCE_THRESHOLD;

function resolveKind(eventType) {
  return EVENT_KIND_MAP[eventType] || null;
}

function situationFromEvent(event, payload) {
  return {
    goal: payload.goal || payload.task || payload.currentTask || null,
    worldState: payload.worldState || {},
    survivalState: payload.survivalState || {},
    physicalState: payload.physicalState || {}
  };
}

function decisionFromEvent(payload) {
  return {
    selectedStrategy: payload.selectedStrategy || payload.strategy || null,
    alternatives: payload.alternatives || [],
    reason: payload.reason || null
  };
}

function actionFromEvent(event, payload) {
  return {
    tool: payload.tool || event.action || null,
    target: payload.sourceAgentId || payload.workerId || event.agentId || null,
    cost: payload.cost || {}
  };
}

function outcomeFromEvent(event, payload) {
  return {
    status: event.status || payload.status || 'unknown',
    evidence: payload.evidence || [],
    uncertainties: payload.uncertainties || []
  };
}

function firstValue(...values) {
  return values.find(Boolean) || null;
}

function episodeFromEvent(event, kind, salienceResult) {
  const payload = event.payload || {};
  return {
    agentId: firstValue(event.agentId, 'orchestrator'),
    missionId: firstValue(payload.missionId, payload.executionRunId, payload.runId),
    organizationId: firstValue(payload.organizationId, payload.organization_id, event.organizationId),
    projectId: firstValue(payload.projectId, payload.project_id, event.projectId),
    kind,
    salience: salienceResult.salience,
    situation: situationFromEvent(event, payload),
    decision: decisionFromEvent(payload),
    action: actionFromEvent(event, payload),
    outcome: outcomeFromEvent(event, payload),
    lesson: {},
    timestamp: event.timestamp
  };
}

async function reafferenceWeight(event) {
  try {
    const service = require('../efferenceCopyService');
    const result = await service.discharge(null, event.agentId, event);
    if (result.matched) return service.REAFFERENCE_WEIGHT;
  } catch (_) {}
  return 1;
}

async function ignitionFactor(event, weight) {
  try {
    if (!event.agentId) return 1;
    const service = require('../ignitionService');
    const result = await service.charge(null, event.agentId, { weight });
    if (result.ignited) return service.BURST_FACTOR;
    if (result.suppressed) return service.REFRACTORY_FACTOR;
    return service.LOCAL_FACTOR;
  } catch (_) {
    return 1;
  }
}

async function captureTelemetryEvent(event = {}, dbOverride = null) {
  const kind = resolveKind(event.eventType);
  if (!kind) return null;
  const salienceResult = computeSalience(event);
  const gated = salienceResult.salience
    * await reafferenceWeight(event)
    * await ignitionFactor(event, salienceResult.salience);
  const attenuated = { ...salienceResult, salience: Math.min(1, gated) };
  if (attenuated.salience < salienceThreshold) return null;
  return episodeStore.recordEpisode(episodeFromEvent(event, kind, attenuated), dbOverride);
}

function handleEvent(event) {
  captureTelemetryEvent(event).catch((error) => {
    console.warn('[AutobiographicalMemory] capture failed:', error.message);
  });
}

function attachAutobiographicalCapture(telemetryObserver, options = {}) {
  if (attached) return;
  if (Number.isFinite(options.salienceThreshold)) salienceThreshold = options.salienceThreshold;
  telemetryObserver.on('telemetry', handleEvent);
  attached = true;
}

function detachAutobiographicalCapture(telemetryObserver) {
  telemetryObserver.off('telemetry', handleEvent);
  attached = false;
}

module.exports = {
  attachAutobiographicalCapture,
  detachAutobiographicalCapture,
  captureTelemetryEvent,
  resolveKind,
  EVENT_KIND_MAP
};
