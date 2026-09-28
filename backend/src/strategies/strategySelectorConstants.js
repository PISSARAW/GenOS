'use strict';

/**
 * @file strategySelectorConstants.js
 * @description Constants for strategy selection
 */

const PREFERRED_PRIMARY = {
  creative_writing: 'deterministic_direct_path',
  incident: 'mutated_incident_universes',
  unknown_cause_bug: 'falsification_forks',
  critical_refactor: 'recursive_branch_evolution',
  security: 'red_blue_coevolution',
  scientific_research: 'factorial_experiment',
  architecture_decision: 'causal_replay_intervention',
  implementation: 'n_way_counterfactual_fork',
  desktop_control: 'computer_use_direct'
};

const BRANCHES = {
  creative_writing: ['literary_creation', 'causal_twist_review', 'independent_literary_criticism'],
  incident: ['timing_and_order', 'environment_and_latency', 'state_and_cache'],
  unknown_cause_bug: ['concurrency_or_ordering', 'state_or_cache', 'configuration_or_dependency'],
  critical_refactor: ['minimal_migration', 'modular_refactor', 'architectural_replacement'],
  security: ['red_team_simulation', 'blue_team_defense', 'independent_observer'],
  scientific_research: ['baseline_hypothesis', 'competing_hypothesis', 'replication_protocol'],
  architecture_decision: ['minimal_change', 'balanced_design', 'long_term_design'],
  implementation: ['minimal_patch', 'planned_implementation', 'independent_alternative'],
  desktop_control: ['direct_gui_manipulation', 'keyboard_shortcut_path', 'verify_after_each_step']
};

const UNCERTAINTY_DEFAULTS = { unknown_cause_bug: 0.82, scientific_research: 0.74, incident: 0.78, architecture_decision: 0.62 };
const HIGH_RISK_TYPES = ['incident', 'critical_refactor', 'security'];
const HIGH_RISK_TERMS = ['deploy', 'delete', 'payment', 'production'];
const REPRODUCIBILITY_TYPES = ['incident', 'scientific_research', 'security'];
const OBJECTIVE_CONFLICT_TYPES = ['critical_refactor', 'security', 'architecture_decision'];
const TEMPORAL_TYPES = ['incident', 'architecture_decision'];
const EVALUABILITY_TERMS = ['test', 'code', 'bug', 'refactor', 'build'];
const REVERSIBILITY_TERMS = ['deploy', 'production', 'delete'];

// Source de verite : compatibilite trait <-> profil de probleme.
// weight = bonus ajoute quand le profil courant figure dans profiles.
// Un trait hors table ne donne jamais de bonus silencieux.
const TRAIT_COMPATIBILITY = Object.freeze({
  adaptive: { profiles: ['architecture_decision', 'critical_refactor', 'scientific_research'], weight: 5 },
  audit: { profiles: ['security', 'incident', 'critical_refactor'], weight: 6 },
  budget: { profiles: ['implementation', 'critical_refactor'], weight: 4 },
  calibration: { profiles: ['scientific_research', 'incident'], weight: 5 },
  causal: { profiles: ['unknown_cause_bug', 'incident', 'architecture_decision', 'scientific_research'], weight: 7 },
  collective: { profiles: ['architecture_decision', 'scientific_research'], weight: 4 },
  deep_search: { profiles: ['unknown_cause_bug', 'scientific_research'], weight: 5 },
  deterministic: { profiles: ['implementation', 'incident', 'critical_refactor'], weight: 6 },
  distributed_control: { profiles: ['security', 'critical_refactor'], weight: 4 },
  diversity: { profiles: ['scientific_research', 'architecture_decision'], weight: 4 },
  entropy: { profiles: ['security', 'incident'], weight: 4 },
  governance: { profiles: ['security', 'critical_refactor', 'architecture_decision'], weight: 6 },
  high_compute: { profiles: ['scientific_research', 'security'], weight: 3 },
  high_impact: { profiles: ['critical_refactor', 'architecture_decision'], weight: 3 },
  human_gate: { profiles: ['security', 'critical_refactor', 'incident'], weight: 6 },
  information_gain: { profiles: ['scientific_research', 'unknown_cause_bug'], weight: 6 },
  low_blast_radius: { profiles: ['implementation', 'security', 'incident'], weight: 6 },
  low_cost: { profiles: ['implementation'], weight: 4 },
  low_latency: { profiles: ['implementation', 'incident'], weight: 4 },
  memory: { profiles: ['scientific_research', 'implementation'], weight: 4 },
  metabolic_budget: { profiles: ['implementation', 'critical_refactor'], weight: 3 },
  model_routing: { profiles: ['implementation', 'scientific_research'], weight: 4 },
  multi_objective: { profiles: ['architecture_decision', 'critical_refactor'], weight: 5 },
  mutation: { profiles: ['scientific_research', 'critical_refactor'], weight: 4 },
  observability: { profiles: ['incident', 'security', 'implementation'], weight: 6 },
  parallel: { profiles: ['scientific_research', 'implementation'], weight: 4 },
  probe_control: { profiles: ['unknown_cause_bug', 'incident'], weight: 6 },
  regenerative: { profiles: ['incident', 'critical_refactor'], weight: 5 },
  reproducible: { profiles: ['incident', 'scientific_research', 'security'], weight: 7 },
  resilient: { profiles: ['incident', 'security', 'critical_refactor'], weight: 6 },
  safety: { profiles: ['security', 'incident', 'critical_refactor', 'implementation'], weight: 8 },
  selection: { profiles: ['architecture_decision', 'scientific_research'], weight: 4 },
  separation_of_duties: { profiles: ['security', 'critical_refactor'], weight: 5 },
  spatial_memory: { profiles: ['desktop_control', 'implementation'], weight: 5 },
  specialization: { profiles: ['implementation', 'critical_refactor'], weight: 4 },
  system_control: { profiles: ['desktop_control', 'security'], weight: 6 },
  temporal: { profiles: ['incident', 'architecture_decision'], weight: 5 },
  verification: { profiles: ['incident', 'unknown_cause_bug', 'security', 'implementation', 'critical_refactor'], weight: 8 },
  vision: { profiles: ['desktop_control', 'scientific_research'], weight: 5 },
});

module.exports = {
  PREFERRED_PRIMARY,
  BRANCHES,
  UNCERTAINTY_DEFAULTS,
  HIGH_RISK_TYPES,
  HIGH_RISK_TERMS,
  REPRODUCIBILITY_TYPES,
  OBJECTIVE_CONFLICT_TYPES,
  TEMPORAL_TYPES,
  EVALUABILITY_TERMS,
  REVERSIBILITY_TERMS,
  TRAIT_COMPATIBILITY,
};