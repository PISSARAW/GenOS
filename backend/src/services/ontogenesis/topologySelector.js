'use strict';

/**
 * Sélecteur déterministe topologie + workers (ADR 0235 §4).
 * Règles explicables : préférence par nature de tâche, filtres
 * d'autorisation, de capacités réelles, de ressources et d'échecs.
 * Les rôles sont validés par workerKindService (fail-closed) et les
 * variantes par le catalogue de morphogenèse, avec repli déclaré.
 */

const { resolveWorkerKind, KIND_CAPABILITIES } = require('../agents/workerKindService');
const useCases = require('../morphogenesis/registry/variantUseCaseSelector');
const variantCatalog = require('../morphogenesis/registry/variantCatalog');
const { PHENOTYPE_TOPOLOGIES: SENSORY_PREFERENCES } = require('./daemonSensorySystem');

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

function sensoryFamilies(phenotypes) {
  return (phenotypes || []).map((item) => typeof item === 'string' ? item : item.family)
    .filter((family) => SENSORY_PREFERENCES[family]);
}

function applySensoryPreference(base, phenotypes) {
  const scores = new Map(base.map((id) => [id, 0]));
  for (const family of sensoryFamilies(phenotypes)) {
    const preferred = SENSORY_PREFERENCES[family];
    preferred.forEach((id, index) => scores.set(id, (scores.get(id) || 0) + preferred.length - index));
  }
  return base.map((id, index) => ({ id, index, score: scores.get(id) || 0 }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.id);
}

function preferenceOrder(taskKind, allowed, phenotypes) {
  const base = PREFERENCES[taskKind] || allowed.slice();
  const wanted = new Set(allowed);
  return applySensoryPreference(base.filter((id) => wanted.has(id)), phenotypes);
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
  if (input.memoryLevel === 'critical' && entry.cost > 1) return 'memoire-critique';
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

function resolveVariant(topology, requested, mission) {
  if (requested && requested !== 'default') {
    const found = variantCatalog.resolveTopologyVariant(topology, requested);
    return found && found.maturity === 'implemented'
      ? { variant: found.variantId, note: null }
      : { blocked: `variante-indisponible:${requested}` };
  }
  const selected = useCases.selectVariant({ topology, mission: mission || '' });
  const found = variantCatalog.resolveTopologyVariant(topology, selected.variantId);
  if (!found || found.maturity !== 'implemented') {
    return { blocked: `baseline-indisponible:${selected.variantId}` };
  }
  return { variant: found.variantId,
    note: selected.method === 'safe_baseline' ? null : `mission-fit:${selected.method}` };
}

function selectTopology(input) {
  const rationale = [];
  const families = sensoryFamilies(input.sensoryPhenotypes);
  const ordered = preferenceOrder(input.taskKind, input.allowedTopologies || [], families);
  if (families.length) rationale.push(`sensoriel:${families.join(',')}`);
  const survivors = ordered.map((id) => CATALOG.find((entry) => entry.id === id)).filter(Boolean);
  const kept = [];
  for (const entry of survivors) {
    const reason = elimination(entry, input);
    if (reason) rationale.push(`${entry.id}:elimine:${reason}`);
    else kept.push(entry);
  }
  if (kept.length === 0) return { blocked: blockedReason(ordered), rationale, ordered, taskKind: input.taskKind };
  const winner = kept[0];
  const invalid = validateRoles(winner);
  if (invalid) return { blocked: invalid, rationale, ordered, taskKind: input.taskKind };
  const resolved = resolveVariant(winner.id, input.variant, input.mission);
  if (resolved.blocked) return { blocked: resolved.blocked, rationale, ordered,
    taskKind: input.taskKind };
  if (resolved.note) rationale.push(`${winner.id}:repli:${resolved.note}`);
  rationale.push(`${winner.id}:retenu:cout-${winner.cost}`);
  return { topology: winner.id, variant: resolved.variant, workerRoles: winner.roles.slice(), rationale, ordered, taskKind: input.taskKind };
}

module.exports = { CATALOG, PREFERENCES, SENSORY_PREFERENCES, FAILURE_LIMIT, compatibilityMatrix, selectTopology };
