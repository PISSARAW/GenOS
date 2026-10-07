'use strict';

const crypto = require('crypto');
const {
  buildHomeostasisContract, evaluateContract, homeostasisStatus,
  HOMEOSTASIS_SCHEMA
} = require('./homeostasisContractService');
const authority = require('./homeostasisAuthorityStore');
const executionEvidence = require('./homeostasisExecutionEvidence');
const { withTransaction } = require('../db');
const telemetry = require('./telemetryObserver');

const HOMEOSTASIS_EVENT_PREFIX = 'HOMEOSTASIS';

function homeostasisId(missionId) {
  return `homeostasis_${missionId || crypto.randomUUID()}`;
}

function homeostasisStateId(missionId) {
  return `homeostasis_state_${missionId || 'unknown'}_${crypto.randomUUID()}`;
}

function buildDefaultFunctionalInvariants(mission) {
  const invariants = [];
  const goal = (mission?.objective || '').toLowerCase();
  invariants.push({
    id: 'mission_outcome_success',
    kind: 'functional',
    label: 'mission_outcome_success',
    verifier: { type: 'mission.outcome_success' }
  });
  if (goal.includes('auth') || goal.includes('authentifi')) {
    invariants.push({
      id: 'authentication_works',
      kind: 'functional',
      label: 'authentication_works',
      verifier: { type: 'mission.functional_check', name: 'authentication' }
    });
    invariants.push({
      id: 'invalid_credentials_rejected',
      kind: 'functional',
      label: 'invalid_credentials_rejected',
      verifier: { type: 'mission.functional_check', name: 'invalidRejected' }
    });
  }
  if (goal.includes('safe') || goal.includes('debug')) {
    invariants.push({
      id: 'no_forbidden_files_changed',
      kind: 'structural',
      label: 'no_forbidden_files_changed',
      verifier: { type: 'context.list_empty', path: 'structuralChecks.forbiddenFilesChanged' }
    });
  }
  if (goal.includes('test') || goal.includes('valid')) {
    invariants.push({
      id: 'tests_pass',
      kind: 'structural',
      label: 'tests_pass',
      verifier: { type: 'context.path_equals', path: 'structuralChecks.testsPassed', expected: true }
    });
  }
  return invariants;
}

function defaultEvidenceRequirements(mission) {
  const required = [];
  const goal = (mission?.objective || '').toLowerCase();
  if (goal.includes('proof') || goal.includes('preuve') || goal.includes('evidence')) {
    required.push('evidence_report');
  }
  if (goal.includes('test')) {
    required.push('test_suite_passed');
  }
  return required;
}

function contractInvariants(mission) {
  // The genome completion contract is the source of authority. The prompt
  // heuristics below are a development fallback only, never the contract.
  const contract = mission.completionContract;
  if (contract) {
    if (!Array.isArray(contract.invariants)) throw new Error('Completion contract requires an invariants array');
    return contract.invariants.map((invariant, index) => ({
      id: invariant.id || invariant.label || `completion_invariant_${index + 1}`,
      kind: invariant.kind,
      label: invariant.label || invariant.id,
      verifier: invariant.verifier,
      check: typeof invariant.check === 'function' ? invariant.check : undefined
    }));
  }
  return buildDefaultFunctionalInvariants(mission);
}

function contractEvidence(mission) {
  const contract = mission.completionContract;
  if (contract) return (contract.requiredEvidence || []).slice();
  return defaultEvidenceRequirements(mission);
}

function buildMissionHomeostasis(mission) {
  const invariants = contractInvariants(mission);
  const contract = buildHomeostasisContract({
    id: homeostasisId(mission.id),
    missionId: mission.id,
    invariants,
    requiredEvidence: contractEvidence(mission),
    minimumFunctionalCoverage: mission.homeostasisMinFunctionalCoverage
      ?? mission.completionContract?.minimumFunctionalCoverage
      ?? 1,
    policyVersion: mission.completionContract?.policyVersion,
    classCoverage: mission.completionContract?.classCoverage
  });
  return contract;
}

function attachHomeostasisToOrganism(organism, mission) {
  const homeostasis = buildMissionHomeostasis(mission);
  return {
    ...organism,
    homeostasis
  };
}

function evidenceReferences(context) {
  if (Array.isArray(context.evidence)) return context.evidence;
  if (context.evidence instanceof Set) return [...context.evidence];
  if (context.evidence && typeof context.evidence === 'object') {
    return Object.keys(context.evidence).filter((key) => context.evidence[key] === true);
  }
  return [];
}

