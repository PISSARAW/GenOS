'use strict';

const { baseDossier } = require('./dossier');
const stateReader = require('./metapopulationStateReader');
const { digest } = require('../evidenceContractService');

function assessment(status, reason) {
  return { status, ...(reason ? { reason } : {}) };
}

function incomplete(base, reason) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'partial', reasons: [reason] }, invariants: [], oracle: null };
}

function failed(base, reason, state = {}) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'failed', reasons: [reason] }, invariants: [{ id: reason, passed: false,
    sessionId: state.sessionId || null }], oracle: null };
}

function memberIdentity(value) {
  return typeof value === 'string' ? value
    : value?.memberId || value?.workerId || value?.agentId || null;
}

function lifecycleAssessment(state) {
  const status = state.session.status;
  if (['CLOSED', 'QUIESCENT'].includes(status)) return assessment('verified');
  return assessment('partial', 'metapopulation_terminal_phase_missing');
}

function demeAssessment(base, state) {
  if (state.demes.length < 2) return assessment('partial', 'metapopulation_demes_missing');
  const patches = state.demes.map((deme) => deme.patch_id);
  if (new Set(patches).size !== patches.length) {
    return assessment('failed', 'metapopulation_deme_patch_overlap');
  }
  const assignments = state.demes.flatMap((deme) =>
    deme.members_json.map((member) => memberIdentity(member)).filter(Boolean));
  if (!assignments.length || state.demes.some((deme) => !deme.members_json.length)) {
    return assessment('partial', 'metapopulation_deme_members_missing');
  }
  const required = base.roster.requiredMemberIds;
  if (required.some((id) => !assignments.includes(id))) {
    return assessment('partial', 'metapopulation_member_assignment_missing');
  }
  const unknown = assignments.some((id) => !required.includes(id));
  const duplicate = new Set(assignments).size !== assignments.length;
  return unknown || duplicate
    ? assessment('failed', 'metapopulation_member_assignment_inconsistent')
    : assessment('verified');
}

function migrationEvidenceValid(migration) {
  const evidence = migration.evidence_json;
  const validation = evidence.receiverValidation;
  if (!validation || typeof validation !== 'object') return null;
  if (migration.status === 'ACCEPTED') return validation.valid === true;
  if (migration.status === 'REJECTED') {
    return validation.valid === false || Boolean(evidence.rejectionReason);
  }
  return migration.status === 'ROLLED_BACK' && Boolean(evidence.rescueRollback);
}

function migrationAssessment(state) {
  if (!state.migrations.length) return assessment('partial', 'metapopulation_migration_missing');
  const resolved = state.migrations.filter((item) => item.status !== 'QUARANTINED');
  if (!resolved.length) return assessment('partial', 'metapopulation_migration_unresolved');
  const demeIds = new Set(state.demes.map((deme) => deme.deme_id));
  const invalidScope = resolved.some((item) => item.source_deme_id === item.target_deme_id
    || !demeIds.has(item.source_deme_id) || !demeIds.has(item.target_deme_id));
  if (invalidScope) return assessment('failed', 'metapopulation_migration_scope_mismatch');
  const evidence = resolved.map(migrationEvidenceValid);
  if (evidence.some((valid) => valid === null)) {
    return assessment('partial', 'metapopulation_migration_evidence_missing');
  }
  return evidence.every(Boolean) ? assessment('verified')
    : assessment('failed', 'metapopulation_migration_evidence_inconsistent');
}

function fitnessAssessment(base, state) {
  if (!state.fitness.length) return assessment('partial', 'metapopulation_fitness_missing');
  const latestCycle = Math.max(...state.fitness.map((item) => Number(item.cycle)));
  const latest = state.fitness.filter((item) => Number(item.cycle) === latestCycle);
  if (new Set(latest.map((item) => item.deme_id)).size < 2) {
    return assessment('partial', 'metapopulation_comparative_fitness_missing');
  }
  const demeIds = new Set(state.demes.map((deme) => deme.deme_id));
  const invalid = latest.some((item) => item.mission_id !== base.missionId
    || !demeIds.has(item.deme_id) || !Number.isFinite(Number(item.fitness_score))
    || Number(item.fitness_score) < 0 || Number(item.fitness_score) > 1);
  return invalid ? assessment('failed', 'metapopulation_fitness_inconsistent')
    : assessment('verified');
}

function cycleEvent(state, cycle) {
  return state.events.findLast((event) => event.event_type === 'REGIONAL_CYCLE_RECORDED'
    && Number(event.payload_json?.cycle) === Number(cycle));
}

function cycleStateAssessment(latest) {
  if (latest.status === 'FAILED') return assessment('failed', 'metapopulation_cycle_failed');
  if (latest.status !== 'VERIFIED') return assessment('partial', 'metapopulation_verified_cycle_missing');
  if (!Array.isArray(latest.plan_json?.actions) || latest.execution_json?.completed === undefined) {
    return assessment('partial', 'metapopulation_cycle_phase_missing');
  }
  if (latest.execution_json.completed !== true) {
    return assessment('failed', 'metapopulation_cycle_execution_inconsistent');
  }
  return assessment('verified');
}

function cycleOracleAssessment(latest) {
  if (latest.verification_json?.valid === undefined) {
    return assessment('partial', 'metapopulation_cycle_oracle_missing');
  }
  if (latest.verification_json.valid !== true) {
    return assessment('failed', 'metapopulation_cycle_oracle_inconsistent');
  }
  return assessment('verified');
}

