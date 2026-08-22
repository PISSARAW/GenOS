const { defineFamily } = require('../defineStrategy');

const direct = defineFamily('direct', [
  ['deterministic_direct_path', 'Chemin déterministe direct', ['implementation'], ['low_cost', 'low_latency', 'deterministic'], 'implemented', ['snapshot', 'run', 'verify', 'diff', 'audit']],
  ['minimal_patch', 'Correctif minimal', ['implementation', 'unknown_cause_bug'], ['low_cost', 'deterministic', 'low_blast_radius'], 'implemented', ['snapshot', 'fork', 'minimal_mutation', 'tests', 'diff']],
  ['plan_execute_verify', 'Planifier–exécuter–vérifier', ['all'], ['verification', 'separation_of_duties'], 'implemented', ['plan', 'run', 'independent_verify']],
  ['dry_run_blast_radius', 'Dry-run avec blast radius', ['implementation', 'critical_refactor', 'security'], ['safety', 'low_cost'], 'implemented', ['vfs_dry_run', 'permission_check', 'blast_radius']],
  ['entropy_model_escalation', 'Escalade de modèle par entropie', ['all'], ['low_cost', 'entropy', 'model_routing'], 'experimental', ['slm_route', 'entropy_check', 'frontier_escalation']],
  ['provider_fallback', 'Fallback fournisseur', ['all'], ['resilient', 'low_latency'], 'implemented', ['provider_route', 'fallback_chain', 'degraded_mode']]
]);

const diagnosis = defineFamily('diagnosis', [
  ['falsifiable_hypothesis_tree', 'Arbre d’hypothèses falsifiables', ['unknown_cause_bug', 'incident', 'scientific_research'], ['information_gain', 'verification'], 'implemented', ['diagnose', 'hypothesis_evidence']],
  ['falsification_forks', 'Fork par hypothèse', ['unknown_cause_bug'], ['information_gain', 'parallel', 'reproducible'], 'implemented', ['snapshot', 'fork', 'common_probes', 'evaluate']],
  ['controlled_probe', 'Probe contrôlé avant correction', ['unknown_cause_bug', 'incident'], ['information_gain', 'low_blast_radius'], 'implemented', ['snapshot', 'probe', 'evidence', 'conditional_mutation']],
  ['bayesian_sequential_diagnosis', 'Diagnostic séquentiel bayésien', ['unknown_cause_bug', 'scientific_research'], ['information_gain', 'adaptive'], 'experimental', ['belief_update', 'expected_information_gain', 'next_probe']],
  ['causal_bisection', 'Bisection causale', ['unknown_cause_bug', 'incident'], ['deterministic', 'temporal', 'low_cost'], 'implemented', ['bisect_agent', 'snapshot_test']],
  ['loop_detection_lkgs', 'Détection de boucle et LKGS', ['all'], ['safety', 'deterministic'], 'implemented', ['analyze_trajectory', 'safe_revert']],
  ['assumption_invalidation', 'Invalidation d’hypothèse architecturale', ['architecture_decision', 'critical_refactor'], ['information_gain', 'causal'], 'implemented', ['invalidate_assumption', 'impact_graph']],
  ['cognitive_blame', 'Blame cognitif', ['all'], ['audit', 'causal', 'low_cost'], 'implemented', ['blame', 'lineage', 'provenance']]
]);

const exploration = defineFamily('exploration', [
  ['n_way_counterfactual_fork', 'Fork N-way indépendant', ['all'], ['parallel', 'information_gain', 'reproducible'], 'implemented', ['snapshot', 'fork', 'isolated_run', 'diff']],
  ['one_factor_at_a_time', 'One-factor-at-a-time', ['incident', 'scientific_research', 'unknown_cause_bug'], ['deterministic', 'causal', 'reproducible'], 'implemented', ['fork', 'single_mutation', 'paired_evaluation']],
  ['factorial_experiment', 'Expérience factorielle', ['scientific_research', 'critical_refactor'], ['high_compute', 'information_gain', 'reproducible'], 'implemented', ['heredity_experiment', 'variance_analysis']],
  ['winner_takes_branch', 'Winner-takes-branch', ['implementation'], ['selection', 'low_latency'], 'implemented', ['evaluate', 'select_winner', 'preserve_losers']],
  ['pareto_frontier', 'Front de Pareto', ['critical_refactor', 'architecture_decision', 'security', 'implementation'], ['multi_objective', 'selection'], 'implemented', ['multi_objective_evaluation', 'pareto_select']],
  ['pareto_knee_point', 'Knee-point Pareto', ['critical_refactor', 'architecture_decision', 'security'], ['multi_objective', 'selection'], 'implemented', ['pareto_frontier', 'utopia_distance']],
  ['successive_halving', 'Successive halving', ['all'], ['adaptive', 'parallel', 'budget'], 'implemented', ['minimum_evaluation', 'prune', 'reallocate']],
  ['recursive_branch_evolution', 'Évolution récursive budgétée', ['critical_refactor'], ['deep_search', 'high_compute', 'adaptive'], 'implemented', ['branch_evolution', 'recursive_fork', 'prune']],
  ['beam_search', 'Beam search', ['implementation', 'architecture_decision'], ['deep_search', 'parallel'], 'experimental', ['rank_states', 'retain_top_k', 'expand']],
  ['mcts_prm', 'MCTS + PRM', ['implementation', 'architecture_decision'], ['deep_search', 'high_compute', 'adaptive'], 'prototype', ['mcts_select', 'prm_evaluate', 'backpropagate']],
  ['simulated_annealing', 'Recuit simulé', ['critical_refactor', 'implementation'], ['mutation', 'deep_search', 'high_compute'], 'experimental', ['mutate', 'temperature_schedule', 'tests']],
  ['hypermutation_reheat', 'Réchauffage / hypermutation', ['critical_refactor', 'security', 'unknown_cause_bug'], ['mutation', 'high_compute', 'adaptive'], 'experimental', ['stagnation_check', 'hypermutation', 'affinity_selection']],
  ['genetic_strategy_algorithm', 'Algorithme génétique de stratégies', ['critical_refactor', 'security'], ['mutation', 'high_compute', 'deep_search'], 'implemented', ['select', 'breed', 'mutate', 'evaluate']],
  ['niche_exploration', 'Exploration par niches', ['critical_refactor', 'scientific_research'], ['diversity', 'high_compute'], 'experimental', ['speciation', 'niche_preservation', 'pareto_select']]
]);

module.exports = [...direct, ...diagnosis, ...exploration];
