'use strict';

const { createHash } = require('crypto');
const { validateSchema, validateArtifact } = require('./artifactSchemaService');
const { executePipeline, executePipelineStream } = require('./pipelineExecutionService');
const { canonicalJson, coded, timestamp } = require('./variantExecutionHelpers');

const INCIDENT_TRANSITIONS = { ACTIVE: ['SITREP', 'HANDOVER', 'CLOSE'], HANDOVER_PENDING: ['HANDOVER_ACCEPTED', 'CLOSE'], CLOSED: [] };

function isValidBallot(ballot) {
  if (!ballot || !ballot.memberId || !ballot.decision) return false;
  return Array.isArray(ballot.evidenceRefs) && ballot.evidenceRefs.length > 0;
}

function tallyBallots(valid) {
  const counts = new Map();
  for (const ballot of valid) counts.set(ballot.decision, (counts.get(ballot.decision) || 0) + 1);
  return counts;
}

function pickWinner(counts) {
  const ranked = [...counts].sort((left, right) => right[1] - left[1]);
  return ranked[0];
}

function consensusAccepted(input = {}) {
  const { valid = [], quorum = 0, winner = null, protocol = {}, dissent = [], counts = new Map() } = input;
  if (valid.length < quorum || !winner) return false;
  if (!protocol.dissentRequired) return true;
  return dissent.length > 0 || counts.size === 1;
}

function collectEvidence(valid) {
  return [...new Set(valid.flatMap((ballot) => ballot.evidenceRefs))];
}

function evaluateConsensus(input = {}) {
  const { protocol = {}, ballots = [] } = input;
  const quorum = Number(protocol.quorum);
  if (!Number.isInteger(quorum) || quorum < 1) throw coded('Consensus quorum must be a positive integer.', 'ATEAM_CONSENSUS_QUORUM_INVALID');
  const valid = ballots.filter(isValidBallot);
  const counts = tallyBallots(valid);
  const winner = pickWinner(counts);
  const dissent = valid.filter((ballot) => ballot.decision !== winner?.[0]);
  const accepted = consensusAccepted({ valid, quorum, winner, protocol, dissent, counts });
  if (!accepted) return { status: 'NO_CONSENSUS', decision: null, quorum, participation: valid.length, votes: Object.fromEntries(counts), dissent, evidenceRefs: collectEvidence(valid) };
  return { status: 'CONSENSUS', decision: winner[0], quorum, participation: valid.length, votes: Object.fromEntries(counts), dissent, evidenceRefs: collectEvidence(valid) };
}

function matrixOutcome(decision) {
  const approved = decision.functionalApproval === true && decision.productApproval === true;
  if (approved) return 'APPROVED';
  if (decision.functionalApproval === false || decision.productApproval === false) return 'DISAGREEMENT';
  return 'PENDING';
}

function matrixResolution(outcome, authority) {
  if (outcome === 'APPROVED') return 'dual_owner_approval';
  return authority.escalationPath || 'escalate_to_named_sponsor';
}

function resolveMatrixDecision(input = {}) {
  const { authority = {}, decision = {}, currentRevision } = input;
  if (!authority.decisionType || authority.decisionType !== decision.type) throw coded('Decision type does not match its authority entry.', 'ATEAM_MATRIX_DECISION_TYPE_MISMATCH');
  if (decision.revision !== currentRevision) throw coded('Matrix decision revision is stale.', 'ATEAM_MATRIX_REVISION_CONFLICT');
  if (decision.functionalApproval === true && decision.functionalApproverId !== authority.functionalOwnerId) throw coded('Functional approval is not from the assigned owner.', 'ATEAM_MATRIX_OWNER_MISMATCH');
  if (decision.productApproval === true && decision.productApproverId !== authority.productOwnerId) throw coded('Product approval is not from the assigned owner.', 'ATEAM_MATRIX_OWNER_MISMATCH');
  const outcome = matrixOutcome(decision);
  return { status: outcome, decisionId: decision.decisionId, revision: currentRevision + 1, resolution: matrixResolution(outcome, authority) };
}

function relayPayload(input) {
  return {
    version: input.version || 1,
    sequence: input.sequence || 1,
    previousOwner: input.previousOwner,
    nextOwner: input.nextOwner,
    summary: input.summary || '',
    context: input.context || input.state || {},
    artifactRefs: input.artifactRefs || [],
    evidenceRefs: input.evidenceRefs || []
  };
}

