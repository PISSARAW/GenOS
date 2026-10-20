'use strict';

function outcome(decision, reason, evidenceRefs = []) {
  return { decision, reason, evidenceRefs: [...new Set(evidenceRefs)].sort(),
    executionAuthorized: false };
}

function responsibilityReady(input) {
  return input?.responsibility?.status === 'ACTIVE'
    && input.responsibility.version === input.responsibilityVersion;
}

function trajectoryGap(trajectory) {
  if (!trajectory || !Number.isFinite(trajectory.current) || !Number.isFinite(trajectory.target)) {
    return null;
  }
  if (!['MINIMIZE', 'MAXIMIZE'].includes(trajectory.direction)) return null;
  return trajectory.direction === 'MINIMIZE'
    ? trajectory.current - trajectory.target : trajectory.target - trajectory.current;
}

function actorsIndependent(input) {
  const actors = [input.responsibility.ownerAgentId, input.proposerId,
    input.verification?.verifierId, input.authority?.authorityId];
  return actors.every(Boolean) && new Set(actors).size === actors.length;
}

function authorizedEvidence(input) {
  const evidenceRefs = input.verification?.evidenceRefs;
  const observationBound = !input.observation
    || input.verification?.subjectRef === input.observation.observationId;
  return actorsIndependent(input) && observationBound
    && input.verification?.verdict === 'SUPPORTED'
    && Array.isArray(evidenceRefs) && evidenceRefs.length > 0
    && input.authority?.disposition === 'AUTHORIZED'
    && input.authority?.responsibilityVersion === input.responsibility.version;
}

function arbitrateFeedback(input) {
  if (!input.learningDecision) return outcome('OBSERVE', 'FEEDBACK_UNVERIFIED', input.feedback.sourceRefs);
  if (!authorizedEvidence({ ...input, verification: input.learningDecision,
    authority: { authorityId: input.learningDecision.authorityId,
      disposition: input.learningDecision.disposition,
      responsibilityVersion: input.learningDecision.authorityResponsibilityVersion },
    proposerId: input.feedback.proposerId })) {
    return outcome('NO_CHANGE', 'LEARNING_INDEPENDENCE_OR_AUTHORITY_MISSING');
  }
  if (!input.learningDecision.eligibleToLearn) {
    return outcome('NO_CHANGE', 'FEEDBACK_NOT_SUPPORTED', input.learningDecision.evidenceRefs);
  }
  return outcome('LEARN', 'VERIFIED_FEEDBACK', input.learningDecision.evidenceRefs);
}

function arbitrateTrajectory(input) {
  const gap = trajectoryGap(input.trajectory);
  if (gap === null) return outcome('OBSERVE', 'EXTERNAL_TRAJECTORY_UNMEASURED');
  if (gap <= (input.trajectory.tolerance || 0)) {
    return outcome('NO_CHANGE', 'EXTERNAL_TRAJECTORY_WITHIN_TOLERANCE');
  }
  if (!input.observation) return outcome('OBSERVE', 'MATERIAL_GAP_NEEDS_OBSERVATION');
  if (!Array.isArray(input.trajectory.effectEvidenceRefs)
    || !input.trajectory.effectEvidenceRefs.length) {
    return outcome('OBSERVE', 'TRANSPORT_IS_NOT_EFFECT_EVIDENCE');
  }
  if (!authorizedEvidence(input)) {
    return outcome('OBSERVE', 'MATERIAL_GAP_NEEDS_INDEPENDENT_PROOF');
  }
  return outcome('PROPOSE_ACTION', 'VERIFIED_EXTERNAL_TRAJECTORY_GAP',
    [...input.verification.evidenceRefs, ...input.trajectory.effectEvidenceRefs]);
}

function arbitrate(input) {
  if (!responsibilityReady(input)) return outcome('NO_CHANGE', 'RESPONSIBILITY_INACTIVE_OR_STALE');
  if (input.trajectory?.ref !== input.responsibility.externalTrajectoryRef) {
    return outcome('OBSERVE', 'EXTERNAL_TRAJECTORY_MISSING');
  }
  return input.feedback ? arbitrateFeedback(input) : arbitrateTrajectory(input);
}

module.exports = { arbitrate };
