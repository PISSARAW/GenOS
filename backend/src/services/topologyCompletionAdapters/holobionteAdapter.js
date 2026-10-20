'use strict';

const { baseDossier } = require('./dossier');
const stateReader = require('./holobionteStateReader');
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
    holobiontId: state.session?.holobiontId || null }], oracle: null };
}

function constitutionAssessment(state) {
  const { session } = state;
  if (!session.constitution || !session.constitutionId) {
    return assessment('partial', 'holobionte_constitution_missing');
  }
  const valid = session.constitution.constitutionId === session.constitutionId
    && session.constitution.hostId === session.hostId
    && session.constitution.authorityCeiling === 'HOST';
  return valid ? assessment('verified')
    : assessment('failed', 'holobionte_constitution_invariant_failed');
}

function terminalAssessment(state) {
  const closed = state.lifecycle.find((entry) => entry.eventType === 'CLOSED');
  if (!closed || state.session.status !== 'CLOSED') {
    return assessment('partial', 'holobionte_terminal_phase_missing');
  }
  const valid = Number(closed.revision) === Number(state.session.revision)
    && closed.payload.missionId === state.session.missionId;
  return valid ? assessment('verified')
    : assessment('failed', 'holobionte_terminal_phase_inconsistent');
}

function validAdmission(context) {
  const { resident, hostId } = context;
  const receipt = resident.admissionReceipt;
  return resident.status === 'RESIDENT' && receipt?.contractCompliant === true
    && receipt.contractId === resident.contractId
    && Number(receipt.contractRevision) === Number(resident.contractRevision)
    && receipt.immuneReview?.allowed === true && receipt.immuneReview?.blocked === false
    && receipt.verifierId && ![resident.id, hostId].includes(receipt.verifierId);
}

function residentAssessment(state) {
  const residents = state.session.residentSymbionts || [];
  if (!residents.length) return assessment('partial', 'holobionte_resident_missing');
  const admitted = residents.every((resident) => validAdmission({ resident,
    hostId: state.session.hostId }));
  return admitted ? assessment('verified')
    : assessment('failed', 'holobionte_resident_admission_invalid');
}

function contractFor(state, entry) {
  return state.contracts.find((contract) => contract.contractId === entry.contractId
    && Number(contract.revision) === entry.contractRevision);
}

function eventFor(state, type, entry) {
  return state.events.find((event) => event.eventType === type
    && event.payload.receiptId === entry.receiptId);
}

function executionMemory(state, entry) {
  return state.memories.find((memory) => memory.status === 'ACTIVE'
    && memory.memoryType === 'EPISODIC' && memory.missionId === state.session.missionId
    && memory.content?.type === 'VERIFIED_SYMBIOTIC_EXECUTION'
    && memory.content?.symbiontId === entry.symbiontId
    && memory.content?.capability === entry.capability
    && memory.content?.resultHash === entry.resultHash);
}

function validContract(contract, entry) {
  return contract.symbiontId === entry.symbiontId
    && contract.contract?.capabilitiesOffered?.includes(entry.capability);
}

function usedMatches(context) {
  const { state, entry, used } = context;
  return used.payload.missionId === state.session.missionId
    && used.payload.symbiontId === entry.symbiontId
    && used.payload.capability === entry.capability
    && used.payload.resultHash === entry.resultHash
    && used.payload.receiptId === entry.receiptId
    && digest(used.payload.evidenceRefs) === digest(entry.evidenceRefs);
}

function promotedMatches(entry, promoted) {
  const payload = promoted.payload;
  return payload.ledgerId === entry.ledgerId && payload.receiptId === entry.receiptId
    && payload.contractId === entry.contractId
    && Number(payload.contractRevision) === entry.contractRevision
    && payload.symbiontId === entry.symbiontId && payload.capability === entry.capability
    && payload.verifierId === entry.verifierId && payload.resultHash === entry.resultHash
    && digest(payload.evidenceRefs) === digest(entry.evidenceRefs)
    && digest(payload.immuneReview) === digest(entry.immuneReview);
}

function correlatedExecution(context) {
  return usedMatches(context) && promotedMatches(context.entry, context.promoted);
}

function memoryMatches(memory, entry) {
  return memory.authorId === entry.verifierId
    && memory.immuneReview?.allowed === true
    && digest(memory.evidenceRefs) === digest(entry.evidenceRefs);
}

function contributionAssessment(state, entry) {
  const contract = contractFor(state, entry);
  if (!contract) return assessment('partial', 'holobionte_execution_contract_missing');
  if (!validContract(contract, entry)) {
    return assessment('failed', 'holobionte_execution_contract_mismatch');
  }
  const promoted = eventFor(state, 'CONTRIBUTION_VERIFIED', entry);
  const used = eventFor(state, 'CAPABILITY_USED', entry);
  if (!promoted || !used) return assessment('partial', 'holobionte_promotion_receipt_missing');
  if (!correlatedExecution({ state, entry, used, promoted })) {
    return assessment('failed', 'holobionte_mission_run_scope_mismatch');
  }
  const memory = executionMemory(state, entry);
  if (!memory) return assessment('partial', 'holobionte_execution_memory_missing');
  return memoryMatches(memory, entry) ? assessment('verified')
    : assessment('failed', 'holobionte_execution_memory_mismatch');
}