function cycleAssessment(state) {
  if (!state.cycles.length) return assessment('partial', 'metapopulation_verified_cycle_missing');
  const latest = state.cycles.at(-1);
  const stateCheck = cycleStateAssessment(latest);
  if (stateCheck.status !== 'verified') return stateCheck;
  const oracleCheck = cycleOracleAssessment(latest);
  if (oracleCheck.status !== 'verified') return oracleCheck;
  const event = cycleEvent(state, latest.cycle);
  if (!event) return assessment('partial', 'metapopulation_cycle_receipt_missing');
  const consistent = event.payload_json.status === 'VERIFIED'
    && event.payload_json.verification === 'VALID';
  return consistent ? assessment('verified')
    : assessment('failed', 'metapopulation_cycle_receipt_inconsistent');
}

function proofReferenceAssessment(input) {
  const proof = input.index.get(input.reference);
  const content = proof?.content;
  if (!content) return assessment('partial', 'metapopulation_worker_run_proof_missing');
  const identity = { workerId: content.workerId || content.memberId
      || content.correlation?.agentId,
    missionId: content.missionId || content.correlation?.missionId,
    runId: content.runId || content.executionRunId || content.correlation?.runId };
  const valid = [proof.source === 'biological_worker_receipts',
    digest(content) === input.reference,
    identity.workerId === input.memberId, identity.missionId === input.missionId,
    Boolean(identity.runId)].every(Boolean);
  return valid ? assessment('verified')
    : assessment('failed', 'metapopulation_worker_run_proof_invalid');
}

function memberProofAssessment(base, index, member) {
  if (!Array.isArray(member.evidenceRefs) || !member.evidenceRefs.length) {
    return assessment('partial', 'metapopulation_worker_run_proof_missing');
  }
  for (const reference of member.evidenceRefs) {
    const checked = proofReferenceAssessment({ index, reference,
      memberId: member.memberId, missionId: base.missionId });
    if (checked.status !== 'verified') return checked;
  }
  return assessment('verified');
}

function proofAssessment(base) {
  const index = new Map(base.roster.evidenceProofs.map((proof) => [proof.reference, proof]));
  for (const member of base.roster.members) {
    const checked = memberProofAssessment(base, index, member);
    if (checked.status !== 'verified') return checked;
  }
  return assessment('verified');
}

function oracleIdentityAssessment(base, state) {
  const latest = state.cycles.at(-1);
  if (!latest) return assessment('partial', 'metapopulation_verified_cycle_missing');
  const event = cycleEvent(state, latest.cycle);
  const verifier = latest.verification_json.verifier || event?.actor;
  if (!verifier) return assessment('partial', 'metapopulation_cycle_oracle_identity_missing');
  return verifier === base.missionId
    ? assessment('partial', 'metapopulation_cycle_oracle_not_independent')
    : assessment('verified');
}

function oracleReceipt(base, state) {
  const latest = state.cycles.at(-1);
  const event = cycleEvent(state, latest.cycle);
  const verifierId = latest.verification_json.verifier || event.actor;
  return { schema: 'genos.metapopulation-completion-oracle/v1',
    missionId: base.missionId, metapopulationId: state.sessionId,
    revision: state.revision, cycle: latest.cycle, verifierId,
    canonicalStateHash: digest({ session: state.session, demes: state.demes,
      migrations: state.migrations, fitness: state.fitness }),
    regionalJournalHash: digest(state.events), cycleStateHash: digest(latest) };
}

function verifiedDossier(base, state) {
  const refs = [...new Set(base.roster.members.flatMap((member) => member.evidenceRefs || []))];
  const receipt = oracleReceipt(base, state);
  return { ...base, lifecycleState: 'completed', producerId: base.missionId,
    topologyValidation: { status: 'verified', reasons: [] }, barrierStatus: 'complete',
    invariants: [
      { id: 'metapopulation_mission_run_scope', passed: true, sessionId: state.sessionId },
      { id: 'metapopulation_independent_demes', passed: true },
      { id: 'metapopulation_resolved_migration', passed: true },
      { id: 'metapopulation_comparative_fitness', passed: true },
      { id: 'metapopulation_verified_regional_cycle', passed: true,
        cycle: state.cycles.at(-1).cycle }
    ],
    oracle: { status: 'verified', independent: true,
      verifierIds: [receipt.verifierId], evidenceRefs: refs,
      receipt, receiptHash: digest(receipt) } };
}

async function build(input = {}) {
  const base = baseDossier(input);
  const state = await stateReader.read({ db: input.context?.db,
    missionId: base.missionId, context: input.context });
  if (state.status === 'failed') return failed(base, state.reason, state);
  if (state.status !== 'read') return incomplete(base, state.reason);
  const checks = [lifecycleAssessment(state), demeAssessment(base, state),
    migrationAssessment(state), fitnessAssessment(base, state),
    cycleAssessment(state), oracleIdentityAssessment(base, state), proofAssessment(base)];
  const issue = checks.find((check) => check.status !== 'verified');
  if (issue?.status === 'failed') return failed(base, issue.reason, state);
  if (issue) return incomplete(base, issue.reason);
  return verifiedDossier(base, state);
}

module.exports = Object.freeze({ id: 'metapopulation-completion-v1',
  topology: 'metapopulation', specialized: true, build });
