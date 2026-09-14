'use strict';

/**
 * @file aTeamCoordinationService.js
 * @description A-Team coordination: multidisciplinary domains plus the
 * signaling and arbitration concepts the topology needs. It wraps the existing
 * aTeamService composition and adds inter-domain handoff signals, the
 * capability contract and an impartial integration ranking.
 */
const aTeamService = require('./aTeamService');
const topologyCapabilityService = require('./topologyCapabilityService');
const signalingBus = require('./biomimeticSignalingBus');
const arenaTaskEvaluation = require('./arenaTaskEvaluation');

const DEFAULT_ORGANIZATION = 'specialist_expert_committee';

function buildHandoffs(members) {
  const handoffs = [];
  for (const member of Array.isArray(members) ? members : []) {
    const dependencies = Array.isArray(member?.dependsOn) ? member.dependsOn : [];
    const target = member?.subSystem || member?.label || member?.role;
    for (const dependency of dependencies) {
      handoffs.push({
        from: dependency,
        to: target,
        stage: Number(member?.pipelineStage) || 0,
        ...signalingBus.formatSignalForTransport({
          signalType: 'ligand',
          signalData: { from: dependency, to: target },
          contentFallback: `handoff:${dependency}->${target}`
        })
      });
    }
  }
  return handoffs;
}

function composeTeam(options = {}) {
  const members = aTeamService.compose(options);
  const organization = options.organization || DEFAULT_ORGANIZATION;
  return {
    members,
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'a_team', organization }),
    handoffs: buildHandoffs(members)
  };
}

function arbitrateIntegration(dossiers, options = {}) {
  return arenaTaskEvaluation.evaluateDossiersPareto(dossiers, options);
}

module.exports = { composeTeam, buildHandoffs, arbitrateIntegration };
