'use strict';

const { digest } = require('./evidenceContractService');

const HASH = /^sha256:[a-f0-9]{64}$/i;
const TERMINAL = new Set(['completed', 'failed', 'interrupted']);
const FAILED_MEMBER_STATES = new Set(['failed', 'error', 'cancelled', 'blocked']);

function validHash(value) {
  return typeof value === 'string' && HASH.test(value);
}

function output(input, result) {
  const members = Array.isArray(input.members) ? input.members : [];
  return { schema: 'genos.mission-completion/v1', missionId: input.missionId || null,
    topology: input.topology || null, lifecycleState: input.lifecycleState,
    verdict: result.verdict, terminal: TERMINAL.has(input.lifecycleState),
    success: result.verdict === 'succeeded',
    requiredMemberIds: input.requiredMemberIds || [],
    completedMemberIds: members.filter((item) => item.status === 'completed').map(memberId),
    evidenceRefs: result.evidenceRefs || [], reasons: result.reasons || [], promotionEligible: false };
}

function unique(values) {
  return Array.isArray(values) && values.length > 0
    && values.every((item) => typeof item === 'string' && item.trim())
    && new Set(values).size === values.length;
}

function memberId(member) {
  return member?.memberId || member?.workerId || null;
}

function proofIndex(proofs) {
  const index = new Map();
  for (const proof of Array.isArray(proofs) ? proofs : []) {
    if (!validHash(proof?.reference) || index.has(proof.reference)) continue;
    index.set(proof.reference, proof);
  }
  return index;
}

function proofIdentity(content) {
  return {
    missionId: content?.missionId || content?.correlation?.missionId || null,
    memberId: content?.memberId || content?.workerId || content?.agentId
      || content?.correlation?.agentId || null
  };
}

function verifiedContent(content) {
  if (content?.state === 'verified') return true;
  return content?.result?.status === 'completed' && content.result.verified === true;
}

function validProof(context) {
  const proof = context.index.get(context.reference);
  if (!proof || !proof.content || digest(proof.content) !== context.reference) return false;
  const identity = proofIdentity(proof.content);
  return identity.missionId === context.missionId && identity.memberId === context.memberId
    && verifiedContent(proof.content);
}

function memberEvidence(input, member, index) {
  const refs = Array.isArray(member.evidenceRefs) ? member.evidenceRefs : [];
  if (!refs.length || !refs.every(validHash)) return null;
  const context = { index, missionId: input.missionId, memberId: memberId(member) };
  return refs.every((reference) => validProof({ ...context, reference })) ? refs : null;
}

function identityVerdict(context) {
  if (!unique(context.required) || context.byId.size !== context.members.length
      || context.byId.has(null)) {
    return { verdict: 'partial', reason: 'member_identity_invalid', evidenceRefs: [] };
  }
  if (context.required.some((id) => !context.byId.has(id))) {
    return { verdict: 'partial', reason: 'required_member_missing', evidenceRefs: [] };
  }
  return null;
}

function memberStateVerdict(required, byId) {
  if (required.some((id) => FAILED_MEMBER_STATES.has(byId.get(id).status))) {
    return { verdict: 'failed', reason: 'required_member_failed', evidenceRefs: [] };
  }
  return null;
}

function memberVerdict(input, index) {
  const required = input.requiredMemberIds || [];
  const members = Array.isArray(input.members) ? input.members : [];
  const byId = new Map(members.map((item) => [memberId(item), item]));
  const identity = identityVerdict({ required, members, byId });
  if (identity) return identity;
  const state = memberStateVerdict(required, byId);
  if (state) return state;
  const evidence = required.map((id) => memberEvidence(input, byId.get(id), index));
  if (required.some((id, offset) => byId.get(id).status !== 'completed' || !evidence[offset])) {
    return { verdict: 'partial', reason: 'required_member_evidence_invalid', evidenceRefs: [] };
  }
  const evidenceRefs = evidence.flat();
  return { verdict: null, reason: null, evidenceRefs: [...new Set(evidenceRefs)] };
}

function topologyVerdict(validation) {
  if (!validation || !['verified', 'failed', 'partial'].includes(validation.status)) {
    return { verdict: 'partial', reasons: ['topology_validation_missing'] };
  }
  const reasons = Array.isArray(validation.reasons) && validation.reasons.length
    ? validation.reasons : [];
  if (validation.status === 'failed') {
    return { verdict: 'failed', reasons: reasons.length ? reasons : ['topology_validation_failed'] };
  }
  if (validation.status === 'partial') {
    return { verdict: 'partial', reasons: reasons.length ? reasons : ['topology_validation_partial'] };
  }
  return { verdict: null, reasons: [] };
}

function terminalOutput(input, state) {
  if (state === 'accepted' || state === 'running') {
    return output(input, { verdict: 'in_progress', reasons: ['execution_not_terminal'] });
  }
  if (state === 'failed') return output(input, { verdict: 'failed', reasons: [input.reason || 'execution_failed'] });
  if (state === 'interrupted') return output(input, { verdict: 'interrupted', reasons: [input.reason || 'execution_interrupted'] });
  return output(input, { verdict: 'partial', reasons: ['execution_state_unknown'] });
}

function finalOutput(input, assessments) {
  const reasons = assessments.flatMap((item) => item.reasons || (item.reason ? [item.reason] : []));
  const evidenceRefs = assessments.flatMap((item) => item.evidenceRefs || []);
  if (assessments.some((item) => item.verdict === 'failed')) {
    return output(input, { verdict: 'failed', reasons, evidenceRefs });
  }
  if (assessments.some((item) => item.verdict === 'partial')) {
    return output(input, { verdict: 'partial', reasons, evidenceRefs });
  }
  return output(input, { verdict: 'succeeded', evidenceRefs });
}

function evaluate(input = {}) {
  const state = input.lifecycleState;
  if (state !== 'completed') return terminalOutput(input, state);
  const members = memberVerdict(input, proofIndex(input.evidenceProofs));
  const topology = topologyVerdict(input.topologyValidation);
  const barrier = input.barrierStatus === 'partial'
    ? { verdict: 'partial', reason: 'worker_barrier_partial' } : { verdict: null };
  return finalOutput(input, [members, topology, barrier]);
}

function dispatchAccepted(input = {}) {
  return evaluate({ ...input, lifecycleState: 'accepted' });
}

function processOutcome(input = {}) {
  if (input.interrupted === true) return evaluate({ ...input, lifecycleState: 'interrupted' });
  if (input.exitCode !== 0) return evaluate({ ...input, lifecycleState: 'failed' });
  return evaluate({ ...input, lifecycleState: 'completed' });
}

module.exports = { evaluate, dispatchAccepted, processOutcome, validHash };
