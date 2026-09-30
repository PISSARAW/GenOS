'use strict';

const crypto = require('crypto');
const {
  buildHomeostasisContract, evaluateContract, homeostasisStatus,
  serializeContract, deserializeContract, HOMEOSTASIS_SCHEMA
} = require('./homeostasisContractService');
const { migrateHomeostasisAuthority } = require('../db/migrations/migrateHomeostasisAuthority');
const { newOrganism, expressPhenotype } = require('./missionOrganismService');
const telemetry = require('./telemetryObserver');

const HOMEOSTASIS_EVENT_PREFIX = 'HOMEOSTASIS';
const migratedDatabases = new WeakSet();

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
  if (contract && Array.isArray(contract.invariants) && contract.invariants.length > 0) {
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
  if (contract && Array.isArray(contract.requiredEvidence) && contract.requiredEvidence.length > 0) {
    return contract.requiredEvidence.slice();
  }
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
      ?? 1
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

function contractHash(contract) {
  const content = serializeContract(contract);
  delete content.assembledAt;
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

async function persistContractAuthority(db, mission, proposedContract) {
  if (!migratedDatabases.has(db)) {
    await migrateHomeostasisAuthority(db);
    migratedDatabases.add(db);
  }
  const contract = serializeContract(proposedContract);
  const hash = contractHash(proposedContract);
  let row = await db.get(
    'SELECT revision, contract_hash, contract_json FROM homeostasis_contract_revisions WHERE mission_id = ? AND contract_hash = ?',
    [mission.id, hash]
  );
  if (!row) {
    const latest = await db.get(
      'SELECT MAX(revision) AS revision FROM homeostasis_contract_revisions WHERE mission_id = ?',
      [mission.id]
    );
    const revision = Number(latest?.revision || 0) + 1;
    await db.run(
      `INSERT INTO homeostasis_contract_revisions
       (id, mission_id, revision, contract_hash, contract_json)
       VALUES (?, ?, ?, ?, ?)`,
      [`${mission.id}:${revision}`, mission.id, revision, hash, JSON.stringify(contract)]
    );
    row = { revision, contract_hash: hash, contract_json: JSON.stringify(contract) };
  }
  const authority = deserializeContract(JSON.parse(row.contract_json));
  authority.revision = row.revision;
  authority.contractHash = row.contract_hash;
  return authority;
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
    schema: 'genos.homeostasis-transition-receipt/v1',
    missionId: input.mission.id,
    contractId: input.contract.id,
    contractRevision: input.contract.revision,
    contractHash: input.contract.contractHash,
    policyVersion: input.contract.policyVersion,
    allowed: input.allowed,
    status: input.status,
    state: input.state,
    evidenceReferences: evidenceReferences(input.context),
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
    `SELECT * FROM homeostasis_states WHERE mission_id = ? ORDER BY observed_at DESC LIMIT 1`,
    missionId
  );
}

async function evaluateMissionHomeostasis(db, target) {
  const { organism, mission, context = {} } = target;
  const proposedContract = organism.homeostasis || buildMissionHomeostasis(mission);
  const contract = await persistContractAuthority(db, mission, proposedContract);
  const state = evaluateContract(contract, context);
  const status = homeostasisStatus(state);
  const previous = await lastHomeostasisState(db, mission.id);
  const changed = !previous || previous.status !== status;
  const contractId = contract.id || homeostasisId(mission.id);
  await db.run(
    `INSERT INTO homeostasis_states (id, contract_id, mission_id, status, state_json, observed_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [homeostasisStateId(mission.id), contractId, mission.id, status, JSON.stringify(state)]
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
  return { contract, state, status, changed };
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

async function transitionMissionToComplete(db, target) {
  const { organism, mission, context = {} } = target;
  const evaluation = await evaluateMissionHomeostasis(db, { organism, mission, context });
  const { state, status } = evaluation;
  if (status !== 'homeostasis_satisfied') {
    const receipt = await persistTransitionReceipt(db, {
      mission, context, contract: evaluation.contract, state, status, allowed: false
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
    mission, context, contract: evaluation.contract, state, status, allowed: true
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
