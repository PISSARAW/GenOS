'use strict';

const VARIANTS = Object.freeze({
  balanced: { migration: 'complementary', quorumRatio: 0.5, preserveDiversity: true },
  resilient: { migration: 'rescue', quorumRatio: 0.6, preserveDiversity: true },
  exploratory: { migration: 'novelty', quorumRatio: 0.4, preserveDiversity: true },
  conservative: { migration: 'counterexample', quorumRatio: 0.7, preserveDiversity: false },
  classic_patch: { migration: 'founder', corridorTopology: 'small-world', recolonization: true, quorumRatio: 0.5 },
  island_search: { migration: 'elite', corridorTopology: 'ring', migrationFrequency: 'periodic', preserveDiversity: true, eliteMigration: true, quorumRatio: 0.5 },
  heterogeneous_islands: { migration: 'complementary', corridorTopology: 'fully-connected', transferCulture: true, preserveDiversity: true, diversityMode: 'provider-algorithm-lineage', quorumRatio: 0.5 },
  source_sink: { migration: 'rescue', corridorTopology: 'source-sink', directedMigration: true, sourceReserveRatio: 0.2, temporalRoles: true, quorumRatio: 0.5 },
  rescue_network: { migration: 'rescue', corridorTopology: 'small-world', rescuePriority: 'at-risk', recoverySlaMs: 300000, quorumRatio: 0.6 },
  stepping_stone: { migration: 'cultural', corridorTopology: 'stepping-stone', migrationFrequency: 'rare', preserveDiversity: true, localityConstrained: true, quorumRatio: 0.45 },
  anti_synchrony: { migration: 'novelty', corridorTopology: 'adaptive', firebreaks: true, firebreakDurationMs: 120000, firebreakRecoveryThreshold: 0.35, diversityFloor: 0.3, topologyRewire: true, controlledExtinctionWithCoverage: true, quorumRatio: 0.6 },
  federated: { migration: 'cultural', corridorTopology: 'hierarchical', verifiedPropagulesOnly: true, sovereign: true, requireDataMinimizationProof: true, requireReceiverAttestation: true, quorumRatio: 0.5 },
  ephemeral_patch: { migration: 'elite', corridorTopology: 'fully-connected', ephemeral: true, cryptobioticSpore: true, fastRebind: true, quorumRatio: 0.5 },
  persistent: { migration: 'cultural', corridorTopology: 'small-world', persistResidents: true, retainRegionalMemory: true, memoryDecayRate: 0.01, quorumRatio: 0.5 },
  evolutionary: { migration: 'novelty', corridorTopology: 'ring', localEvolution: true, reproduceLocally: true, speciation: true, quorumRatio: 0.5 },
  cultural: { migration: 'cultural', corridorTopology: 'small-world', agentsResident: true, artifactsOnly: true, culturalPhylogeny: true, quorumRatio: 0.5 }
});
const DOCUMENTED_VARIANTS = Object.freeze([
  'classic_patch', 'island_search', 'heterogeneous_islands', 'source_sink', 'rescue_network',
  'stepping_stone', 'anti_synchrony', 'federated', 'ephemeral_patch', 'persistent', 'evolutionary', 'cultural'
]);
const CLASSIFICATIONS = Object.freeze(['PUBLIC', 'REGIONAL', 'SENSITIVE', 'LOCAL_ONLY']);
const VARIANT_SIGNALS = Object.freeze({
  resilient: /collapse|collapsed|recolon|effondr|recovery|recover|résilien|resilien|rescue|panne|outage|failure/i,
  exploratory: /explor|unknown|inconnu|novel|nouveau|recherche|search|hypoth|discovery|découverte/i,
  conservative: /security|sécurité|compliance|conformité|audit|strict|risk|risque|counterexample|contre-exemple|verify|vérifi/i,
  rescue_network: /critical|critique|no.function.lost|rescue.network|recolon|secours/i,
  source_sink: /source.sink|source.*sink|resource.imbalance|déséquilibre.*ressource/i,
  federated: /federat|sovereignty|souveraineté|local.only|data stays local/i,
  ephemeral_patch: /ephemeral|intermittent|temporary|temporaire|volatile.patch/i,
  persistent: /persistent|long.term|longue durée|resident|résident|between missions/i,
  evolutionary: /evolutionary|évolutionnaire|mutation|genome|génome|continuous.optimization/i,
  heterogeneous_islands: /heterogeneous|hétérogène|multi.strategy|multi.stratégie|unknown.problem/i,
  stepping_stone: /stepping.stone|sparse.migration|migration sparse|preserve.diversity/i,
  anti_synchrony: /anti.synchron|correlated.failure|échec corrélé|firebreak/i,
  island_search: /island.search|sat|\bilp\b|local.search|optimisation dure/i,
  classic_patch: /classic.patch|fixed.patches|patches fixes|extinction.*recolon/i,
  cultural: /cultural|culturel|procedures migrate|artefacts migrate/i
});

