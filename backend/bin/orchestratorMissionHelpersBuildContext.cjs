'use strict';

const { collectMissionEvidence } = require('../src/services/missionEvidenceCollector');

function requestedCompletionContract(policyRequest, request) {
  const contract = policyRequest.completionContract || policyRequest.completion_contract
    || request.completionContract || request.completion_contract;
  return hasEnforceableContractCriteria(contract) ? contract : null;
}

function requestedInvariants(policyRequest, request) {
  const invariants = policyRequest.invariants || request.invariants;
  return Array.isArray(invariants) && invariants.length > 0 ? invariants : null;
}

function hasEnforceableContractCriteria(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return false;
  return Array.isArray(contract.invariants) && contract.invariants.length > 0
    && (contract.requiredEvidence === undefined || Array.isArray(contract.requiredEvidence));
}

function verifiedMissionOutcome(outcome, flags, evidenceAvailable) {
  return evidenceAvailable !== false
    && (outcome.success === true || flags.missionOutcome === true);
}

function makeHomeostasisContext(opts) {
  const { outcome, policyRequest = {}, request = {}, flags, evidence, profiles, dossierCount } = opts;
  const completionContract = requestedCompletionContract(policyRequest, request);
  const invariants = requestedInvariants(policyRequest, request);
  const missionOutcome = verifiedMissionOutcome(outcome, flags, opts.evidenceAvailable);
  flags.missionOutcome = missionOutcome;
  flags.completionContractConfigured = Boolean(completionContract || invariants);
  return {
    completionContract,
    invariants,
    safetyConstraints: policyRequest.safetyConstraints || request.safetyConstraints || null,
    context: {
      missionOutcome,
      flags,
      evidence,
      functionalChecks: outcome.functionalChecks || {},
      structuralChecks: outcome.structuralChecks || {},
      evidenceProfiles: profiles,
      dossierCount,
    }
  };
}

function makeFallbackContext(opts) {
  const { outcome, policyRequest, request } = opts;
  return makeHomeostasisContext({
    outcome,
    policyRequest: policyRequest || {},
    request: request || {},
    flags: { missionOutcome: false },
    evidence: [],
    profiles: [],
    dossierCount: 0,
    evidenceAvailable: false,
  });
}

async function buildMissionContext(opts) {
  const { outcome, db, missionId, agents, policyRequest = {}, request = {} } = opts;
  if (!db || !missionId) {
    return makeFallbackContext({ outcome, policyRequest, request });
  }
  let runtimeEvidence = null;
  try {
    runtimeEvidence = await collectMissionEvidence(db, missionId, agents || []);
  } catch {
    return makeFallbackContext({ outcome, policyRequest, request });
  }
  if (!runtimeEvidence) {
    return makeFallbackContext({ outcome, policyRequest, request });
  }
  return makeHomeostasisContext({
    outcome,
    policyRequest,
    request,
    flags: runtimeEvidence.flags || { missionOutcome: outcome.success === true },
    evidence: runtimeEvidence.evidence || [],
    profiles: runtimeEvidence.profiles || [],
    dossierCount: runtimeEvidence.dossiers?.length || 0,
  });
}

module.exports = { buildMissionContext, verifiedMissionOutcome };