function oracleIdentity(entry, hostId) {
  if (!entry.evidenceRefs.length || !entry.verifierId || !entry.resultHash) {
    return assessment('partial', 'holobionte_independent_oracle_missing');
  }
  return [entry.symbiontId, hostId].includes(entry.verifierId)
    ? assessment('failed', 'holobionte_oracle_not_independent') : null;
}

function oracleFieldsPresent(immune, host) {
  return typeof immune?.allowed === 'boolean' && typeof immune?.blocked === 'boolean'
    && typeof host?.allowed === 'boolean' && typeof host?.overridden === 'boolean'
    && typeof host?.immuneReview?.allowed === 'boolean'
    && typeof host?.immuneReview?.blocked === 'boolean';
}

function oracleAccepted(immune, host) {
  return immune.allowed === true && immune.blocked === false
    && host.allowed === true && host.immuneReview.allowed === true
    && host.immuneReview.blocked === false && host.overridden !== true;
}

function oracleAssessment(state, entry) {
  const identity = oracleIdentity(entry, state.session.hostId);
  if (identity) return identity;
  const used = eventFor(state, 'CAPABILITY_USED', entry);
  const immune = entry.immuneReview;
  const host = used?.payload?.hostDecision;
  if (!oracleFieldsPresent(immune, host)) {
    return assessment('partial', 'holobionte_independent_oracle_missing');
  }
  return oracleAccepted(immune, host) ? assessment('verified')
    : assessment('failed', 'holobionte_independent_oracle_rejected');
}

function runtimeAssessment(state) {
  if (!state.ledger.length) return assessment('partial', 'holobionte_verified_contribution_missing');
  for (const entry of state.ledger) {
    const contribution = contributionAssessment(state, entry);
    if (contribution.status !== 'verified') return contribution;
    const oracle = oracleAssessment(state, entry);
    if (oracle.status !== 'verified') return oracle;
  }
  return assessment('verified');
}

function records(base, state) {
  const grouped = new Map();
  for (const entry of state.ledger) {
    const existing = grouped.get(entry.symbiontId) || [];
    existing.push({ receiptId: entry.receiptId, ledgerId: entry.ledgerId,
      resultHash: entry.resultHash, verifierId: entry.verifierId,
      evidenceRefs: entry.evidenceRefs });
    grouped.set(entry.symbiontId, existing);
  }
  return [...grouped].map(([workerId, runs]) => {
    const content = { schema: 'genos.holobionte-canonical-closure-proof/v1',
      missionId: base.missionId, holobiontId: state.session.holobiontId,
      workerId, result: { status: 'completed', verified: true }, runs };
    const proof = { reference: digest(content), content, source: 'holobionte_canonical_runtime' };
    return { member: { memberId: workerId, status: 'completed', evidenceRefs: [proof.reference] }, proof };
  });
}

function oracle(base, state, closureRecords) {
  const receipt = { schema: 'genos.holobionte-completion-oracle/v1',
    missionId: base.missionId, holobiontId: state.session.holobiontId,
    revision: state.session.revision, canonicalStateHash: digest(state.session),
    eventJournalHash: digest([...state.events, ...state.lifecycle]),
    ledgerHash: digest(state.ledger),
    executionReceipts: state.ledger.map((entry) => entry.receiptId) };
  return { status: 'verified', independent: true,
    verifierIds: [...new Set(state.ledger.map((entry) => entry.verifierId))],
    evidenceRefs: closureRecords.map((record) => record.proof.reference),
    receipt, receiptHash: digest(receipt) };
}

function verifiedDossier(base, state) {
  const closureRecords = records(base, state);
  return { ...base, lifecycleState: 'completed', producerId: base.missionId,
    roster: { requiredMemberIds: closureRecords.map((record) => record.member.memberId),
      members: closureRecords.map((record) => record.member),
      evidenceProofs: closureRecords.map((record) => record.proof) },
    topologyValidation: { status: 'verified', reasons: [] }, barrierStatus: 'complete',
    invariants: [
      { id: 'holobionte_mission_session_scope', passed: true,
        holobiontId: state.session.holobiontId },
      { id: 'holobionte_host_constitution_authority', passed: true },
      { id: 'holobionte_resident_contract_coordination', passed: true },
      { id: 'holobionte_verified_contribution_promotion', passed: true },
      { id: 'holobionte_independent_immune_oracle', passed: true },
      { id: 'holobionte_terminal_lifecycle', passed: true,
        revision: state.session.revision }
    ], oracle: oracle(base, state, closureRecords) };
}

async function build(input = {}) {
  const base = baseDossier(input);
  const state = await stateReader.read({ db: input.context?.db,
    missionId: base.missionId, context: input.context });
  if (state.status === 'failed') return failed(base, state.reason, state);
  if (state.status !== 'read') return incomplete(base, state.reason);
  for (const check of [constitutionAssessment(state), residentAssessment(state),
    terminalAssessment(state), runtimeAssessment(state)]) {
    if (check.status === 'failed') return failed(base, check.reason, state);
    if (check.status !== 'verified') return incomplete(base, check.reason);
  }
  return verifiedDossier(base, state);
}

module.exports = Object.freeze({ id: 'holobionte-completion-v1', topology: 'holobionte',
  specialized: true, build });
