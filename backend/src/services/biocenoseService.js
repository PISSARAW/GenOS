'use strict';

/**
 * @file biocenoseService.js
 * @description Biocenose compatibility facade for role composition,
 * candidate-option evaluation, and community calibration metrics.
 */

const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');
const arenaTaskEvaluation = require('./arenaTaskEvaluation');
const epistemicBiocenose = require('./epistemic/epistemicBiocenoseService');
const hierarchicalQuorum = require('./hierarchicalQuorumService');
const communityStore = require('./biocenose/communityStore');

const NON_CANDIDATE_ROLES = new Set([
  'adversarial_reviewer', 'reviewer', 'consensus_observer', 'observer',
  'verifier', 'community_facilitator', 'aggregator', 'social_observer'
]);
const CANDIDATE_ROLES = new Set([
  'independent_solver', 'generator', 'candidate_solution', 'solution_candidate'
]);

function isCandidateOption(dossier) {
  const role = String(dossier?.role || '').trim().toLowerCase();
  if (NON_CANDIDATE_ROLES.has(role)) return false;
  return CANDIDATE_ROLES.has(role) || dossier?.candidateType === 'solution'
    || dossier?.candidateType === 'option' || dossier?.isCandidate === true;
}

function communityDiversity(dossiers) {
  const members = (Array.isArray(dossiers) ? dossiers : []).map((dossier) => ({
    ...dossier,
    type: dossier?.type || dossier?.role,
    errorPatterns: dossier?.errorPatterns || dossier?.errorClaims
  }));
  return members.length ? epistemicBiocenose.cognitiveBiocenose(members) : null;
}

function clamp01(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function brierMember(dossier) {
  const events = Array.isArray(dossier?.events) ? dossier.events : [];
  const report = [...events].reverse().map((event) => event.evidenceReport).find(Boolean) || {};
  const claims = Array.isArray(report.claims) ? report.claims : [];
  const confidences = claims.map((claim) => Number(claim.confidence)).filter((value) => Number.isFinite(value));
  return {
    outcome: report.outcome,
    confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : clamp01(report.coverage)
  };
}

function oracleTruth(oracleResult) {
  if (oracleResult === 'success' || oracleResult === true) return 1;
  if (oracleResult === 'failed' || oracleResult === false) return 0;
  const num = Number(oracleResult);
  if (Number.isFinite(num)) return clamp01(num);
  return null;
}

function voteSupport(outcome) {
  return outcome === 'success' || outcome === true ? 1 : 0;
}

function brierScore(member, oracleResult) {
  const confidence = clamp01(member?.confidence ?? 0.5);
  const truth = oracleTruth(oracleResult);
  if (truth === null) return null;
  return (confidence - truth) ** 2;
}

function quorumWithAbstention(votes, options = {}) {
  const list = Array.isArray(votes) ? votes : [];
  const ratio = Number.isFinite(options.quorumRatio) ? options.quorumRatio : 0.5;
  let activeWeight = 0;
  let supportWeight = 0;
  let abstentions = 0;
  for (const vote of list) {
    if (vote?.abstain === true) { abstentions += 1; continue; }
    const weight = Number.isFinite(vote?.weight) && vote.weight > 0 ? vote.weight : 1;
    activeWeight += weight;
    if (vote?.support === true) supportWeight += weight;
  }
  const support = activeWeight > 0 ? supportWeight / activeWeight : 0;
  return { reached: support >= ratio, support: Number(support.toFixed(3)), quorumRatio: ratio, abstentions, activeVoters: list.length - abstentions };
}

function brierConsensus(dossiers, options = {}) {
  const members = (Array.isArray(dossiers) ? dossiers : []).map(brierMember);
  const truth = oracleTruth(options.oracleResult);
  const quorumRatio = Number.isFinite(options.quorumRatio) ? options.quorumRatio : 0.5;
  if (!members.length || truth === null) {
    return { reached: false, weightedSupport: 0, meanBrier: null, participantCount: members.length, quorumRatio, oracleMissing: true };
  }
  let weightSum = 0;
  let supportSum = 0;
  let brierSum = 0;
  for (const member of members) {
    const brier = brierScore(member, truth);
    if (brier === null) continue;
    const weight = Math.max(0, 1 - brier);
    const support = voteSupport(member.outcome);
    weightSum += weight;
    supportSum += weight * support;
    brierSum += brier;
  }
  const weightedSupport = weightSum > 0 ? supportSum / weightSum : 0;
  return {
    reached: weightedSupport >= quorumRatio,
    weightedSupport: Number(weightedSupport.toFixed(3)),
    meanBrier: Number((brierSum / members.length).toFixed(4)),
    quorumRatio,
    participantCount: members.length
  };
}

function candidateDossiers(dossiers) {
  return (Array.isArray(dossiers) ? dossiers : []).filter(isCandidateOption);
}

function evaluateCommunity(dossiers, options = {}) {
  const candidates = candidateDossiers(dossiers);
  const evaluation = arenaTaskEvaluation.evaluateDossiersPareto(candidates, options);
  const organization = options.organization || 'blind_adversarial_review';
  return {
    organization,
    arenaRecommendation: evaluation.leaderboard.length > 1 ? evaluation.kneePoint : null,
    candidateCount: candidates.length,
    leaderboard: evaluation.leaderboard,
    paretoFront: evaluation.paretoFront,
    diversity: communityDiversity(dossiers),
    independence: { measured: false, reason: 'No validated member-independence data is available in dossiers.' },
    brier: brierConsensus(dossiers, options),
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'biocenose', organization })
  };
}

