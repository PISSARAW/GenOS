'use strict';

/**
 * @file culturalLearningService.js
 * @description Service d'apprentissage culturel avec évaluation avant/après réelle.
 *
 * Contraste avant/après : les deux tests évaluent le même artefact de
 * transmission par rapport au domaine cible, de manière reproducible.
 * La "mesure" n'est pas une formule synthétique garantie positive —
 * elle dépend de la pertinence réelle de l'artefact, de la qualité réelle
 * de la transmission et du niveau de départ de l'agent (diminishing returns).
 */

const { createCulturalArtifact, cloneArtifact } = require('./culturalTransmissionService');

const SKILL_LEVELS = {
  novice: 0.1,
  beginner: 0.3,
  intermediate: 0.5,
  advanced: 0.7,
  expert: 0.9,
};

/**
 * Niveau de compétence de départ de l'agent dans un domaine.
 * Utilise les traits réels de l'agent (expérience + niveau de base par domaine).
 */
function evaluateSkillLevel(ctx) {
  const baseSkill = ctx.agentTraits?.[ctx.domain] ?? 0.1;
  const experienceBonus = Math.min(0.3, (ctx.agentTraits?.experience || 0) * 0.05);
  return Math.min(1, baseSkill + experienceBonus);
}

/**
 * Évalue la pertinence réelle d'un artefact par rapport à un domaine.
 * Retourne { relevance, reason } où relevance est dans [0, 1].
 *
 * La pertinence dépend de :
 *  - la congruence entre le type d'artefact et le domaine
 *  - le contenu réel de l'artefact (non vide, structuré)
 *  - la qualité intrinsèque de l'artefact
 */
function evaluateArtifactRelevance(artifact, domain) {
  if (!artifact) return { relevance: 0, reason: 'artefact vide ou non évaluable', evaluated: true };
  const content = String(artifact.content || '');
  const type = artifact.type || '';
  const quality = clamp01(artifact.quality);

  let relevance = 0;
  let reason = 'artefact vide ou non évaluable';

  relevance += scoreTypeCongruence(type, domain, reason).relevance;
  reason = scoreTypeCongruence(type, domain, reason).reason || reason;

  if (content.trim().length >= 4) {
    relevance += 0.3;
    reason = reason === 'artefact vide ou non évaluable' ? 'contenu présent mais type incongru' : 'type congru + contenu présent';
  } else {
    return { relevance: 0, reason: 'artefact sans contenu exploitable', evaluated: true };
  }

  relevance = Math.min(1, relevance + quality * 0.35);
  return { relevance, reason, evaluated: true };
}

function scoreTypeCongruence(type, domain, reason) {
  if (type && type === domain) return { relevance: 0.35, reason: 'type congru avec le domaine' };
  if (type && domain && type.includes(domain)) return { relevance: 0.2, reason: 'type partiellement congru' };
  return { relevance: 0, reason: 'type d\'artefact incongru avec le domaine' };
}

function clamp01(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Mesure avant transmission : compétence actuelle de l'agent dans le domaine.
 */
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

/**
 * Mesure après transmission : réévalue le même artefact/c domaine.
 *
 * Contrairement à la version synthétique précédente, le gain n'est pas
 * garanti positif : il dépend de la pertinence réelle de l'artefact
 * et du gap de compétence restant (diminishing returns).
 */
function testAfterTransmission(ctx) {
  const preSkill = evaluateSkillLevel(ctx);
  const artifact = ctx.artifact;
  const domain = ctx.domain;

  if (!artifact) {
    return {
      agentId: ctx.agentId,
      domain,
      skillLevel: preSkill,
      gain: 0,
      relevance: 0,
      artifactEvaluated: false,
      timestamp: new Date().toISOString(),
      testType: 'post_transmission',
    };
  }

  const ev = evaluateArtifactRelevance(artifact, domain);
  const fidelity = clamp01(ctx.effectiveFidelity);
  const quality = clamp01(artifact.quality || 0.5);

  // Le gain dépend de :
  //  - la pertinence réelle de l'artefact pour le domaine
  //  - la fidélité réelle de la transmission
  //  - la qualité intrinsèque de l'artefact
  //  - le gap de compétence restant (un expert ne gagne pas beaucoup d'un
  //    artefact basique, un novice peut gagner davantage)
  const skillGap = Math.max(0, 1 - preSkill);
  const rawGain = ev.relevance * fidelity * quality * skillGap;
  const gain = Math.min(rawGain, skillGap); // pas de dépassement du max

  const postSkill = Math.min(1, preSkill + gain);

  return {
    agentId: ctx.agentId,
    domain,
    skillLevel: postSkill,
    gain,
    relevance: ev.relevance,
    artifactEvaluated: ev.evaluated,
    evaluationReason: ev.reason,
    timestamp: new Date().toISOString(),
    testType: 'post_transmission',
  };
}

/**
 * Transmission avec évaluation avant/après réelle.
 *
 * Le succès n'est pas garanti : il dépend de la pertinence de l'artefact
 * pour le domaine cible. Un artefact incongru ou vide ne produit pas
 * d'amélioration mesurable.
 */
function transmitWithLearning(opts) {
  const {
    sourceAgentId,
    targetAgentId,
    artifact,
    domain,
    sourceTraits,
    targetTraits,
  } = opts;

  if (!artifact) {
    return {
      transmissionId: `txl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceAgentId,
      targetAgentId,
      artifact: null,
      domain,
      preTest: testBeforeTransmission({ agentId: targetAgentId, domain, agentTraits: targetTraits }),
      postTest: testAfterTransmission({ agentId: targetAgentId, domain, agentTraits: targetTraits, artifact: null }),
      gain: 0,
      fidelity: 0,
      success: false,
      artifactEvaluated: false,
      timestamp: new Date().toISOString(),
    };
  }

  const preTest = testBeforeTransmission({ agentId: targetAgentId, domain, agentTraits: targetTraits });
  const transmittedArtifact = cloneArtifact(artifact);
  transmittedArtifact.agentId = targetAgentId;
  transmittedArtifact.transmittedFrom = sourceAgentId;
  transmittedArtifact.transmittedAt = new Date().toISOString();
  const fidelity = computeEffectiveFidelity({ artifact, sourceTraits, targetTraits });
  const postTest = testAfterTransmission({
    agentId: targetAgentId,
    domain,
    agentTraits: targetTraits,
    artifact: transmittedArtifact,
    effectiveFidelity: fidelity,
  });

  return {
    transmissionId: `txl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceAgentId,
    targetAgentId,
    artifact: transmittedArtifact,
    domain,
    preTest,
    postTest,
    gain: postTest.gain,
    fidelity,
    success: postTest.gain > 0,
    artifactEvaluated: postTest.artifactEvaluated,
    evaluationReason: postTest.evaluationReason,
    timestamp: new Date().toISOString(),
  };
}

function computeEffectiveFidelity(opts) {
  const base = clamp01(opts.artifact && opts.artifact.quality) || 0.5;
  const sourceSkill = clamp01(opts.sourceTraits && opts.sourceTraits.teachingAbility) || 0.5;
  const targetReceptivity = clamp01(opts.targetTraits && opts.targetTraits.receptivity) || 0.5;
  return Math.min(1, base * sourceSkill * (1 + targetReceptivity) / 2);
}

module.exports = {
  SKILL_LEVELS,
  evaluateSkillLevel,
  evaluateArtifactRelevance,
  testBeforeTransmission,
  testAfterTransmission,
  transmitWithLearning,
  computeEffectiveFidelity,
};
