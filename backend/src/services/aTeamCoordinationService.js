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

function handoffLigand(from, to) {
  return `handoff:${from}->${to}`;
}

// A ligand is only meaningful if a receptor can recognise it: the payload must
// carry the `ligand`/`concentration` pair evaluateLigandReactivity compares to a
// target. The old {from,to}-only payload could never trigger a cascade.
function buildHandoff(from, to, stage) {
  const ligand = handoffLigand(from, to);
  const concentration = 1;
  return {
    from,
    to,
    stage,
    ligand,
    concentration,
    receptor: { targetLigand: ligand, threshold: 1, cascadeSignal: `accept:${to}` },
    ...signalingBus.formatSignalForTransport({
      signalType: 'ligand',
      signalData: { ligand, concentration, from, to },
      contentFallback: ligand
    })
  };
}

function buildHandoffs(members) {
  const handoffs = [];
  for (const member of Array.isArray(members) ? members : []) {
    const dependencies = Array.isArray(member?.dependsOn) ? member.dependsOn : [];
    const target = member?.subSystem || member?.label || member?.role;
    const stage = Number(member?.pipelineStage) || 0;
    for (const dependency of dependencies) {
      handoffs.push(buildHandoff(dependency, target, stage));
    }
  }
  return handoffs;
}

function handoffReceptor(handoff) {
  if (handoff && handoff.receptor) return handoff.receptor;
  return { targetLigand: handoff?.ligand || null, threshold: 1, cascadeSignal: handoff?.to ? `accept:${handoff.to}` : null };
}

function evaluateHandoff(handoff, receptor) {
  const target = receptor || handoffReceptor(handoff);
  const ligandData = { ligand: handoff?.ligand, concentration: Number(handoff?.concentration) || 0 };
  return signalingBus.evaluateLigandReactivity(ligandData, target);
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

module.exports = { composeTeam, buildHandoffs, buildHandoff, handoffLigand, handoffReceptor, evaluateHandoff, arbitrateIntegration };