function assertRelayVersion(payload) {
  if (!Number.isInteger(payload.version) || payload.version < 1) throw coded('Relay handoff requires valid version, distinct owners and evidence.', 'ATEAM_RELAY_HANDOFF_INVALID');
  if (!Number.isInteger(payload.sequence) || payload.sequence < 1) throw coded('Relay handoff requires valid version, distinct owners and evidence.', 'ATEAM_RELAY_HANDOFF_INVALID');
}

function assertRelayOwners(payload) {
  if (!payload.previousOwner || !payload.nextOwner || payload.previousOwner === payload.nextOwner) throw coded('Relay handoff requires valid version, distinct owners and evidence.', 'ATEAM_RELAY_HANDOFF_INVALID');
  if (!payload.evidenceRefs.length) throw coded('Relay handoff requires valid version, distinct owners and evidence.', 'ATEAM_RELAY_HANDOFF_INVALID');
}

function createRelayHandoff(input = {}) {
  const payload = relayPayload(input);
  assertRelayVersion(payload);
  assertRelayOwners(payload);
  return { ...payload, digest: createHash('sha256').update(canonicalJson(payload)).digest('hex'), status: 'PENDING_RECEIVER' };
}

function acknowledgeRelay(input = {}) {
  const expected = createRelayHandoff(input);
  if (expected.digest !== input.digest) throw coded('Relay handoff digest does not match its payload.', 'ATEAM_RELAY_DIGEST_MISMATCH');
  if (input.receiverId !== input.nextOwner || input.accepted !== true) return { status: 'ROLLED_BACK', ownerId: input.previousOwner, reason: input.reason || 'receiver_rejected' };
  return { status: 'ACCEPTED', ownerId: input.nextOwner, version: input.version, digest: input.digest };
}

function allowedIncidentEvent(status, type) {
  const allowed = INCIDENT_TRANSITIONS[status || 'ACTIVE'] || [];
  return allowed.includes(type);
}

function incidentStatus(type) {
  if (type === 'HANDOVER') return 'HANDOVER_PENDING';
  if (type === 'CLOSE') return 'CLOSED';
  return 'ACTIVE';
}

function timelineEntry(event) {
  return { type: event.type, at: event.at || new Date().toISOString(), actorId: event.actorId || null, payload: event.payload || {} };
}

function incidentPeriod(state, event) {
  if (event.type === 'HANDOVER_ACCEPTED') return Number(state.period || 1) + 1;
  return Number(state.period || 1);
}

function latestSitrep(state, event) {
  if (event.type === 'SITREP') return event.payload;
  return state.latestSitrep || null;
}

function advanceIncidentPeriod(input = {}) {
  const { state = {}, event = {} } = input;
  if (!allowedIncidentEvent(state.status, event.type)) throw coded('Incident event is invalid for the current operational period.', 'ATEAM_ICS_TRANSITION_INVALID');
  const timeline = [...(state.timeline || []), timelineEntry(event)];
  return { ...state, status: incidentStatus(event.type), period: incidentPeriod(state, event), timeline, latestSitrep: latestSitrep(state, event) };
}

function assertTimebox(mandate, now) {
  if (!Number.isFinite(mandate.hardTimebox?.enforceAt) || now >= mandate.hardTimebox.enforceAt) throw coded('Tiger team mandate timebox has expired.', 'ATEAM_TIGER_TIMEBOX_EXPIRED');
}

function assertMandateScope(mandate, action) {
  const allowed = mandate.allowedActions || [];
  const prohibited = mandate.prohibitedActions || [];
  if (!allowed.includes(action.type) || prohibited.includes(action.type)) throw coded('Action is outside the urgent mandate.', 'ATEAM_TIGER_SCOPE_VIOLATION');
}

function assertMandateBudget(mandate, action) {
  const cost = Number(action.cost) || 0;
  const remaining = Number(mandate.remainingBudget) || 0;
  if (cost > remaining) throw coded('Action exceeds the urgent mandate budget.', 'ATEAM_TIGER_BUDGET_EXCEEDED');
}

