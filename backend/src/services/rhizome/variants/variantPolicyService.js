'use strict';

const PROFILES = Object.freeze({
  exploratory: Object.freeze({
    conductivity: { alpha: 0.3, beta: 0.1, tau: 1.5, decay: 0.05, scoutPriority: 'max' },
    routing: { maxHops: 6, curiosityWeight: 0.25 },
    growth: { threshold: 0 },
    pruning: { enabled: false },
    resilience: { alternatives: 2 },
    stop: { stableTicks: 3 }
  }),
  routing: Object.freeze({
    conductivity: { alpha: 0.4, beta: 0.2, tau: 0.2, decay: 0.02 },
    routing: { maxHops: 12, objectiveWeights: { latency: 0.2, cost: 0.2, risk: 0.25, trust: 0.2, freshness: 0.15 } },
    growth: { threshold: 0.2 },
    pruning: { enabled: true },
    resilience: { alternatives: 2 },
    stop: { stableTicks: 2 }
  }),
  growth: Object.freeze({
    conductivity: { alpha: 0.35, beta: 0.15, tau: 0.5, decay: 0.03 },
    routing: { maxHops: 8 },
    growth: { threshold: 0, growthReserveRatio: 0.5 },
    pruning: { enabled: false },
    resilience: { alternatives: 2 },
    stop: { stableTicks: 4 }
  }),
  resilient: Object.freeze({
    conductivity: { alpha: 0.3, beta: 0.2, tau: 0.4, decay: 0.02 },
    routing: { maxHops: 12, alternatives: 4, edgeDisjointAlternatives: true, failureDomainDisjoint: true, objectiveWeights: { latency: 0.15, cost: 0.1, risk: 0.45, trust: 0.2, freshness: 0.1 } },
    growth: { threshold: 0.15 },
    pruning: { enabled: true },
    resilience: { alternatives: 4, minRedundantPaths: 2, recoveryReserveRatio: 0.4 },
    stop: { stableTicks: 3 }
  }),
  sparse: Object.freeze({
    conductivity: { alpha: 0.2, beta: 0.3, tau: 0.3, decay: 0.05 },
    routing: { maxHops: 5, alternatives: 1 },
    growth: { threshold: 0.5 },
    pruning: { enabled: true, maxDensity: 0.3, budgetAware: true },
    resilience: { alternatives: 1 },
    stop: { stableTicks: 2 }
  }),
  persistent: Object.freeze({
    conductivity: { alpha: 0.2, beta: 0.05, tau: 0.3, decay: 0.01 },
    session: { scope: 'persistent', persistence: true },
    routing: { maxHops: 12 },
    growth: { threshold: 0.2 },
    pruning: { enabled: true },
    resilience: { automaticRepair: true },
    stop: { stableTicks: 2 }
  }),
  ephemeral: Object.freeze({
    conductivity: { alpha: 0.5, beta: 0.3, tau: 0.8, decay: 0.25 },
    session: { scope: 'mission', persistence: false },
    routing: { maxHops: 6 },
    growth: { threshold: 0 },
    pruning: { enabled: false },
    resilience: { automaticRepair: false },
    stop: { stableTicks: 2 }
  }),
  small_world: Object.freeze({
    conductivity: { alpha: 0.4, beta: 0.1, tau: 0.15, decay: 0.02 },
    routing: { maxHops: 3, preferShortPaths: true, hubWeight: 0.15, penalizeArticulationHubs: true, objectiveWeights: { latency: 0.4, cost: 0.1, risk: 0.2, trust: 0.2, freshness: 0.1 } },
    growth: { threshold: 0.1, hubCount: 2, hubConnectivity: 0.8 },
    pruning: { enabled: true },
    resilience: { alternatives: 2 },
    stop: { stableTicks: 2 }
  }),
  private: Object.freeze({
    conductivity: { alpha: 0.3, beta: 0.2, tau: 0.4, decay: 0.02 },
    routing: { maxHops: 8, privateOnly: true, enforceTrustDomains: true },
    growth: { threshold: 0.25 },
    pruning: { enabled: false },
    resilience: { automaticRepair: true, trustBound: 0.7, quarantineDuration: 600000 },
    stop: { stableTicks: 2 }
  }),
  cross_representation: Object.freeze({
    conductivity: { alpha: 0.35, beta: 0.15, tau: 0.3, decay: 0.02 },
    routing: { maxHops: 12, requireBridge: true },
    growth: { threshold: 0.2 },
    pruning: { enabled: true },
    bridges: { enabled: true, requireVerified: true, heteroBridgeCompat: 0.6 },
    stop: { stableTicks: 2 }
  }),
  procedural: Object.freeze({
    conductivity: { alpha: 0.4, beta: 0.1, tau: 0.2, decay: 0.02 },
    routing: { maxHops: 8 },
    growth: { threshold: 0 },
    propagation: { enabled: true, requireLocalEvidence: true, requireCompatibilityTrials: true, requireCausalValidation: true, algorithmSeed: 'deterministic', pipelineDepth: 6 },
    pruning: { enabled: false },
    stop: { stableTicks: 3 }
  }),
  self_healing: Object.freeze({
    conductivity: { alpha: 0.3, beta: 0.2, tau: 0.3, decay: 0.02 },
    routing: { maxHops: 12, alternatives: 4, edgeDisjointAlternatives: true },
    growth: { threshold: 0.1 },
    pruning: { enabled: true },
    resilience: { automaticRepair: true, alternatives: 4, autoReconfigure: true, maxSelfRepairRounds: 5 },
    stop: { stableTicks: 3 }
  })
});
const MISSION_SIGNALS = Object.freeze({
  private: /private|confidential|sensitive|secret|air.gapped|local.only|privé|confidentiel|sensible/i,
  self_healing: /self.heal|auto.repair|automatic repair|auto.répar|autorépar|self.recover/i,
  resilient: /resilien|résilien|failure|failover|outage|panne|crash|recovery|récupér/i,
  sparse: /low budget|limited budget|budget limité|peu de ressources|resource constrained/i,
  persistent: /persistent|long.term|long.running|workspace|project memory|durable|continu/i,
  ephemeral: /ephemeral|one.off|short.lived|temporary|mission courte|ponctuel/i,
  exploratory: /explor|unknown|inconnu|discovery|découverte|novel|research|recherche ouverte/i,
  cross_representation: /cross.representation|multi.modal|heterogeneous data|formats hétérogènes|multi.domaine/i,
  procedural: /procedure|procedural|pipeline|workflow|structured steps|étapes structurées/i,
  small_world: /low.latency|short.paths|few hops|faible latence|chemins courts/i,
  growth: /grow|growth|expand|extension du réseau|développer le réseau/i
});
const PRIORITY = Object.freeze([
  'private', 'self_healing', 'resilient', 'sparse', 'persistent', 'ephemeral',
  'cross_representation', 'procedural', 'small_world', 'exploratory', 'growth', 'routing'
]);

