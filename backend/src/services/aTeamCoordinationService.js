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
const toolLeasePolicy = require('./toolLeasePolicy');
const signalingBus = require('./biomimeticSignalingBus');
const arenaTaskEvaluation = require('./arenaTaskEvaluation');

const DEFAULT_ORGANIZATION = 'specialist_expert_committee';

const KNOWN_ORGANIZATIONS = Object.freeze(Object.keys(topologyCapabilityService.ORGANIZATION_CAPABILITIES || {}));

// A-Team is not always a plain expert committee: an adversarial, quorum or
// memory-compilation mission needs a different communication topology. The
// selector is deliberately conservative: only explicit, strong signals move the
// team off the default committee.
const ORGANIZATION_SIGNALS = [
  { organization: 'red_blue_coevolution', pattern: /red[ -]?team|blue[ -]?team|adversarial|co-?evolution/i },
  { organization: 'blind_adversarial_review', pattern: /blind|anonymous review|peer review/i },
  { organization: 'quorum_with_abstention', pattern: /quorum|abstention|\bvote\b/i },
  { organization: 'stigmergy', pattern: /stigmerg|pheromon|shared trail/i },
  { organization: 'strategy_arena', pattern: /arena|tournament/i },
  { organization: 'memory_compilation', pattern: /memory compil|knowledge compil|compile memory/i }
];

function selectOrganization(options = {}) {
  const explicit = options.organization;
  if (explicit) {
    const name = String(explicit).trim();
    if (!KNOWN_ORGANIZATIONS.includes(name)) {
      throw Object.assign(new Error(`Unknown A-Team organization '${name}'.`), { code: 'A_TEAM_UNKNOWN_ORGANIZATION', known: KNOWN_ORGANIZATIONS });
    }
    return name;
  }
  const text = String(options.projectGoal || options.mission || options.goal || '');
  const match = ORGANIZATION_SIGNALS.find((signal) => signal.pattern.test(text));
  return match ? match.organization : DEFAULT_ORGANIZATION;
}

// A capability is only real at runtime if at least one well-known tool realises
// it. Anything the contract declares but no tool can serve is an enforcement
// failure, not a decorative label.
function toolBackedCapabilities() {
  const map = toolLeasePolicy.CAPABILITY_TOOLS || {};
  return Object.entries(map)
    .filter(([, tools]) => Array.isArray(tools) && tools.length > 0)
    .map(([capability]) => capability);
}

function auditCapabilities(contract, available) {
  const provided = Array.isArray(available) ? available : toolBackedCapabilities();
  const audit = topologyCapabilityService.auditTopology({
    mode: contract.mode,
    organization: contract.organization,
    available: provided
  });
  return { required: audit.contract.required, provided, missing: audit.missing };
}

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

function capabilityContractFor(organization) {
  return topologyCapabilityService.contractFor({ mode: 'a_team', organization: organization || DEFAULT_ORGANIZATION });
}

// Shared by both A-Team entry paths (explicit dispatch_team and the automatic
// autonomy plan) so composition, capability audit and handoffs stay identical.
function coordinateMembers(members, options = {}) {
  const organization = selectOrganization(options);
  const capabilityContract = capabilityContractFor(organization);
  const capabilityAudit = auditCapabilities(capabilityContract, options.availableCapabilities);
  if (options.enforceCapabilities !== false && capabilityAudit.missing.length) {
    throw Object.assign(
      new Error(`A-Team contract requires capabilities no tool can serve: ${capabilityAudit.missing.join(', ')}.`),
      { code: 'A_TEAM_CAPABILITY_MISSING', missing: capabilityAudit.missing }
    );
  }
  return {
    organization,
    capabilityContract,
    capabilityAudit,
    handoffs: buildHandoffs(members)
  };
}

function composeTeam(options = {}) {
  const members = aTeamService.compose(options);
  return { members, ...coordinateMembers(members, options) };
}

function arbitrateIntegration(dossiers, options = {}) {
  return arenaTaskEvaluation.evaluateDossiersPareto(dossiers, options);
}

module.exports = { composeTeam, coordinateMembers, capabilityContractFor, selectOrganization, KNOWN_ORGANIZATIONS, buildHandoffs, buildHandoff, handoffLigand, handoffReceptor, evaluateHandoff, arbitrateIntegration, toolBackedCapabilities, auditCapabilities };
