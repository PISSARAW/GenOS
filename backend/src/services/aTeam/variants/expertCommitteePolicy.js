'use strict';

function expertCommitteeFullPotential(mission, members) {
  const matrix = buildExpertiseMatrix(members);
  const conflicts = detectConflicts(matrix);
  const { coverage, gaps } = computeCoverage(matrix, mission.requiredExpertise);
  const memberCount = members.length;

  return {
    real_initial_independence: buildIndependenceConfig(mission),
    expertise_matrix: { matrix, coverage, gaps },
    competency_conflicts: { detected: conflicts, resolutionProtocol: 'evidence_review_before_consensus' },
    calibration_protocol: buildCalibrationConfig(mission, members),
    explicit_consensus_dissent: buildConsensusConfig(mission, memberCount)
  };
}

function buildExpertiseMatrix(members) {
  return members.map((member) => ({
    memberId: member.memberId || member.agentId || member.workerId,
    expertise: [...new Set(member.expertise || member.capabilities || [])],
    verifiedCapabilities: member.verifiedCapabilities || [],
    confidenceLevel: Number.isFinite(member.confidenceLevel) ? member.confidenceLevel : null
  }));
}

function detectConflicts(matrix) {
  const conflicts = [];
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      const overlap = findOverlap(matrix[i].expertise, matrix[j].expertise);
      if (overlap.length) {
        const total = new Set([...matrix[i].expertise, ...matrix[j].expertise]).size;
        conflicts.push({ members: [matrix[i].memberId, matrix[j].memberId], overlap, severity: overlap.length / total });
      }
    }
  }
  return conflicts;
}

function findOverlap(expertiseA, expertiseB) {
  return expertiseA.filter((skill) => expertiseB.includes(skill));
}

function computeCoverage(matrix, required) {
  const covered = new Set();
  for (const entry of matrix) {
    for (const skill of entry.expertise) covered.add(skill);
  }
  const coverage = required.length ? required.filter((r) => covered.has(r)).length / required.length : 1;
  const gaps = required.filter((r) => !covered.has(r));
  return { coverage, gaps };
}

function buildIndependenceConfig(mission) {
  return {
    initialContext: 'mission_and_member_scope_only',
    sharedPeerReviews: false,
    blindReviewEnabled: mission.blindReview !== false,
    noCrossContamination: true,
    independenceEnforced: true
  };
}

function buildCalibrationConfig(mission, members) {
  return {
    required: true,
    baselineAssessment: true,
    peerCalibrationRounds: mission.calibrationRounds || 2,
    evidenceStandards: mission.evidenceThreshold || 0.7,
    calibrationParticipants: members.map((m) => m.memberId || m.agentId || m.workerId)
  };
}

function buildConsensusConfig(mission, memberCount) {
  return {
    protocol: mission.consensusProtocol || {
      quorum: Math.ceil(memberCount * 2 / 3),
      rounds: 2,
      tieBreak: 'evidence_review',
      dissentRequired: true
    },
    dissentRecordingRequired: true,
    dissentMustBeEvidenceBacked: true,
    minorityObjectionsPreserved: true
  };
}

module.exports = { expertCommitteeFullPotential };
