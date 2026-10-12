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
const pendingCaptures = new Set();

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
  const blockedReason = ['ORACLE_DOMAIN_UNAVAILABLE', 'ORACLE_BUDGET_EXPIRED']
    .includes(payload.failure?.code) ? payload.failure.code : null;
  return {
    status: outcomeStatus(event, payload, blockedReason),
    artifactValidated: Boolean(payload.validatedWorkerArtifact),
    evidence: firstValue(payload.evidence,
      payload.validatedWorkerArtifact ? [payload.evidenceReport] : []),
    uncertainties: blockedReason ? [blockedReason] : firstValue(payload.uncertainties, [])
  };
}

function outcomeStatus(event, payload, blockedReason) {
  if (event.eventType === 'AGENT_FAILED') return blockedReason ? 'blocked' : 'failed';
  if (event.eventType === 'AGENT_COMPLETED') return 'completed_unverified';
  if (event.eventType === 'EVIDENCE_REPORT') return payload.validatedWorkerArtifact
    ? 'artifact_validated' : 'unverified';
  return firstValue(event.status, payload.status, 'unknown');
}

function firstValue(...values) {
  return values.find(Boolean) || null;
}

function episodeFromEvent(event, kind, salienceResult) {
  const payload = event.payload || {};
  const perception = payload.observation || null;
  return {
    id: episodeId(event, perception),
    agentId: firstValue(event.agentId, 'orchestrator'),
    missionId: firstValue(payload.missionId, payload.executionRunId, payload.runId),
    organizationId: firstValue(payload.organizationId, payload.organization_id, event.organizationId),
    projectId: firstValue(payload.projectId, payload.project_id, event.projectId),
    kind: firstValue(payload.workerKind, kind),
    salience: salienceResult.salience,
    situation: episodeSituation(event, payload, perception),
    decision: decisionFromEvent({ ...payload, strategy: firstValue(payload.toolName, payload.strategy) }),
    action: actionFromEvent(event, { ...payload,
      tool: firstValue(payload.toolName, event.action), sourceAgentId: event.agentId }),
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
  const payload = event.payload || {};
  const evidencePresent = await verifiedWorkerEvidence(event, dbOverride);
  const scoredPayload = payload.evidenceReport
    ? { ...payload, evidence: [], evidencePresent }
    : payload;
  const salienceResult = computeSalience({ ...event, payload: scoredPayload });
  const gated = salienceResult.salience
    * await reafferenceWeight(event)
    * await ignitionFactor(event, salienceResult.salience);
  const perceptionGain = event.eventType === 'PERCEPTION_OBSERVED'
    ? Number(event.payload?.observation?.informationGain) || 0 : 0;
  const attenuated = { ...salienceResult, salience: Math.min(1, Math.max(gated, perceptionGain)) };
  if (attenuated.salience < salienceThreshold) return null;
  const scopedEvent = await withPersistedScope({ ...event,
    payload: { ...payload, validatedWorkerArtifact: evidencePresent } }, dbOverride);
  const episode = episodeFromEvent(scopedEvent, kind, attenuated);
  if (episode.id) {
    const existing = await episodeStore.getEpisodeById(episode.id, dbOverride);
    if (existing) return existing;
  }
  return episodeStore.recordEpisode(episode, dbOverride);
}

function episodeId(event, perception) {
  const sourceId = firstValue(perception?.id, event.id);
  return sourceId ? `episode_${sourceId}` : undefined;
}

function episodeSituation(event, payload, perception) {
  return { ...situationFromEvent(event, payload), perception: perception
    ? { summary: firstValue(perception.data?.summary, ''),
      sensorId: perception.sensorId, target: perception.target } : null };
}

async function withPersistedScope(event, dbOverride) {
  if (!event.agentId) return event;
  const db = dbOverride || await require('../../db').getDatabase();
  const row = await db.get(`SELECT a.metadata_json AS metadataJson,
    w.organization_id AS organizationId, w.project_id AS projectId
    FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, event.agentId);
  if (!row) return event;
  const payload = event.payload || {};
  assertPersistedScope(row, payload);
  const metadata = JSON.parse(row.metadataJson || '{}');
  return { ...event, payload: { ...payload,
    organizationId: firstValue(row.organizationId, payload.organizationId),
    projectId: firstValue(row.projectId, payload.projectId),
    workerKind: firstValue(metadata.workerKind, payload.workerKind),
    goal: firstValue(metadata.workerContract?.mission?.objective, payload.goal) } };
}

function assertPersistedScope(row, payload) {
  if (Boolean(row.organizationId) !== Boolean(row.projectId)) {
    throw new Error('Incomplete persisted autobiographical tenant scope.');
  }
  if (payload.organizationId && payload.organizationId !== row.organizationId) {
    throw new Error('Autobiographical event tenant conflicts with persisted agent scope.');
  }
  if (payload.projectId && payload.projectId !== row.projectId) {
    throw new Error('Autobiographical event tenant conflicts with persisted agent scope.');
  }
}

async function verifiedWorkerEvidence(event, dbOverride) {
  const report = event.payload?.evidenceReport;
  if (!report || !event.agentId) return false;
  try {
    const db = dbOverride || await require('../../db').getDatabase();
    const row = await db.get('SELECT metadata_json FROM agents WHERE id = ?', event.agentId);
    const contract = JSON.parse(row?.metadata_json || '{}').workerContract;
    if (!contract) return false;
    require('../agents/workerArtifactContract').validateWorkerArtifact(
      { events: [{ evidenceReport: report }] }, { agentId: event.agentId, workerContract: contract });
    return true;
  } catch (_) { return false; }
}

function handleEvent(event) {
  const pending = captureTelemetryEvent(event).catch((error) => {
    console.warn('[AutobiographicalMemory] capture failed:', error.message);
  });
  pendingCaptures.add(pending);
  pending.finally(() => pendingCaptures.delete(pending));
}

async function flushAutobiographicalCapture() {
  while (pendingCaptures.size) await Promise.allSettled([...pendingCaptures]);
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
  flushAutobiographicalCapture,
  resolveKind,
  EVENT_KIND_MAP
};
