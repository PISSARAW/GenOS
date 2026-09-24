'use strict';

const crypto = require('crypto');
const {
  buildHomeostasisContract, evaluateContract, homeostasisStatus,
  serializeContract, HOMEOSTASIS_SCHEMA
} = require('./homeostasisContractService');
const { newOrganism, expressPhenotype } = require('./missionOrganismService');
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
    kind: 'functional',
    label: 'mission_outcome_success',
    check: (ctx) => ctx?.missionOutcome === true
  });
  if (goal.includes('auth') || goal.includes('authentifi')) {
    invariants.push({
      kind: 'functional',
      label: 'authentication_works',
      check: (ctx) => ctx?.functionalChecks?.authentication === true
    });
    invariants.push({
      kind: 'functional',
      label: 'invalid_credentials_rejected',
      check: (ctx) => ctx?.functionalChecks?.invalidRejected === true
    });
  }
  if (goal.includes('safe') || goal.includes('debug')) {
    invariants.push({
      kind: 'structural',
      label: 'no_forbidden_files_changed',
      check: (ctx) => {
        const changed = ctx?.structuralChecks?.forbiddenFilesChanged || [];
        return changed.length === 0;
      }
    });
  }
  if (goal.includes('test') || goal.includes('valid')) {
    invariants.push({
      kind: 'structural',
      label: 'tests_pass',
      check: (ctx) => ctx?.structuralChecks?.testsPassed === true
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
    return contract.invariants.map((invariant) => ({
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

function lastHomeostasisState(db, missionId) {
  return db.get(
    `SELECT * FROM homeostasis_states WHERE mission_id = ? ORDER BY observed_at DESC LIMIT 1`,
    missionId
  );
}

async function evaluateMissionHomeostasis(db, target) {
  const { organism, mission, context = {} } = target;
  const contract = organism.homeostasis || buildMissionHomeostasis(mission);
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
    return {
      allowed: false,
      reason: status === 'evidence_missing'
        ? `Required evidence missing: ${(state.evidence.missing || []).join(', ')}`
        : 'Mission homeostasis not satisfied',
      status,
      state
    };
  }
  return { allowed: true, state };
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