function resolve(name = 'routing') {
  const canonical = String(name).trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  const profile = PROFILES[canonical];
  if (!profile) throw Object.assign(new Error(`Unknown Rhizome variant '${name}'.`), { code: 'RHIZOME_VARIANT_UNKNOWN' });
  return { name: canonical, ...structuredClone(profile) };
}

function list() {
  return Object.keys(PROFILES);
}

function analyzeFit(input = {}) {
  if (input.routeFailures > 0) return { variant: 'resilient', reason: 'ROUTE_FAILURES' };
  if (input.budgetTight === true) return { variant: 'sparse', reason: 'BUDGET_CONSTRAINT' };
  if (input.unknownCapabilities > 0) return { variant: 'exploratory', reason: 'CAPABILITY_UNCERTAINTY' };
  return { variant: 'routing', reason: 'STABLE_ROUTING_NEED' };
}

function selectForMission(mission, context = {}) {
  if (context.variant || context.variantId) return explicitSelection(context.variant || context.variantId);
  return automaticSelection(mission, context.scope);
}

function automaticSelection(mission, scope) {
  const matches = missionMatches(mission);
  includePersistentScope(matches, scope);
  const variant = selectMissionVariant(matches);
  return {
    ...resolve(variant),
    selection: selectionForMatches(variant, matches)
  };
}

function selectMissionVariant(matches) {
  return [...matches].sort((left, right) => PRIORITY.indexOf(left) - PRIORITY.indexOf(right))[0] || 'routing';
}

function missionMatches(mission) {
  return Object.entries(MISSION_SIGNALS).filter(([, signal]) => signal.test(String(mission || ''))).map(([variant]) => variant);
}

function includePersistentScope(matches, scope) {
  if (['workspace', 'project', 'persistent'].includes(scope) && !matches.includes('persistent')) matches.push('persistent');
}

function selectionForMatches(variant, matches) {
  const hasMatches = matches.length > 0;
  return {
    variant, method: hasMatches ? 'mission_signals' : 'safe_baseline',
    confidence: hasMatches ? 0.8 : 0.5,
    reasons: hasMatches ? matches.map((item) => `MISSION_PROFILE:${item}`) : ['NO_DISCRIMINATING_MISSION_SIGNAL'],
    alternatives: matches.slice(1)
  };
}

function explicitSelection(name) {
  const policy = resolve(name);
  return { ...policy, selection: { variant: policy.name, method: 'explicit', confidence: 1, reasons: ['EXPLICIT_VARIANT'] } };
}

module.exports = { resolve, list, analyzeFit, selectForMission };