function resolveMetapopulationVariant(input = {}) {
  const requested = input.variant || input.variantId;
  const selection = requested ? explicitSelection(requested) : selectVariant(input.mission || input.goal);
  const name = selection.variant;
  const policy = VARIANTS[name];
  if (!policy) throw policyError('METAPOPULATION_VARIANT_UNKNOWN', 'Unknown metapopulation variant.');
  const scope = input.scope || (policy.persistResidents ? 'workspace' : 'mission');
  return { variant: name, policy: { ...policy }, scope,
    persistent: ['workspace', 'project', 'persistent'].includes(scope), selection };
}

function explicitSelection(name) {
  const variant = String(name || '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (!VARIANTS[variant]) throw policyError('METAPOPULATION_VARIANT_UNKNOWN', 'Unknown metapopulation variant.');
  return { variant, method: 'explicit', confidence: 1, reasons: ['EXPLICIT_VARIANT'] };
}

function selectVariant(mission) {
  const text = String(mission || '');
  const matches = Object.entries(VARIANT_SIGNALS).map(([variant, pattern]) => ({
    variant, signals: text.match(new RegExp(pattern.source, 'gi')) || []
  })).map((entry) => ({ ...entry, score: entry.signals.length }));
  matches.sort((left, right) => right.score - left.score || variantPriority(left.variant) - variantPriority(right.variant));
  const winner = matches[0];
  if (!winner || winner.score === 0) return baselineSelection();
  const total = matches.reduce((sum, entry) => sum + entry.score, 0);
  return {
    variant: winner.variant, method: 'mission_signals',
    confidence: Number((winner.score / total).toFixed(3)),
    reasons: [...new Set(winner.signals.map((signal) => `MISSION_SIGNAL:${signal.toLowerCase()}`))],
    alternatives: matches.filter((entry) => entry.score > 0).map(({ variant, score }) => ({ variant, score }))
  };
}

function baselineSelection() {
  return { variant: 'balanced', method: 'safe_baseline', confidence: 0.5, reasons: ['NO_DISCRIMINATING_MISSION_SIGNAL'] };
}

function variantPriority(variant) {
  const ordered = ['conservative', 'rescue_network', 'resilient', 'federated', 'source_sink', 'anti_synchrony',
    'ephemeral_patch', 'evolutionary', 'heterogeneous_islands', 'stepping_stone', 'island_search',
    'persistent', 'cultural', 'classic_patch', 'exploratory', 'balanced'];
  return ordered.indexOf(variant);
}

function authorizeFederationTransfer(input = {}) {
  const classification = String(input.classification || 'LOCAL_ONLY').toUpperCase();
  if (!CLASSIFICATIONS.includes(classification)) throw policyError('METAPOPULATION_CLASSIFICATION_INVALID', 'Unknown data classification.');
  const allowed = isFederationTransferAllowed(input, classification);
  return { allowed, classification, sourceRegion: input.sourceRegion || null,
    targetRegion: input.targetRegion || null, reason: allowed ? 'SOVEREIGNTY_POLICY_SATISFIED' : 'SOVEREIGNTY_POLICY_DENIED',
    transferableRefs: allowed ? (input.refs || []) : [] };
}

function assessResidentLease(input = {}) {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const expiry = Date.parse(input.expiresAt || '');
  const persistent = ['workspace', 'project', 'persistent'].includes(input.scope);
  const valid = isLeaseValid(input);
  return { daemonId: input.daemonId || null, valid, scope: input.scope || 'mission',
    expiresAt: Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
    reason: valid ? 'LEASE_ACTIVE' : persistent ? 'LEASE_EXPIRED_OR_UNPROVEN' : 'SCOPE_NOT_RESIDENT' };
}

function isFederationTransferAllowed(input, classification) {
  const trustedRegion = Boolean(input.sourceRegion && input.sourceRegion === input.targetRegion);
  return classification === 'PUBLIC' || classification === 'REGIONAL' && (trustedRegion || input.federationAgreement === true);
}

function isLeaseValid(input) {
  const persistent = ['workspace', 'project', 'persistent'].includes(input.scope);
  const expiry = Date.parse(input.expiresAt || '');
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  return persistent && Boolean(input.daemonId) && Number.isFinite(expiry) && expiry > now && input.heartbeatStatus === 'ACTIVE';
}

function policyError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { resolveMetapopulationVariant, selectVariant, authorizeFederationTransfer, assessResidentLease, VARIANTS, DOCUMENTED_VARIANTS };
