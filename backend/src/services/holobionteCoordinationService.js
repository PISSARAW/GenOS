'use strict';

/**
 * @file holobionteCoordinationService.js
 * @description Holobionte coordination: a host with authority over local
 * symbiotic agents. It wires the host/symbiote engines, the immune symbiont
 * veto and the capability contract so the mode is operational, not prompt-only.
 */
const holobionteService = require('./holobionteService');
const symbioteRuntimeService = require('./symbioteRuntimeService');
const immuneSystem = require('./immuneSystem');
const topologyCapabilityService = require('./topologyCapabilityService');

const DEFAULT_ORGANIZATION = 'specialist_expert_committee';
const HEALTH_THRESHOLD = 0.6;

function compositionSummary(members) {
  const list = Array.isArray(members) ? members : [];
  return {
    host: list.find((member) => member.role === 'host_orchestrator') || list[0] || null,
    symbiotes: list.filter((member) => symbioteRuntimeService.isSymbioteRole(member.role)),
    engines: Object.fromEntries(list.map((member) => [member.role, symbioteRuntimeService.engineFor(member.role)]))
  };
}

function composeHolobiont(mission, options = {}) {
  const composition = holobionteService.composeHolobionte(mission, options);
  const organization = options.organization || DEFAULT_ORGANIZATION;
  return {
    ...composition,
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'holobionte', organization }),
    ...compositionSummary(composition.members)
  };
}

function reportText(dossier) {
  const events = Array.isArray(dossier?.events) ? dossier.events : [];
  const report = [...events].reverse().map((event) => event.evidenceReport).find(Boolean) || {};
  return (report.claims || []).map((claim) => claim.statement).filter(Boolean).join('\n') || report.artifactText || '';
}

function isUnhealthy(chaperoned, drift, threats) {
  const healthScore = chaperoned.health ? chaperoned.health.health_score : null;
  return threats.length > 0 || chaperoned.warning === true || drift?.warning === true
    || (typeof healthScore === 'number' && healthScore < HEALTH_THRESHOLD);
}

function hostVeto(dossier = {}) {
  const text = reportText(dossier);
  if (!text.trim()) return { allowed: false, reason: 'no_deliverable', health: null, drift: false };
  const threatScan = immuneSystem.scanThreats(text);
  const chaperoned = immuneSystem.chaperoneAgentOutput(text, {});
  const drift = immuneSystem.evaluateCognitiveDrift(text);
  const threats = Array.isArray(threatScan?.threats) ? threatScan.threats : [];
  const unhealthy = isUnhealthy(chaperoned, drift, threats);
  return {
    allowed: !unhealthy,
    reason: unhealthy ? 'immune_veto' : 'accepted',
    health: chaperoned.health || null,
    drift: drift?.warning === true,
    threats,
    textLength: String(chaperoned.purifiedText || text).length
  };
}

module.exports = { composeHolobiont, hostVeto, compositionSummary };
