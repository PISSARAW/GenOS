'use strict';

const { recallForSituation } = require('./recallService');
const { emit } = require('../agentOrchestrationState');

const MAX_RISK_DELTA = 0.5;
const MAX_EVIDENCE_DELTA = 0.5;
const MAX_CONFIDENCE_BOOST = 0.25;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function buildSituation({ agentId, normalizedMission }) {
  return {
    agentId,
    organizationId: normalizedMission.organizationId || normalizedMission.organization_id,
    projectId: normalizedMission.projectId || normalizedMission.project_id,
    missionId: normalizedMission.missionId || normalizedMission.executionRunId || normalizedMission.runId,
    kind: normalizedMission.autobiographicalKind || normalizedMission.kind,
    goal: normalizedMission.prompt || normalizedMission.currentTask || normalizedMission.goal || ''
  };
}

function boundedAdjustments(adjustments = {}) {
  return {
    riskDelta: clamp(adjustments.riskDelta, -MAX_RISK_DELTA, MAX_RISK_DELTA),
    evidenceStrictnessDelta: clamp(adjustments.evidenceStrictnessDelta, 0, MAX_EVIDENCE_DELTA),
    confidenceBoost: clamp(adjustments.confidenceBoost, 0, MAX_CONFIDENCE_BOOST)
  };
}

function applyAdjustments(autonomyPlan, adjustments) {
  const policy = autonomyPlan.selfModel?.decisionPolicy;
  if (!policy) return;
  policy.riskTolerance = clamp(policy.riskTolerance + adjustments.riskDelta, 0, 1);
  policy.evidenceStrictness = clamp(policy.evidenceStrictness + adjustments.evidenceStrictnessDelta, 0, 1);
  if (autonomyPlan.selfModel.limits) {
    autonomyPlan.selfModel.limits.riskTolerance = policy.riskTolerance;
    autonomyPlan.selfModel.limits.evidenceStrictness = policy.evidenceStrictness;
  }
  const state = autonomyPlan.selfModel.state;
  if (state && Number.isFinite(state.confidence)) {
    state.confidence = clamp(state.confidence + (adjustments.confidenceBoost || 0), 0, 1);
  }
}

function emitRecall({ agentId, eventType, detail, payload, severity = 'info' }) {
  emit(agentId, eventType, 'AUTOBIOGRAPHICAL_RECALL', detail, payload, severity);
}

async function snapshotIntegration(db, agentId) {
  try {
    return await require('../integrationProxyService').measure(db, agentId, {});
  } catch (_) {
    return { status: 'unavailable' };
  }
}

async function snapshotAttention(db, agentId) {
  try {
    return await require('../attentionSchemaBenchService').runAttentionAudit(db, agentId, {});
  } catch (_) {
    return { status: 'unavailable' };
  }
}

async function recallBeforePlanning({ db, agentId, normalizedMission, autonomyPlan }) {
  emitRecall({ agentId, eventType: 'AUTOBIOGRAPHICAL_RECALL_STARTED', detail: 'Autobiographical recall started before plan regulation.', payload: { missionId: buildSituation({ agentId, normalizedMission }).missionId } });
  try {
    const recall = await recallForSituation(buildSituation({ agentId, normalizedMission }), {}, db);
    const adjustments = boundedAdjustments(recall.adjustments);
    recall.recalled = true;
    autonomyPlan.autobiographicalRecall = recall;
    autonomyPlan.autobiographicalAdjustments = adjustments;
    autonomyPlan.integrationProxy = await snapshotIntegration(db, agentId);
    autonomyPlan.attentionAudit = await snapshotAttention(db, agentId);
    applyAdjustments(autonomyPlan, adjustments);
    normalizedMission.selfModelPolicy = autonomyPlan.selfModel?.decisionPolicy || normalizedMission.selfModelPolicy;
    const eventType = recall.episodes.length || recall.lessons.length
      ? 'AUTOBIOGRAPHICAL_RECALL_COMPLETED'
      : 'AUTOBIOGRAPHICAL_RECALL_EMPTY';
    emitRecall({ agentId, eventType, detail: 'Autobiographical recall was applied before plan regulation.', payload: {
      episodeCount: recall.episodes.length,
      lessonCount: recall.lessons.length,
      adjustments,
      integration: autonomyPlan.integrationProxy?.status || 'unavailable'
    } });
    emitRecall({ agentId, eventType: 'AUTOBIOGRAPHICAL_ADJUSTMENTS_APPLIED', detail: 'Bounded autobiographical adjustments were applied to the decision policy.', payload: { adjustments } });
    return recall;
  } catch (error) {
    const fallback = { episodes: [], lessons: [], summary: 'Autobiographical recall unavailable.', adjustments: {}, recalled: false };
    autonomyPlan.autobiographicalRecall = fallback;
    autonomyPlan.autobiographicalAdjustments = boundedAdjustments();
    emitRecall({ agentId, eventType: 'AUTOBIOGRAPHICAL_RECALL_FAILED', detail: error.message, payload: { error: error.message }, severity: 'warning' });
    return fallback;
  }
}

module.exports = { recallBeforePlanning, buildSituation, boundedAdjustments, applyAdjustments };
