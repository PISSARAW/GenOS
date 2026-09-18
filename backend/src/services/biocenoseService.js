'use strict';

/**
 * @file biocenoseService.js
 * @description Biocenose collective coordination service: mission analysis,
 * role composition, and community-driven solver-reviewer orchestration.
 * Community evaluation now runs on the impartial Pareto arena and the swarm
 * diversity metric instead of being prompt-only.
 */

const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');
const arenaTaskEvaluation = require('./arenaTaskEvaluation');
const swarmMetricsService = require('./swarmMetricsService');
const hierarchicalQuorum = require('./hierarchicalQuorumService');

function communityDiversity(dossiers) {
  const actions = (dossiers || []).flatMap((dossier) => (dossier.events || []).map((event) => event.action || event.eventType)).filter(Boolean);
  if (!actions.length) return null;
  return swarmMetricsService.calculateShannonEntropy(actions);
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

function brierScore(member) {
  const confidence = clamp01(member?.confidence ?? 0.5);
  const outcome = member?.outcome === 'success' || member?.outcome === true ? 1 : (member?.outcome === 'failed' || member?.outcome === false ? 0 : 0.5);
  return (confidence - outcome) ** 2;
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
  if (!members.length) return { reached: false, weightedSupport: 0, meanBrier: null, participantCount: 0 };
  let weightSum = 0;
  let supportSum = 0;
  let brierSum = 0;
  for (const member of members) {
    const brier = brierScore(member);
    const weight = Math.max(0, 1 - brier);
    const support = member.outcome === 'success' || member.outcome === true ? 1 : 0;
    weightSum += weight;
    supportSum += weight * support;
    brierSum += brier;
  }
  const weightedSupport = weightSum > 0 ? supportSum / weightSum : 0;
  const quorumRatio = Number.isFinite(options.quorumRatio) ? options.quorumRatio : 0.5;
  return {
    reached: weightedSupport >= quorumRatio,
    weightedSupport: Number(weightedSupport.toFixed(3)),
    meanBrier: Number((brierSum / members.length).toFixed(4)),
    quorumRatio,
    participantCount: members.length
  };
}

function recommendedOrganization(evaluation) {
  return evaluation && evaluation.leaderboard && evaluation.leaderboard.length > 0
    ? 'brier_weighted_consensus'
    : 'blind_adversarial_review';
}

function evaluateCommunity(dossiers, options = {}) {
  const evaluation = arenaTaskEvaluation.evaluateDossiersPareto(dossiers, options);
  const organization = options.organization || recommendedOrganization(evaluation);
  return {
    organization,
    consensus: evaluation.kneePoint,
    leaderboard: evaluation.leaderboard,
    paretoFront: evaluation.paretoFront,
    diversity: communityDiversity(dossiers),
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
  const members = biologicalModeService.compose('biocenose', goal);
  const organization = options.organization || 'brier_weighted_consensus';
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

async function prepareCommunity(db, orchestratorId, mission) {
  const composition = composeBiocenose(mission);
  if (composition.organization) {
    const dynamicOrganization = require('./dynamicOrganizationService');
    await dynamicOrganization.changeOrganization(db, {
      orchestratorId, organization: composition.organization,
      reason: 'Biocenose mode activation', changedBy: orchestratorId
    }).catch(() => {});
  }
  return composition;
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
  quorumWithAbstention
  , hierarchicalQuorumPlan: hierarchicalQuorum.planForAgentCount
};
