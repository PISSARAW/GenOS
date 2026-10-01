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
  ORCHESTRATION_ACTION_EXECUTED: 'step',
  ORCHESTRATION_ACTION_FAILED: 'primitive_failure',
  EVIDENCE_REPORT: 'evidence_validated',
  STRATEGY_PRIMITIVE_EXEC: 'strategy_change',
  STRATEGY_FEEDBACK_LOOP_TRIGGERED: 'strategy_change',
  WORKER_RECOVERY_STARTED: 'rollback',
  TRINITY_WINNER_PROMOTED: 'promotion',
  AGENT_COMPLETED: 'mission_end',
  AGENT_FAILED: 'primitive_failure',
  APOPTOSIS_TRIGGERED: 'quarantine',
  ORCHESTRATION_DECISION_BLOCKED: 'primitive_failure',
  HUMAN_DECISION: 'human_decision',
  PERCEPTION_OBSERVED: 'perception'
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
  if (event.eventType === 'PERCEPTION_OBSERVED') return { status: 'observed', evidence: [], uncertainties: [] };
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
  const perception = payload.observation || null;
  return {
    id: perception?.id ? `episode_${perception.id}` : undefined,
    agentId: firstValue(event.agentId, 'orchestrator'),
    missionId: firstValue(payload.missionId, payload.executionRunId, payload.runId),
    organizationId: firstValue(payload.organizationId, payload.organization_id, event.organizationId),
    projectId: firstValue(payload.projectId, payload.project_id, event.projectId),
    kind,
    salience: salienceResult.salience,
    situation: {
      ...situationFromEvent(event, payload),
      goal: payload.goal || situationFromEvent(event, payload).goal,
      perception: perception ? { summary: perception.data?.summary || '', sensorId: perception.sensorId, target: perception.target } : null
    },
    decision: decisionFromEvent({ ...payload, strategy: payload.toolName || payload.strategy }),
    action: actionFromEvent(event, { ...payload, tool: payload.toolName || event.action, sourceAgentId: event.agentId }),
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

async function propagateIgnition(event, weight) {
  try {
    await require('../selectiveSignalService').dispatch(null, {
      modality: 'arousal',
      origin: event.agentId,
      intensity: weight,
      signature: String(event.eventType || 'ignition'),
      scope: 'lineage',
      agentId: event.agentId,
      topic: 'arousal'
    });
  } catch (_) {}
}

async function ignitionFactor(event, weight) {
  try {
    if (!event.agentId) return 1;
    const service = require('../ignitionService');
    const result = await service.charge(null, event.agentId, { weight });
    if (result.ignited) {
      await propagateIgnition(event, weight);
      return service.BURST_FACTOR;
    }
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
  const perceptionGain = event.eventType === 'PERCEPTION_OBSERVED'
    ? Number(event.payload?.observation?.informationGain) || 0 : 0;
  const attenuated = { ...salienceResult, salience: Math.min(1, Math.max(gated, perceptionGain)) };
  if (attenuated.salience < salienceThreshold) return null;
  const episode = episodeFromEvent(event, kind, attenuated);
  if (episode.id) {
    const existing = await episodeStore.getEpisodeById(episode.id, dbOverride);
    if (existing) return existing;
  }
  return episodeStore.recordEpisode(episode, dbOverride);
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
