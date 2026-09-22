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
};