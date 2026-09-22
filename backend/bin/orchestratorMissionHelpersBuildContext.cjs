'use strict';

const { collectMissionEvidence } = require('../src/services/missionEvidenceCollector');

function makeHomeostasisContext(opts) {
  const { outcome, policyRequest = {}, request = {}, flags, evidence, profiles, dossierCount } = opts;
  flags.missionOutcome = outcome.success === true;
  return {
    completionContract: policyRequest.completionContract || request.completionContract || null,
    invariants: policyRequest.invariants || request.invariants || null,
    safetyConstraints: policyRequest.safetyConstraints || request.safetyConstraints || null,
    context: {
      missionOutcome: outcome.success === true,
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
    flags: { missionOutcome: true },
    evidence: outcome.success === true ? ['mission_outcome'] : [],
    profiles: [],
    dossierCount: 0,
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
    flags: runtimeEvidence.flags || { missionOutcome: true },
    evidence: runtimeEvidence.evidence || [],
    profiles: runtimeEvidence.profiles || [],
    dossierCount: runtimeEvidence.dossiers?.length || 0,
  });
}

module.exports = { buildMissionContext };
