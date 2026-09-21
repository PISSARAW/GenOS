'use strict';

/**
 * Affinity maturation épistémique.
 *
 * Après qu'un problème a été résolu (oracle truth disponible),
 * on fait muter les stratégies de vérification qui ont participé :
 *
 * generation 1 : "relire le code"
 *   → trop de faux positifs (Brier 0.42)
 *
 * generation 2 : "chercher un cas limite"
 *   → meilleur (Brier 0.28)
 *
 * generation 3 : "générer input frontière + comparer old/new"
 *   → encore meilleur (Brier 0.15)
 *
 * La mutation n'est pas aléatoire : on identifie la source d'erreur
 * et on applique une mutation ciblée.
 */

const MUTATIONS = Object.freeze([
  'add_counterexample',
  'add_boundary_test',
  'deepen_search',
  'narrow_scope',
  'swap_steps',
]);

/**
 * Analyse la source d'erreur d'une stratégie :
 * - 'false_positive' : la stratégie a produit un faux positif
 * - 'false_negative' : la stratégie a manqué un cas
 * - 'incomplete' : la stratégie est trop superficielle
 * - 'no_error' : pas d'erreur détectée
 */
function diagnoseError(verification, oracleTruth) {
  if (!verification || !oracleTruth) return 'incomplete';
  if (verification.falsePositive) return 'false_positive';
  if (verification.falseNegative) return 'false_negative';
  if (!verification.complete) return 'incomplete';
  return 'no_error';
}

/**
 * Choisit une mutation ciblée selon le diagnostic.
 */
function targetedMutation(diagnosis) {
  switch (diagnosis) {
    case 'false_positive':
      return 'narrow_scope';
    case 'false_negative':
      return 'add_counterexample';
    case 'incomplete':
      return 'deepen_search';
    default:
      return 'swap_steps';
  }
}

/**
 * Applique une mutation à une stratégie de vérification.
 */
function applyMutation(strategy, mutation) {
  const s = strategy.slice();
  switch (mutation) {
    case 'add_counterexample':
      return [...s, 'générer contre-exemple'];
    case 'add_boundary_test':
      return [...s, 'tester cas frontière'];
    case 'deepen_search':
      return [...s, 'recherche approfondie'];
    case 'narrow_scope':
      return s.filter((step) => !step.includes('recherche'));
    case 'swap_steps':
      if (s.length < 2) return s;
      return [s[1], s[0], ...s.slice(2)];
    default:
      return s;
  }
}

/**
 * Fait muter une stratégie après résolution par oracle truth.
 * Retourne la nouvelle stratégie et le diagnostic.
 */
function matureStrategy(verification, oracleTruth) {
  const diagnosis = diagnoseError(verification, oracleTruth);
  const mutation = targetedMutation(diagnosis);
  const newStrategy = applyMutation(verification.strategy || [], mutation);
  return {
    diagnosis,
    mutation,
    newStrategy,
    previousStrategy: verification.strategy || [],
  };
}

/**
 * Met à jour l'historique Brier d'une stratégie.
 * Si le nouveau Brier est meilleur, la mutation est conservée.
 */
function updateBrierHistory(history, brierScore) {
  const h = history.slice();
  h.push(brierScore);
  return h;
}

/**
 * Décide si une mutation doit être adoptée.
 * Une mutation est adoptée si elle améliore le Brier moyen.
 */
function shouldAdoptMutation(previousBriers, newBrier) {
  if (!previousBriers.length) return true;
  const mean = previousBriers.reduce((a, b) => a + b, 0) / previousBriers.length;
  return newBrier < mean;
}

module.exports = {
  MUTATIONS,
  diagnoseError,
  targetedMutation,
  applyMutation,
  matureStrategy,
  updateBrierHistory,
  shouldAdoptMutation,
};
