'use strict';

/**
 * Sélecteur déterministe topologie + workers (ADR 0235 §4).
 * Règles explicables : préférence par nature de tâche, filtres
 * d'autorisation, de capacités réelles, de ressources et d'échecs.
 * Les rôles sont validés par workerKindService (fail-closed) et les
 * variantes par le catalogue de morphogenèse, avec repli déclaré.
 */

const { resolveWorkerKind, KIND_CAPABILITIES } = require('../agents/workerKindService');

const CATALOG = [
  { id: 'trinity', needs: ['execute', 'verify'], roles: ['specialist', 'bounded_worker', 'verifier_worker'], cost: 2 },
  { id: 'a_team', needs: ['execute', 'coordinate'], roles: ['sub_orchestrator', 'specialist', 'bounded_worker', 'verifier_worker'], cost: 2 },
  { id: 'biocenose', needs: ['execute', 'verify', 'coordinate'], roles: ['liaison_worker', 'bounded_worker', 'verifier_worker'], cost: 2 },
  { id: 'holobionte', needs: ['execute', 'verify'], roles: ['specialist', 'symbiotic_worker', 'verifier_worker'], cost: 3 },
  { id: 'syncytium', needs: ['execute', 'analyze'], roles: ['specialist', 'bounded_worker', 'verifier_worker'], cost: 3 },
  { id: 'biome', needs: ['execute', 'observe'], roles: ['adaptive_worker', 'scout_cell'], cost: 1 },
  { id: 'rhizome', needs: ['execute', 'observe'], roles: ['bounded_worker', 'scout_cell'], cost: 1 },
  { id: 'metapopulation', needs: ['execute', 'verify'], roles: ['bounded_worker', 'verifier_worker'], cost: 2 }
];

const PREFERENCES = {
  implement: ['a_team', 'trinity', 'rhizome', 'biome', 'metapopulation', 'syncytium', 'biocenose', 'holobionte'],
  verify: ['biocenose', 'trinity', 'metapopulation', 'a_team', 'syncytium', 'holobionte', 'rhizome', 'biome'],
  explore: ['rhizome', 'biome', 'metapopulation', 'trinity', 'a_team', 'biocenose', 'syncytium', 'holobionte'],
  decide: ['biocenose', 'trinity', 'holobionte', 'metapopulation', 'a_team', 'syncytium', 'rhizome', 'biome'],
  repair: ['a_team', 'biome', 'metapopulation', 'rhizome', 'trinity', 'syncytium', 'biocenose', 'holobionte']
};

const FAILURE_LIMIT = 2;

function compatibilityMatrix() {
  return CATALOG.map((entry) => ({
    topology: entry.id, needs: entry.needs.slice(),
    workerRoles: entry.roles.slice(), costClass: entry.cost
  }));
}

function preferenceOrder(taskKind, allowed) {
  const base = PREFERENCES[taskKind] || allowed.slice();
  const wanted = new Set(allowed);
  return base.filter((id) => wanted.has(id));
}

function missingCapability(entry, available) {
  return entry.needs.find((need) => !available.includes(need)) || null;
}

function failureCount(failures, topology) {
  return (failures || []).filter((failure) => failure.topology === topology).length;
}

function elimination(entry, input) {
  const missing = missingCapability(entry, input.availableCapabilities);
  if (missing) return `capacite-manquante:${missing}`;
  if (input.memoryLevel === 'constrained' && entry.cost >= 3) return 'tache-lourde-reportee';
  if (input.memoryLevel === 'critical') return 'memoire-critique';
  if (failureCount(input.failures, entry.id) >= FAILURE_LIMIT) return 'echecs-repetes';
  return null;
}

function blockedReason(ordered) {
  if (ordered.length === 0) return 'aucune-topologie-autorisee';
  return 'aucune-topologie-admissible';
}

function validateRoles(entry) {
  try {
    entry.roles.forEach((role) => resolveWorkerKind(role));
    return missingRoleCapability(entry);
  } catch (_) {
    return 'role-worker-inconnu';
  }
}

function roleCapabilities(role) {
  try {
    return KIND_CAPABILITIES[resolveWorkerKind(role)] || [];
  } catch (_) {
    return [];
  }
}

function missingRoleCapability(entry) {
  const union = new Set();
  for (const role of entry.roles) {
    for (const capability of roleCapabilities(role)) union.add(capability);
  }
  const missing = entry.needs.find((need) => !union.has(need));
  return missing ? `topologie-incoherente:${missing}` : null;
}

function resolveVariant(topology, requested) {
  if (!requested || requested === 'default') return { variant: 'default', note: null };
  try {
    const catalog = require('../morphogenesis/registry/variantCatalog');
    const known = catalog.topologyVariants(topology) || [];
    const found = known.find((variant) => variant.variantId === requested);
    if (found && found.maturity === 'implemented') return { variant: requested, note: null };
    return { variant: 'default', note: `variante-indisponible:${requested}` };
  } catch (_) {
    return { variant: 'default', note: 'catalogue-indisponible' };
  }
}

function selectTopology(input) {
  const rationale = [];
  const ordered = preferenceOrder(input.taskKind, input.allowedTopologies || []);
  const survivors = ordered.map((id) => CATALOG.find((entry) => entry.id === id)).filter(Boolean);
  const kept = [];
  for (const entry of survivors) {
    const reason = elimination(entry, input);
    if (reason) rationale.push(`${entry.id}:elimine:${reason}`);
    else kept.push(entry);
  }
  if (kept.length === 0) return { blocked: blockedReason(ordered), rationale };
  const winner = kept[0];
  const invalid = validateRoles(winner);
  if (invalid) return { blocked: invalid, rationale };
  const resolved = resolveVariant(winner.id, input.variant);
  if (resolved.note) rationale.push(`${winner.id}:repli:${resolved.note}`);
  rationale.push(`${winner.id}:retenu:cout-${winner.cost}`);
  return { topology: winner.id, variant: resolved.variant, workerRoles: winner.roles.slice(), rationale };
}

module.exports = { CATALOG, PREFERENCES, FAILURE_LIMIT, compatibilityMatrix, selectTopology };