function composeBiocenose(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Biocenose mission is required.'), {
      code: 'BIOCENOSE_MISSION_REQUIRED'
    });
  }
  const members = composeMembers(goal, options.population);
  const organization = options.organization || 'blind_adversarial_review';
  return {
    mode: 'biocenose',
    mission: goal,
    evidenceThreshold: options.evidenceThreshold || 0.75,
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'biocenose', organization }),
    communicationPlan: hierarchicalQuorum.planForAgentCount(options.agentCount || 4, options),
    members
  };
}

function composePopulationRole(template, role, count) {
  return Array.from({ length: count }, (_, index) => ({
    ...template,
    role,
    memberNumber: index + 1,
    mission: `${template.mission}\nPopulation member ${index + 1}; work independently and return evidence, assumptions, and unresolved claims.`
  }));
}

function populationCount(population, key) {
  const count = Number(population?.[key]);
  return Number.isInteger(count) && count > 0 ? count : 1;
}

function composeMembers(mission, population) {
  const templates = biologicalModeService.compose('biocenose', mission);
  if (!population || typeof population !== 'object') return templates;
  return [
    templates[0],
    ...composePopulationRole(templates[1], 'generator', populationCount(population, 'generators')),
    ...composePopulationRole(templates[2], 'reviewer', populationCount(population, 'reviewers')),
    ...composePopulationRole(templates[3], 'verifier', populationCount(population, 'verifiers'))
  ];
}

async function prepareCommunity({ db, orchestratorId, mission, options = {} }) {
  const composition = composeBiocenose(mission, options);
  const session = await communityStore.createSession(db, {
    missionId: options.missionId,
    question: mission,
    questionType: options.questionType,
    members: composition.members,
    actorId: orchestratorId
  });
  if (composition.organization) {
    const dynamicOrganization = require('./dynamicOrganizationService');
    await dynamicOrganization.changeOrganization(db, {
      orchestratorId, organization: composition.organization,
      reason: 'Biocenose mode activation', changedBy: orchestratorId
    }).catch(() => {});
  }
  return { ...composition, communityId: session.communityId, sessionRevision: session.revision };
}

function activateBiocenose(mission, context = {}) {
  const composition = composeBiocenose(mission, context);
  return {
    activated: true,
    communityId: `biocenose-${Date.now()}`,
    ...composition,
    status: 'ACTIVE',
    activatedAt: new Date().toISOString()
  };
}

module.exports = {
  composeBiocenose,
  activateBiocenose,
  evaluateCommunity,
  prepareCommunity,
  brierConsensus,
  quorumWithAbstention,
  hierarchicalQuorumPlan: hierarchicalQuorum.planForAgentCount
};
