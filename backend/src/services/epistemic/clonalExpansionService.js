'use strict';

/**
 * Clonal expansion épistémique.
 *
 * Quand un verifier gagne (affinité élevée, succès confirmé par oracle truth),
 * on crée plusieurs instances isolées de sa stratégie avec des mutations :
 *
 *   Verifier A (gagnant, affinité 0.85)
 *     ├── clone A1 : + étape de contre-exemple
 *     ├── clone A2 : inversion des étapes 2 et 3
 *     └── clone A3 : stratégie raccourcie (étapes 1,3,5 seulement)
 *
 * Chaque clone est exécuté indépendamment et sa performance est mesurée.
 * Les clones qui surpassent le parent remplacent celui-ci (affinity maturation).
 */

const crypto = require('node:crypto');

function cloneId() {
  return `clone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Mutations de stratégie :
 * - 'prepend' : ajouter une étape de contre-exemple au début
 * - 'swap' : inverser deux étapes
 * - 'truncate' : retirer la dernière étape
 * - 'duplicate' : dupliquer une étape clé
 */
const MUTATIONS = Object.freeze(['prepend', 'swap', 'truncate', 'duplicate']);

function mutateStrategy(strategy, mutation) {
  const s = strategy.slice();
  switch (mutation) {
    case 'prepend':
      return ['recherche contre-exemple', ...s];
    case 'swap':
      if (s.length < 2) return s;
      const swapped = s.slice();
      const i = 1;
      const j = Math.min(2, s.length - 1);
      const tmp = swapped[i];
      swapped[i] = swapped[j];
      swapped[j] = tmp;
      return swapped;
    case 'truncate':
      return s.length > 2 ? s.slice(0, -1) : s;
    case 'duplicate': {
      const mid = Math.floor(s.length / 2);
      const dup = s.slice();
      dup.splice(mid, 0, s[mid]);
      return dup;
    }
    default:
      return s;
  }
}

/**
 * Crée `count` clones isolés d'un verifier gagnant.
 * Chaque clone a une stratégie mutée et une affinité initiale héritée du parent.
 */
function expandClone(verifier, opts = {}) {
  const count = opts.count || 3;
  const mutations = opts.mutations || MUTATIONS;
  const clones = [];
  for (let i = 0; i < count; i += 1) {
    const mutation = mutations[i % mutations.length];
    clones.push({
      id: cloneId(),
      parentId: verifier.id || verifier.type,
      type: verifier.type,
      strategy: mutateStrategy(verifier.strategy || [], mutation),
      affinity: verifier.affinity || 0.5,
      mutation,
      isClone: true,
      usageCount: 0,
      successes: 0,
      failures: 0,
      createdAt: new Date().toISOString(),
    });
  }
  return clones;
}

/**
 * Sélectionne les clones qui surpassent le parent (affinité après résolution).
 * Si un clone a une affinité supérieure au parent, il remplace celui-ci.
 */
function selectWinningClones(parent, clones) {
  const resolved = clones.filter((c) => !c.pending && c.successes + c.failures > 0);
  if (!resolved.length) return { winner: parent, promotedClones: [] };
  const best = resolved.reduce((a, b) => (a.affinity >= b.affinity ? a : b));
  if (best.affinity > parent.affinity) {
    return { winner: best, promotedClones: [best] };
  }
  return { winner: parent, promotedClones: [] };
}

module.exports = {
  MUTATIONS,
  cloneId,
  mutateStrategy,
  expandClone,
  selectWinningClones,
};
