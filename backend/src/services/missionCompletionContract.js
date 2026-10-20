'use strict';

const HASH = /^sha256:[a-f0-9]{64}$/i;
const TERMINAL = new Set(['completed', 'failed', 'interrupted']);

function validHash(value) { return typeof value === 'string' && HASH.test(value); }

function output(input, verdict, reasons) {
  const members = Array.isArray(input.members) ? input.members : [];
  const evidenceRefs = [...new Set((input.evidenceRefs || []).filter(validHash))];
  return { schema: 'genos.mission-completion/v1', missionId: input.missionId || null,
    topology: input.topology || null, lifecycleState: input.lifecycleState,
    verdict, terminal: TERMINAL.has(input.lifecycleState), success: verdict === 'succeeded',
    requiredMemberIds: input.requiredMemberIds || [],
    completedMemberIds: members.filter((item) => item.status === 'completed').map((item) => item.memberId),
    evidenceRefs, reasons, promotionEligible: false };
}

function unique(values) {
  return Array.isArray(values) && values.every((item) => typeof item === 'string' && item.trim())
    && new Set(values).size === values.length;
}

function memberVerdict(input) {
  const required = input.requiredMemberIds || [];
  const members = Array.isArray(input.members) ? input.members : [];
  const byId = new Map(members.map((item) => [item.memberId, item]));
  if (!unique(required) || byId.size !== members.length) return { verdict: 'partial', reason: 'member_identity_invalid' };
  if (required.some((id) => !byId.has(id))) return { verdict: 'partial', reason: 'required_member_missing' };
  if (required.some((id) => byId.get(id).status === 'failed')) return { verdict: 'failed', reason: 'required_member_failed' };
  if (required.some((id) => byId.get(id).status !== 'completed'
      || !Array.isArray(byId.get(id).evidenceRefs) || !byId.get(id).evidenceRefs.some(validHash))) {
    return { verdict: 'partial', reason: 'required_member_not_verified' };
  }
  return null;
}

function invariantVerdict(invariants) {
  if (!Array.isArray(invariants) || !invariants.length
      || invariants.some((item) => !item?.id || typeof item.passed !== 'boolean')) {
    return { verdict: 'partial', reason: 'completion_invariants_missing' };
  }
  if (invariants.some((item) => !item.passed)) return { verdict: 'failed', reason: 'completion_invariant_failed' };
  return null;
}

function validOracleHashes(oracle) {
  return validHash(oracle.receiptHash) && Array.isArray(oracle.evidenceRefs)
    && oracle.evidenceRefs.length > 0 && oracle.evidenceRefs.every(validHash);
}

function validOracleVerifiers(oracle, producerId) {
  const verifiers = oracle.verifierIds;
  return Array.isArray(verifiers) && verifiers.length >= 2
    && verifiers.every((id) => typeof id === 'string' && id.trim() && id !== producerId)
    && new Set(verifiers).size >= 2;
}

function validOracle(oracle, producerId) {
  return oracle?.status === 'verified' && oracle.independent === true
    && validOracleHashes(oracle) && validOracleVerifiers(oracle, producerId);
}

function terminalOutput(input, state) {
  if (state === 'accepted' || state === 'running') return output(input, 'in_progress', ['execution_not_terminal']);
  if (state === 'interrupted') return output(input, 'interrupted', [input.reason || 'execution_interrupted']);
  if (state === 'failed') return output(input, 'failed', [input.reason || 'execution_failed']);
  return output(input, 'partial', ['execution_state_unknown']);
}

function failedOrPartial(input, reasons) {
  if (reasons.some((reason) => reason === 'required_member_failed'
      || reason === 'completion_invariant_failed')) {
    return output(input, 'failed', reasons);
  }
  if (reasons.length) return output(input, 'partial', reasons);
  return output(input, 'succeeded', []);
}

function evaluate(input = {}) {
  const state = input.lifecycleState;
  if (state !== 'completed') return terminalOutput(input, state);
  const reasons = [];
  if (input.barrierStatus === 'partial') reasons.push('worker_barrier_partial');
  const member = memberVerdict(input);
  const invariant = invariantVerdict(input.invariants);
  if (member) reasons.push(member.reason);
  if (invariant) reasons.push(invariant.reason);
  if (!validOracle(input.oracle, input.producerId)) reasons.push('independent_oracle_missing');
  return failedOrPartial(input, reasons, member, invariant);
}

function dispatchAccepted(input = {}) {
  return evaluate({ ...input, lifecycleState: 'accepted' });
}

function processOutcome(input = {}) {
  if (input.interrupted === true) return evaluate({ ...input, lifecycleState: 'interrupted' });
  if (input.exitCode !== 0) return evaluate({ ...input, lifecycleState: 'failed' });
  return evaluate({ ...input, lifecycleState: 'completed' });
}

module.exports = { evaluate, dispatchAccepted, processOutcome, validOracle, validHash };
