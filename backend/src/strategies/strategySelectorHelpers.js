/**
 * @file strategySelectorHelpers.js
 * @description Trait bonuses pour le sélecteur de stratégie.
 *
 * Les bonus axolotl sont appliqués dans applyTraitBonusesSix :
 * - strategy.axolotl (régénération fonctionnelle) bonusée quand problème structurel
 * - strategy.adaptive (plasticité) bonusée quand haute incertitude
 */

function applyTraitBonusesOne(state, traits, profile) {
  if (traits.has('information_gain')) state.score += profile.uncertainty * 24;
  if (traits.has('deep_search')) state.score += profile.complexity * 18;
  if (traits.has('safety')) state.score += profile.risk === 'high' ? 24 : 7;
  if (traits.has('reproducible') && profile.requires_reproducibility) state.score += 17;
}

function applyTraitBonusesTwo(state, traits, profile) {
  if (traits.has('temporal') && profile.temporal_dependency) state.score += 15;
  if (traits.has('multi_objective') && profile.objectives_conflict) state.score += 18;
  if (traits.has('verification') && profile.evaluability === 'deterministic_tests') state.score += 13;
  if (traits.has('low_cost')) state.score += 6;
  if (traits.has('human_gate') && profile.risk === 'high') state.score += 11;
}

function applyTraitBonusesThree(state, traits, profile) {
  if (traits.has('deterministic') && profile.requires_reproducibility) state.score += 12;
  if (traits.has('low_latency') && profile.complexity < 0.6) state.score += 10;
  if (traits.has('causal') && profile.temporal_dependency) state.score += 12;
  if (traits.has('parallel') && profile.complexity >= 0.7) state.score += 10;
}

function applyTraitBonusesFour(state, traits, profile) {
  if (traits.has('high_compute') && profile.complexity >= 0.7) state.score += 9;
  if (traits.has('diversity') && profile.uncertainty >= 0.7) state.score += 9;
  if (traits.has('specialization') && profile.type !== 'implementation') state.score += 7;
  if (traits.has('adaptive') && profile.uncertainty >= 0.7) state.score += 8;
}

function applyTraitBonusesFive(state, traits, profile) {
  if (traits.has('mutation') && profile.objectives_conflict) state.score += 5;
}

function animalControlBonus(traits, profile) {
  return [
    traits.has('probe_control') ? Number(profile.uncertainty >= 0.7) * 7 : 0,
    traits.has('spatial_memory') ? Number(profile.complexity >= 0.7) * 7 : 0,
    traits.has('metabolic_budget') ? Number(profile.complexity < 0.6) * 5 : 0
  ].reduce((sum, value) => sum + value, 0);
}

/**
 * Trait bonus axolotl — axe 3 (état larval stratégique).
 *
 * Bonus les stratégies "regenerative" quand le problème est structurel
 * (défaillance topologique, pas juste fonctionnelle).
 *
 * Bonus les stratégies "adaptive" quand l'incertitude est haute —
 * le système reste en état larvaire (plastique) pour garder sa capacité
 * de transformation.
 */
function applyTraitBonusesSix(state, traits, profile) {
  if (traits.has('regenerative') && profile.type === 'critical_refactor') state.score += 12;
  if (traits.has('regenerative') && profile.uncertainty >= 0.7) state.score += 8;
  if (traits.has('adaptive') && profile.uncertainty >= 0.7) state.score += 6;
  state.score += animalControlBonus(traits, profile);
}

module.exports = {
  applyTraitBonusesOne,
  applyTraitBonusesTwo,
  applyTraitBonusesThree,
  applyTraitBonusesFour,
  applyTraitBonusesFive,
  applyTraitBonusesSix
};
