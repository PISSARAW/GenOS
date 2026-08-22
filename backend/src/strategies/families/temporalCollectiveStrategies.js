const { defineFamily } = require('../defineStrategy');

const temporal = defineFamily('temporal', [
  ['deterministic_replay', 'Replay déterministe', ['all'], ['deterministic', 'reproducible', 'temporal', 'low_cost'], 'implemented', ['replay', 'state_fold']],
  ['causal_replay_intervention', 'Replay causal avec intervention', ['architecture_decision', 'incident'], ['information_gain', 'temporal', 'causal'], 'implemented', ['restore', 'intervene', 'replay', 'causal_diff']],
  ['retroactive_exploration', 'Exploration rétroactive', ['architecture_decision', 'scientific_research'], ['temporal', 'information_gain'], 'implemented', ['restore', 'fork', 'alternative_future']],
  ['causal_rebase', 'Rebase causal', ['architecture_decision', 'critical_refactor'], ['temporal', 'causal', 'high_impact'], 'experimental', ['checkpoint', 'inject_change', 'replay_dependencies']],
  ['mutated_incident_universes', 'Recherche d’incident par univers mutés', ['incident'], ['temporal', 'parallel', 'mutation', 'reproducible'], 'implemented', ['production_snapshot', 'mutated_universes', 'signature_match']],
  ['partial_reproduction_refinement', 'Raffinement des reproductions partielles', ['incident'], ['temporal', 'adaptive', 'deep_search'], 'implemented', ['score_partial_repro', 'recursive_refinement']],
  ['future_ci', 'Future-CI', ['critical_refactor', 'implementation', 'architecture_decision'], ['parallel', 'reproducible', 'verification'], 'implemented', ['future_worlds', 'dependency_matrix', 'verify']],
  ['paired_functional_reproducibility', 'Reproductibilité fonctionnelle appariée', ['scientific_research', 'incident', 'security'], ['deterministic', 'reproducible', 'verification'], 'implemented', ['paired_execution', 'similarity', 'equivalence_verdict']]
]);

const collective = defineFamily('collective', [
  ['specialist_expert_committee', 'Comité d’experts spécialisés', ['critical_refactor', 'architecture_decision', 'security'], ['parallel', 'diversity', 'verification'], 'implemented', ['role_forks', 'independent_reports', 'synthesis']],
  ['blind_adversarial_review', 'Revue contradictoire aveugle', ['security', 'critical_refactor', 'implementation'], ['parallel', 'safety', 'verification'], 'implemented', ['adversarial_review', 'blind_critics']],
  ['red_blue_coevolution', 'Red Team / Blue Team / observateur neutre', ['security'], ['parallel', 'high_compute', 'safety'], 'implemented', ['security_coevolution', 'neutral_observer']],
  ['brier_weighted_consensus', 'Consensus pondéré par Brier', ['architecture_decision', 'scientific_research'], ['collective', 'calibration', 'multi_objective'], 'experimental', ['brier_scores', 'weighted_quorum']],
  ['quorum_with_abstention', 'Quorum avec abstention', ['security', 'architecture_decision'], ['collective', 'safety', 'human_gate'], 'implemented', ['quorum', 'active_refusal']],
  ['stigmergy', 'Stigmergie', ['all'], ['collective', 'low_cost', 'information_gain'], 'experimental', ['pheromone_deposit', 'trail_selection', 'evaporation']],
  ['flocking_boids', 'Flocking / Boids', ['implementation', 'architecture_decision'], ['collective', 'diversity', 'parallel'], 'experimental', ['separation', 'alignment', 'cohesion']],
  ['fish_school_search', 'Fish School Search', ['implementation', 'critical_refactor'], ['collective', 'adaptive', 'parallel'], 'experimental', ['weighted_barycenter', 'resource_shift']],
  ['slime_mould_network', 'Slime-mould / réseau adaptatif', ['architecture_decision'], ['collective', 'adaptive', 'low_cost'], 'experimental', ['path_conductivity', 'route_pruning']],
  ['grey_wolf_optimizer', 'Grey Wolf Optimizer', ['implementation', 'critical_refactor'], ['collective', 'parallel', 'deep_search'], 'experimental', ['alpha_beta_delta', 'position_update']],
  ['mycelial_routing', 'Routage mycélien', ['all'], ['collective', 'low_cost', 'specialization'], 'experimental', ['capability_route', 'knowledge_transfer']],
  ['dynamic_polyethism', 'Polyéthisme et différenciation dynamique', ['critical_refactor', 'security'], ['collective', 'adaptive', 'specialization'], 'experimental', ['role_gradient', 'dynamic_assignment']],
  ['energy_huddle', 'Huddle énergétique', ['all'], ['collective', 'budget', 'adaptive'], 'experimental', ['energy_observe', 'resource_equalize']],
  ['network_silence', 'Silence réseau', ['all'], ['low_cost', 'low_latency', 'collective'], 'implemented', ['local_buffer', 'critical_or_success_flush']],
  ['strategy_arena', 'Arena de stratégies', ['implementation', 'architecture_decision'], ['parallel', 'multi_objective', 'verification'], 'implemented', ['solver_tournament', 'elo', 'pareto']]
]);

module.exports = [...temporal, ...collective];
