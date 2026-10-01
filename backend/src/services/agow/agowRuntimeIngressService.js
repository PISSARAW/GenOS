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
  }).then(async (admission) => {
    if (!admission.accepted) return admission;
    const learning = await recordRuntimeOutcome({ ctx, event, refs, admission });
    return { ...admission, causalLearning: learning };
  });
}

function trajectorySteps(frame, event, queryId) {
  return [...new Set([...(frame.causalContext?.triggeredBy || []), frame.primaryContent,
    frame.frameId, queryId, `outcome:${event.eventId || event.id || event.eventType}`].filter(Boolean))];
}

async function recordRuntimeOutcome(options) {
  const { ctx, event, refs } = options;
  const payload = event.payload || {};
  const success = outcomeSucceeded(event, payload);
  const pathwayId = payload.pathwayId || 'worker->agow_outcome';
  let plasticityReceipt;
  try {
    plasticityReceipt = payload.pathwayId
      ? await require('./proceduralization/decompilationService').recordOutcome({
        agentId: ctx.agentId, db: ctx.db, pathwayId, success, evidenceRefs: refs,
        evidenceStatus: payload.evidenceStatus || 'reported', predictionError: workerConfidence(success).predictionError,
        expectedOutcome: payload.expectedOutcome, observedOutcome: payload.outcome
      })
      : await require('./plasticity/agowPlasticityCoordinator').recordOutcome({
        agentId: ctx.agentId, db: ctx.db, pathwayId, success, evidenceRefs: refs,
        evidenceStatus: payload.evidenceStatus || 'reported', predictionError: workerConfidence(success).predictionError,
        allostaticImprovement: payload.allostaticImprovement, regretReduction: payload.regretReduction,
        criticalProblemSolved: payload.criticalProblemSolved === true, reward: payload.reward
      });
  } catch (error) {
    plasticityReceipt = { recorded: false, reason: error.message };
  }
  const frame = options.admission.cycle?.frame;
  const trajectory = frame?.realityMode === 'real' ? await recordTrajectory({ ...options, frame, success, plasticityReceipt }) : null;
  return { plasticity: plasticityReceipt, trajectory };
}

async function recordTrajectory(options) {
  try {
    const queryId = options.event.payload?.activeQueryId || options.admission.cycle?.activeQuery?.query?.queryId;
    const input = trajectoryInput(options, queryId);
    return await require('./proceduralization/cognitiveTrajectoryService').record(input);
  } catch (error) {
    return { recorded: false, reason: error.message };
  }
}

function trajectoryInput(options, queryId) {
  return { agentId: options.ctx.agentId, db: options.ctx.db, frame: options.frame,
    steps: trajectorySteps(options.frame, options.event, queryId),
    candidateRefs: options.frame.causalContext?.triggeredBy || [],
    winningCandidateRefs: primaryRef(options.frame), queryRefs: queryRefs(queryId),
    actionRef: options.event.payload?.actionId || null, outcomeRefs: options.refs,
    evidenceRefs: options.refs, success: options.success, missionId: options.ctx.normalizedMission?.missionId,
    goal: options.frame.activeGoal, selectedAction: selectedAction(options.event),
    predictedOutcome: options.event.payload?.expectedOutcome || null,
    observedOutcome: options.event.payload?.outcome || options.event.eventType,
    context: { signature: options.ctx.normalizedMission?.taskFamily || 'worker_outcome' },
    selfWorldAttribution: options.event.payload?.selfWorldAttribution || null,
    proceduralizationEvent: options.plasticityReceipt?.plasticity?.pathway?.pathwayId
      || options.plasticityReceipt?.pathway?.pathwayId || null };
}

function primaryRef(frame) {
  return frame.primaryContent ? [frame.primaryContent] : [];
}

function queryRefs(queryId) {
  return queryId ? [queryId] : [];
}

function selectedAction(event) {
  return event.payload?.toolName || event.action || null;
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

module.exports = { process, trajectorySteps, recordRuntimeOutcome };
