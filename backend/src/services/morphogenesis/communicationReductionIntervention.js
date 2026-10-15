'use strict';

const crypto = require('node:crypto');
const evidenceAudit = require('../trinityEvidenceAudit');
const receiptService = require('../epistemicVerifierReceiptService');
const verifierTrust = require('../verifierTrustRegistry');

const CANDIDATE_ID = 'communication-reduction:barrier-only-v1';
const COORDINATION_TOOLS = Object.freeze([
  'genos_organization_state', 'genos_worker_inbox', 'genos_worker_publish'
]);
const MIN_SAMPLES = 10;
const MIN_REDUNDANCY_RATIO = 0.2;

function metricDigest(metric) {
  const body = { id: metric.id, missionId: metric.missionId, attempts: metric.attempts,
    redundant: metric.redundant, source: metric.source };
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
}

function validMetricShape(metric, missionId) {
  return metric && metric.source === 'communication_outcomes' && metric.missionId === missionId
    && Number.isSafeInteger(metric.attempts) && metric.attempts >= MIN_SAMPLES
    && Number.isSafeInteger(metric.redundant) && metric.redundant >= 0 && metric.redundant <= metric.attempts;
}

function validMetricReceipt(metric) {
  const receipt = metric.receipt;
  return evidenceAudit.isVerifiedReceipt(receipt) && receipt.resultId === metric.id
    && receipt.evidenceDigest === metricDigest(metric)
    && receiptService.validateReceipt(receipt, verifierTrust.listVerifierDigests());
}

function verifiedMetric(metric, missionId) {
  return validMetricShape(metric, missionId) && validMetricReceipt(metric);
}

function cadenceOf(mission) {
  const policy = mission.coordinationPolicy || mission.coordination_policy || {};
  return String(policy.communicationCadence || policy.communication_cadence || '').toLowerCase();
}

function requiredToolsOf(mission) {
  return new Set([...(mission.requiredTools || []), ...(mission.toolRequirements || [])]);
}

function availabilityReason(mission, metric) {
  if (mission.organization === 'cross_functional_pod') return 'communication_required_by_organization';
  if (mission.communicationRequired === true || mission.communication_required === true) return 'communication_required_by_mission';
  if (cadenceOf(mission) !== 'continuous_sync') return 'continuous_coordination_not_active';
  if (!COORDINATION_TOOLS.every((tool) => (mission.toolLease || []).includes(tool))) return 'coordination_lease_incomplete';
  if (COORDINATION_TOOLS.some((tool) => requiredToolsOf(mission).has(tool))) return 'coordination_tools_required';
  if (!verifiedMetric(metric, mission.missionId)) return 'verified_mission_scoped_redundancy_metric_required';
  if (metric.redundant / metric.attempts < MIN_REDUNDANCY_RATIO) return 'measured_redundancy_below_threshold';
  return null;
}

function describeAvailability(mission = {}, metric = null) {
  const reason = availabilityReason(mission, metric);
  return { candidateId: CANDIDATE_ID, scale: 'COMMUNICATION_REDUCTION', status: reason ? 'unavailable' : 'available',
    reason, measurement: reason ? null : { id: metric.id, attempts: metric.attempts,
      redundancyRatio: metric.redundant / metric.attempts, receiptId: metric.receipt.resultId } };
}

function selectedAction(selection) {
  return selection && selection.candidateId === CANDIDATE_ID
    && selection.scale === 'COMMUNICATION_REDUCTION' && selection.status === 'selected';
}

function isCommunicationCandidate(selection) {
  return selection && selection.candidateId === CANDIDATE_ID
    && selection.scale === 'COMMUNICATION_REDUCTION';
}

function transitionSelectionFailure(selection) {
  if (!isCommunicationCandidate(selection)) return 'NO_CHANGE';
  return typeof selection.transitionId !== 'string' || !selection.transitionId
    ? 'transition_identity_missing' : null;
}

function availabilityFailure(mission, selection, metric) {
  const availability = describeAvailability(mission, metric);
  if (!selectedAction(selection) || availability.status !== 'available') {
    return availability.reason || 'action_not_selected';
  }
  return null;
}

function nextMission(mission, selection, metric) {
  const toolLease = mission.toolLease.filter((tool) => !COORDINATION_TOOLS.includes(tool));
  const policy = mission.coordinationPolicy || mission.coordination_policy || {};
  return { ...mission, toolLease,
    coordinationPolicy: { ...policy, communicationCadence: 'barrier_only' },
    communicationIntervention: { candidateId: CANDIDATE_ID, status: 'applied_at_epoch_boundary',
      transitionId: selection.transitionId, metricId: metric.id, metricReceiptId: metric.receipt.resultId } };
}

function applyCommunicationReduction(mission = {}, selection = null, metric = null) {
  const failure = transitionSelectionFailure(selection) || availabilityFailure(mission, selection, metric);
  if (failure) return { applied: false, reason: failure, mission };
  const updated = nextMission(mission, selection, metric);
  return { applied: true, reason: null, mission: updated };
}

module.exports = { CANDIDATE_ID, COORDINATION_TOOLS, metricDigest, describeAvailability, applyCommunicationReduction };
