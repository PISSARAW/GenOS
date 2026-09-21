'use strict';

/**
 * @file culturalLearningService.js
 * @description Service d'apprentissage culturel avec évaluation avant/après.
 */

const { createCulturalArtifact, cloneArtifact } = require('./culturalTransmissionService');

const SKILL_LEVELS = {
  novice: 0.1,
  beginner: 0.3,
  intermediate: 0.5,
  advanced: 0.7,
  expert: 0.9,
};

function evaluateSkillLevel(ctx) {
  const baseSkill = ctx.agentTraits?.[ctx.domain] ?? 0.1;
  const experienceBonus = Math.min(0.3, (ctx.agentTraits?.experience || 0) * 0.05);
  return Math.min(1, baseSkill + experienceBonus);
}

function testBeforeTransmission(ctx) {
  const skillLevel = evaluateSkillLevel(ctx);
  return {
    agentId: ctx.agentId,
    domain: ctx.domain,
    skillLevel,
    timestamp: new Date().toISOString(),
    testType: 'pre_transmission',
  };
}

function testAfterTransmission(ctx) {
  const preSkill = evaluateSkillLevel(ctx);
  const gain = ctx.effectiveFidelity * ctx.artifactQuality * 0.3;
  const postSkill = Math.min(1, preSkill + gain);
  return {
    agentId: ctx.agentId,
    domain: ctx.domain,
    skillLevel: postSkill,
    gain,
    timestamp: new Date().toISOString(),
    testType: 'post_transmission',
  };
}

function transmitWithLearning(opts) {
  const { sourceAgentId, targetAgentId, artifact, domain, sourceTraits, targetTraits } = opts;
  const preTest = testBeforeTransmission({ agentId: targetAgentId, domain, agentTraits: targetTraits });
  const transmittedArtifact = cloneArtifact(artifact);
  transmittedArtifact.agentId = targetAgentId;
  transmittedArtifact.transmittedFrom = sourceAgentId;
  transmittedArtifact.transmittedAt = new Date().toISOString();
  const fidelity = computeEffectiveFidelity({ artifact, sourceTraits, targetTraits });
  const postTest = testAfterTransmission({ agentId: targetAgentId, domain, agentTraits: targetTraits, effectiveFidelity: fidelity, artifactQuality: artifact.quality || 0.5 });
  return {
    transmissionId: `txl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceAgentId,
    targetAgentId,
    artifact: transmittedArtifact,
    domain,
    preTest,
    postTest,
    gain: postTest.skillLevel - preTest.skillLevel,
    fidelity,
    success: postTest.skillLevel > preTest.skillLevel,
    timestamp: new Date().toISOString(),
  };
}

function computeEffectiveFidelity(opts) {
  const base = opts.artifact.quality || 0.5;
  const sourceSkill = opts.sourceTraits?.teachingAbility || 0.5;
  const targetReceptivity = opts.targetTraits?.receptivity || 0.5;
  return Math.min(1, base * sourceSkill * (1 + targetReceptivity) / 2);
}

module.exports = {
  SKILL_LEVELS,
  evaluateSkillLevel,
  testBeforeTransmission,
  testAfterTransmission,
  transmitWithLearning,
};