function assertMandateResources(mandate, action) {
  const resources = action.resources || {};
  for (const [resource, amount] of Object.entries(resources)) {
    const limit = mandate.resourceLimits?.[resource];
    if (Number.isFinite(limit) && amount > limit) throw coded(`Action exceeds urgent resource limit '${resource}'.`, 'ATEAM_TIGER_RESOURCE_LIMIT');
  }
}

function authorizeUrgentAction(input = {}) {
  const { mandate = {}, action = {}, now = Date.now() } = input;
  assertTimebox(mandate, now);
  assertMandateScope(mandate, action);
  assertMandateBudget(mandate, action);
  assertMandateResources(mandate, action);
  return { authorized: true, scope: mandate.scope, expiresAt: mandate.hardTimebox.enforceAt, auditRequired: true };
}

function gapRejection(proposal, budget) {
  if (!proposal.capability || proposal.capabilityGap !== true) return 'no_verified_capability_gap';
  if ((Number(proposal.estimatedCost) || 0) > (Number(budget) || 0)) return 'reconfiguration_budget_exceeded';
  if (proposal.verified !== true) return 'evidence_required';
  return null;
}

function timingRejection(input = {}) {
  const { proposal = {}, policy = {}, recent = [], stableSince = 0, now = Date.now() } = input;
  const threshold = Number(policy.hysteresisThreshold) || 0.2;
  const improvement = Number(proposal.expectedCoverageGain) || 0;
  if (improvement < threshold) return 'below_hysteresis_threshold';
  if (stableSince && now - stableSince < (Number(policy.minStabilityPeriod) || 0)) return 'minimum_stability_period';
  if (recent.length >= (Number(policy.maxReconfigurationsPerHour) || 2)) return 'reconfiguration_rate_limit';
  return null;
}

function authorizeStaffingChange(input = {}) {
  const { proposal = {}, history = [], policy = {}, now = Date.now() } = input;
  const gap = gapRejection(proposal, input.availableBudget);
  if (gap) return { approved: false, reason: gap };
  const recent = history.filter((entry) => now - Date.parse(entry.at) < 3600000);
  const timing = timingRejection({ proposal, policy, recent, stableSince: timestamp(policy.stableSince), now });
  if (timing) return { approved: false, reason: timing };
  return { approved: true, reason: 'verified_capability_gap', expectedCoverageGain: Number(proposal.expectedCoverageGain) || 0 };
}

function joinStatuses(join, statuses) {
  if (!Array.isArray(join.predecessors)) return [];
  return join.predecessors.map((id) => statuses?.[id] || 'PENDING');
}

function joinRequired(join, count) {
  if (join.type === 'ANY') return 1;
  if (join.type === 'N_OF') return Number(join.count);
  return count;
}

function joinBlockReason(statuses) {
  const blocked = statuses.some((status) => status === 'FAILED' || status === 'BLOCKED' || status === 'TIMED_OUT');
  if (blocked) return 'join_quorum_unreachable';
  return 'join_quorum_unmet';
}

function joinVerdict(input = {}) {
  const { join = {}, statuses = [], required = 0, lookup = {} } = input;
  const successes = statuses.filter((status) => status === 'SUCCEEDED').length;
  if (successes >= required) return { ready: true, terminal: true, acceptedPredecessors: join.predecessors.filter((id) => lookup[id] === 'SUCCEEDED') };
  const pending = statuses.filter((status) => status === 'PENDING' || status === 'RUNNING').length;
  if (successes + pending < required) return { ready: false, terminal: true, reason: joinBlockReason(statuses) };
  return { ready: false, terminal: false, reason: 'waiting_for_join_quorum' };
}

function evaluateJoin(input = {}) {
  const join = input.join || {};
  const statuses = joinStatuses(join, input.statuses);
  const required = joinRequired(join, statuses.length);
  if (!Number.isInteger(required) || required < 1 || required > statuses.length) return { ready: false, terminal: true, reason: 'join_threshold_invalid' };
  return joinVerdict({ join, statuses, required, lookup: input.statuses || {} });
}

module.exports = { validateSchema, validateArtifact, executePipeline, executePipelineStream, evaluateConsensus, resolveMatrixDecision, createRelayHandoff, acknowledgeRelay, advanceIncidentPeriod, authorizeUrgentAction, authorizeStaffingChange, evaluateJoin, canonicalJson };