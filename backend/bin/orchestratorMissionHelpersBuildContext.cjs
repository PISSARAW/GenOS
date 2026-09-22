'use strict';

const { collectMissionEvidence } = require('../src/services/missionEvidenceCollector');

function buildHomeostasisContext(opts) {
  const { outcome, policyRequest, request, flags, evidence, profiles, dossierCount } = opts;
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

function fallbackContext(opts) {
  return buildHomeostasisContext({
    ...opts,
    flags: { missionOutcome: true },
    evidence: opts.outcome.success === true ? ['mission_outcome'] : [],
    profiles: [],
    dossierCount: 0,
  });
}

async function buildMissionContext(opts) {
  const { outcome, db, missionId, agents } = opts;
  if (!db || !missionId) {
    return fallbackContext(opts);
  }
  let runtimeEvidence = null;
  try {
    runtimeEvidence = await collectMissionEvidence(db, missionId, agents || []);
  } catch {
    return fallbackContext(opts);
  }
  if (!runtimeEvidence) {
    return fallbackContext(opts);
  }
  return buildHomeostasisContext({
    ...opts,
    flags: runtimeEvidence.flags || { missionOutcome: true },
    evidence: runtimeEvidence.evidence || [],
    profiles: runtimeEvidence.profiles || [],
    dossierCount: runtimeEvidence.dossiers?.length || 0,
  });
}

module.exports = { buildMissionContext };
