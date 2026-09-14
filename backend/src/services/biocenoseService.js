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

function communityDiversity(dossiers) {
  const actions = (dossiers || []).flatMap((dossier) => (dossier.events || []).map((event) => event.action || event.eventType)).filter(Boolean);
  if (!actions.length) return null;
  return swarmMetricsService.calculateShannonEntropy(actions);
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
  prepareCommunity
};