async function persistTransitionReceipt(db, input) {
  const receipt = {
    schema: 'genos.homeostasis-transition-receipt/v2',
    missionId: input.mission.id,
    contractId: input.contract.id,
    contractRevision: input.contract.revision,
    contractHash: input.contract.contractHash,
    policyVersion: input.contract.policyVersion,
    thresholds: input.contract.classCoverage,
    stateId: input.stateId,
    from: input.previousStatus,
    to: input.status,
    allowed: input.allowed,
    status: input.status,
    state: input.state,
    evidenceReferences: evidenceReferences(input.context),
    executionReceipts: input.state.executionEvidence.references,
    executionEpoch: input.state.executionEvidence.epoch,
    createdAt: new Date().toISOString()
  };
  const serialized = JSON.stringify(receipt);
  const receiptHash = crypto.createHash('sha256').update(serialized).digest('hex');
  await db.run(
    `INSERT INTO homeostasis_transition_receipts
     (id, mission_id, contract_id, contract_revision, contract_hash, allowed, status, receipt_hash, receipt_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [`homeostasis_transition_${crypto.randomUUID()}`, receipt.missionId, receipt.contractId,
      receipt.contractRevision, receipt.contractHash, Number(receipt.allowed), receipt.status,
      receiptHash, serialized]
  );
  return { ...receipt, receiptHash };
}

function lastHomeostasisState(db, missionId) {
  return db.get(
    `SELECT * FROM homeostasis_states WHERE mission_id = ? ORDER BY observed_at DESC, rowid DESC LIMIT 1`,
    missionId
  );
}

async function evaluateMissionHomeostasis(db, target) {
  return withTransaction(db, () => evaluateDurableHomeostasis(db, target));
}

async function evaluateDurableHomeostasis(db, target) {
  const { organism, context = {} } = target;
  const mission = await executionEvidence.missionScope(db, target.mission);
  const inherited = await inheritedAuthority(db, mission);
  if (inherited) await authority.resolve(db, { missionId: mission.id, proposed: () => inherited });
  const contract = await authority.resolve(db, {
    missionId: mission.id,
    explicit: Boolean(mission.completionContract),
    expectedRevision: mission.expectedHomeostasisRevision,
    proposed: () => evaluateDurableHomeostasisCondition(mission, inherited, organism)
  });
  const execution = await executionEvidence.collect(db, mission.id);
  const evaluatedContext = executionEvidence.contextWithEvidence(context, execution);
  const state = executionEvidence.bindState(evaluateContract(contract, evaluatedContext), execution);
  const status = homeostasisStatus(state);
  const previous = await lastHomeostasisState(db, mission.id);
  const changed = !previous || previous.status !== status;
  const contractId = contract.id || homeostasisId(mission.id);
  const stateId = homeostasisStateId(mission.id);
  await db.run(
    `INSERT INTO homeostasis_states (id, contract_id, mission_id, status, state_json, observed_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [stateId, contractId, mission.id, status, JSON.stringify(state)]
  );
  await require('./biologicalExecutionReceiptService').attachOrphanedReceiptsToHomeostasis(
    db, mission.id, { id: stateId, status }
  );
  if (changed) {
    telemetry.emitEvent({
      eventType: `${HOMEOSTASIS_EVENT_PREFIX}_STATE_CHANGED`,
      agentId: mission.id,
      action: 'evaluate',
      detail: 'Homeostasis status changed',
      payload: { missionId: mission.id, from: previous?.status || 'unknown', to: status, state },
      sessionId: mission.id,
      severity: status === 'homeostasis_satisfied' ? 'info' : 'warning',
      status
    });
  }
  return { contract, state, status, changed, stateId, mission, previousStatus: previous?.status || 'unknown' };
}


async function reconcileHomeostasis(db, target) {
  const { organism, mission, context = {} } = target;
  const { state, status, changed } = await evaluateMissionHomeostasis(db, target);
  if (status === 'homeostasis_satisfied' && changed) {
    await telemetry.emitEvent({
      eventType: 'MISSION_HOMEOSTASIS_ACHIEVED',
      agentId: mission.id,
      action: 'homeostasis_achieved',
      detail: 'All invariants satisfied',
      payload: { missionId: mission.id, state },
      sessionId: mission.id,
      severity: 'info'
    });
  }
  return { organism, state, status, changed };
}

async function inheritedAuthority(db, mission) {
  if (!mission.legacyAuthorityMissionId || await authority.active(db, mission.id)) return null;
  const legacy = await authority.active(db, mission.legacyAuthorityMissionId);
  if (!legacy) return null;
  return { ...legacy, id: homeostasisId(mission.id), missionId: mission.id,
    originAuthority: { missionId: mission.legacyAuthorityMissionId, revision: legacy.revision, contractHash: legacy.contractHash } };
}

function scopedOrganismContract(organism, mission) {
  if (!organism?.homeostasis) return null;
  return { ...organism.homeostasis, missionId: mission.id, id: homeostasisId(mission.id) };
}

async function transitionMissionToComplete(db, target) {
  return withTransaction(db, () => persistCompletionAttempt(db, target));
}

async function persistCompletionAttempt(db, target) {
  const { context = {} } = target;
  const evaluation = await evaluateMissionHomeostasis(db, target);
  const { mission } = evaluation;
  const { state, status } = evaluation;
  if (status !== 'homeostasis_satisfied') {
    const receipt = await persistTransitionReceipt(db, {
      ...evaluation, mission, context, allowed: false
    });
    return {
      allowed: false,
      reason: status === 'evidence_missing'
        ? `Required evidence missing: ${(state.evidence.missing || []).join(', ')}`
        : 'Mission homeostasis not satisfied',
      status,
      state,
      receipt
    };
  }
  const receipt = await persistTransitionReceipt(db, {
    ...evaluation, mission, context, allowed: true
  });
  return { allowed: true, state, receipt };
}

module.exports = {
  homeostasisId,
  buildMissionHomeostasis,
  buildDefaultFunctionalInvariants,
  defaultEvidenceRequirements,
  attachHomeostasisToOrganism,
  evaluateMissionHomeostasis,
  reconcileHomeostasis,
  transitionMissionToComplete,
  HOMEOSTASIS_SCHEMA
};

function evaluateDurableHomeostasisCondition(mission, inherited, organism) {
  return mission.completionContract ? buildMissionHomeostasis(mission)
      : inherited || scopedOrganismContract(organism, mission) || buildMissionHomeostasis(mission);
}
