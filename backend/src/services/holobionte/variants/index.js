'use strict';

const policies = Object.freeze({
  organelle: require('./organelleHolobiont'),
  adaptiveMicrobiome: require('./adaptiveMicrobiome'),
  immuneCritical: require('./immuneCritical'),
  localFirst: require('./localFirst'),
  regenerative: require('./regenerative'),
  cloudCoreEdge: define('cloud-core/edge-symbionts', {
    host: { preferredEngine: 'cloud' }, placement: { host: 'cloud', symbionts: 'edge' },
    admission: { requireEdgeLease: true, requireProvenance: true }, resources: { allocationMode: 'edge-bounded' }
  }),
  edgeCoreCloud: define('edge-core/cloud-symbionts', {
    host: { preferredEngine: 'local' }, placement: { host: 'local', remoteCapabilities: 'proxy-only' },
    admission: { minimizeRemoteData: true, redactRemoteInputs: true }, resources: { allocationMode: 'cloud-burst' }
  }),
  memoryRich: define('memory-rich', {
    host: { identity: 'persistent' }, memory: { stores: ['semantic', 'episodic', 'procedural'], requireProvenance: true },
    resources: { memoryRetention: 'verified' }
  }),
  competitivePartner: define('competitive-partner', {
    host: { partnerSelection: 'competitive' }, competition: { trialMode: 'same-budget', requireVerifiedWinner: true },
    admission: { requireEvidence: true, trialRequired: true }
  }),
  procedural: define('procedural', {
    host: { executionStyle: 'procedural', capabilityGapResponse: 'contracted-recruitment' },
    admission: { requireContract: true, requireEvidence: true, trialRequired: true }
  }),
  tool: define('tool', {
    host: { executionStyle: 'tool-specialist' }, tool: { requireManifest: true, sandbox: 'contract-bound', validateSchema: true },
    admission: { requireContract: true, requireEvidence: true, trialRequired: true }
  }),
  cloudCoreEdgeSync: define('cloud-core/edge-sync', {
    host: { preferredEngine: 'cloud' }, synchronization: { mode: 'asynchronous', requireProvenance: true, staleState: 'reject' },
    resources: { synchronization: 'verified-edge-state' }
  })
});

function define(name, overrides) {
  const { createPolicy } = require('./policyFactory');
  return createPolicy({
    name, fit: {},
    host: { identity: 'mission-scoped' }, admission: { requireContract: true, requireEvidence: true },
    resources: { allocationMode: 'bounded' }, immune: { mode: 'strict', rejectUnverified: true },
    transmission: { core: 'NONE', peripheral: 'NONE' }, succession: { enabled: false },
    stopConditions: { closeAfterMission: true }, ...overrides
  });
}

const INTENTS = Object.freeze([
  { variant: 'immuneCritical', pattern: /\b(secur|critical|auth|privacy|risk|menace|security)\w*/i, reason: 'mission_security' },
  { variant: 'localFirst', pattern: /\b(local|offline|edge|souverain|on-device)\w*/i, reason: 'locality_required' },
  { variant: 'regenerative', pattern: /\b(recover|resilien|repair|regener|recovery|résilien|restaur)\w*/i, reason: 'recovery_required' },
  { variant: 'memoryRich', pattern: /\b(memory|mémoire|histor|longitudinal|persistent|multi-mission)\w*/i, reason: 'longitudinal_memory' },
  { variant: 'competitivePartner', pattern: /\b(compare|competi|benchmark|alternatives|challeng)\w*/i, reason: 'partner_comparison' },
  { variant: 'procedural', pattern: /\b(workflow|procedure|procédure|sequence|séquence|steps|étapes)\w*/i, reason: 'procedural_execution' },
  { variant: 'tool', pattern: /\b(tool|outil|api|browser|database|base de données|execute|exécute)\w*/i, reason: 'tool_execution' },
  { variant: 'cloudCoreEdgeSync', pattern: /\b(sync|synchron|replica|réplica|distributed|distribué)\w*/i, reason: 'state_synchronization' },
  { variant: 'cloudCoreEdge', pattern: /\b(cloud|edge|hybrid|hybride|remote|distant)\w*/i, reason: 'cloud_edge_distribution' },
  { variant: 'edgeCoreCloud', pattern: /\b(private|privé|latency|latence|device|local)\w*/i, reason: 'edge_core_requirement' },
  { variant: 'adaptiveMicrobiome', pattern: /\b(adapt|evol|évol|divers|learn|apprend)\w*/i, reason: 'adaptation_required' }
]);

function normalize(name) {
  const value = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.keys(policies).find((key) => key.toLowerCase() === value)
    || Object.keys(policies).find((key) => policies[key].name.toLowerCase().replace(/[^a-z0-9]/g, '') === value);
}

function getVariant(name) {
  const policy = policies[normalize(name)];
  if (!policy) throw Object.assign(new Error('Unknown Holobiont variant.'), { code: 'HOLOBIONT_VARIANT_UNKNOWN' });
  return policy;
}

function selectForMission(mission, options = {}) {
  const explicit = options.variantId || options.variant;
  if (explicit) return selection(getVariant(explicit), { source: 'explicit', reason: 'operator_selection', mission, options });
  const intent = INTENTS.find((item) => item.pattern.test(String(mission || '')));
  const candidate = intent && policies[intent.variant];
  if (candidate && candidate.analyzeFit(options).compatible) {
    return selection(candidate, { source: 'mission_fit', reason: intent.reason, mission, options });
  }
  const baseline = policies.organelle.analyzeFit(options).compatible ? policies.organelle : policies.procedural;
  return selection(baseline, { source: 'safe_baseline', reason: 'no_compatible_specialization', mission, options });
}

function selection(policy, context) {
  const fit = policy.analyzeFit(context.options);
  if (!fit.compatible) throw Object.assign(new Error(`Holobiont variant requires: ${fit.reasons.join(', ')}.`), {
    code: 'HOLOBIONT_VARIANT_INCOMPATIBLE', details: fit
  });
  return {
    policy,
    receipt: { topology: 'holobionte', variantId: policy.name, source: context.source,
      reason: context.reason, fitScore: fit.score,
      missionFingerprint: String(context.mission || '').trim().toLowerCase().slice(0, 160) }
  };
}

module.exports = { getVariant, selectForMission, names: Object.freeze(Object.keys(policies)) };
