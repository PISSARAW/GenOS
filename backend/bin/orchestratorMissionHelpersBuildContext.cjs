'use strict';

const { collectMissionEvidence } = require('../src/services/missionEvidenceCollector');

function requestedSuccessCriteria(policyRequest, request) {
  return policyRequest.successCriteria || request.successCriteria
    || policyRequest.success_criteria || request.success_criteria;
}

function verifiedMissionOutcome(outcome, flags, evidenceAvailable) {
  return evidenceAvailable !== false
    && (outcome.success === true || flags.missionOutcome === true);
}

function makeHomeostasisContext(opts) {
  const { outcome, policyRequest = {}, request = {}, flags, evidence, profiles, dossierCount } = opts;
  const completionContract = policyRequest.completionContract || request.completionContract || null;
  const invariants = policyRequest.invariants || request.invariants || null;
  const successCriteria = requestedSuccessCriteria(policyRequest, request);
  const missionOutcome = verifiedMissionOutcome(outcome, flags, opts.evidenceAvailable);
  flags.missionOutcome = missionOutcome;
  flags.completionContractConfigured = hasCompletionCriteria(completionContract, invariants, successCriteria);
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

function hasCompletionCriteria(contract, invariants, successCriteria) {
  const hasContractCriteria = Boolean(contract?.invariants?.length || contract?.requiredEvidence?.length);
  return hasContractCriteria || Boolean(invariants?.length || successCriteria?.length);
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
