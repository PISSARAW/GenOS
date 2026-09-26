'use strict';

const { validateSchema } = require('./variantExecutionService');

const MEMORY_ARTIFACTS = ['expertise_directory', 'transactive_memory', 'handoff_history', 'performance_data'];

function adaptiveTeamFullPotential(mission, members) {
  const config = buildAdaptiveConfig(mission, members);
  return {
    continuous_staffing_by_capability_gap: config.staffing,
    real_recruitment: config.recruitment,
    transactional_morphogenesis_transition: config.morphogenesis,
    memory_transfer: config.memoryTransfer,
    reconfiguration_cost: config.reconfigurationCost,
    hysteresis_anti_thrashing: config.hysteresis
  };
}

function buildAdaptiveConfig(mission, members) {
  const requiredCaps = mission.requiredCapabilities || [];
  const covered = computeCoveredCapabilities(members);
  const gaps = requiredCaps.filter((c) => !covered.has(c));
  return {
    staffing: buildStaffingConfig(mission, gaps, requiredCaps, covered),
    recruitment: buildRecruitmentConfig(gaps, mission),
    morphogenesis: buildMorphogenesisConfig(),
    memoryTransfer: buildMemoryTransferConfig(),
    reconfigurationCost: buildReconfigurationCostConfig(mission),
    hysteresis: buildHysteresisConfig(mission)
  };
}

function computeCoveredCapabilities(members) {
  const caps = new Set();
  for (const member of members) {
    for (const c of (member.capabilities || member.expertise || [])) caps.add(c);
  }
  return caps;
}

function buildStaffingConfig(mission, gaps, required, covered) {
  return {
    enabled: true,
    gapDetectionInterval: mission.gapDetectionInterval || 300000,
    gaps,
    requiredCapabilities: required,
    coveredCapabilities: [...covered],
    autoRecruit: mission.autoRecruit !== false,
    maxConcurrentRecruits: mission.maxConcurrentRecruits || 2,
    continuousMonitoring: true
  };
}

function buildRecruitmentConfig(gaps, mission) {
  return {
    verifiedCapabilityGapRequired: true,
    recruitmentAction: gaps.map((gap) => ({
      capability: gap,
      action: 'RECRUIT',
      priority: mission.capabilityPriority?.[gap] || 'normal',
      verificationRequired: true,
      estimatedTime: mission.recruitmentEstimates?.[gap]
    })),
    recruitmentEvidenceRequired: true
  };
}

function buildMorphogenesisConfig() {
  return {
    transactional: true,
    planType: 'a_team',
    requiresEvidenceGate: true,
    verificationRequired: true,
    memoryTransfer: {
      required: true,
      artifacts: MEMORY_ARTIFACTS,
      verification: 'checksum'
    }
  };
}

function buildMemoryTransferConfig() {
  return {
    required: true,
    artifacts: MEMORY_ARTIFACTS,
    verificationMethod: 'checksum',
    transferCompleteVerification: true
  };
}

function buildReconfigurationCostConfig(mission) {
  return {
    estimatedCost: Number(mission.reconfigurationCost) || 0,
    costModel: mission.costModel || 'linear',
    costTracking: true,
    costApprovalThreshold: mission.costApprovalThreshold || 0
  };
}

function buildHysteresisConfig(mission) {
  return {
    hysteresisThreshold: Number(mission.hysteresisThreshold) || 0.2,
    minStabilityPeriod: Number(mission.minStabilityPeriod) || 1800000,
    maxReconfigPerHour: Number(mission.maxReconfigurationsPerHour) || 2,
    stabilityCheck: true,
    thrashingPrevention: true,
    hysteresisApplied: true,
    reconfigurationRateLimited: true
  };
}

module.exports = { adaptiveTeamFullPotential };
