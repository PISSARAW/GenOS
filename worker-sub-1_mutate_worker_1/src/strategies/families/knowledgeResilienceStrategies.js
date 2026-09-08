const { defineFamily } = require('../defineStrategy');

const memory = defineFamily('memory', [
  ['retrieval_first', 'Retrieval-first', ['all'], ['memory', 'low_cost', 'low_latency'], 'implemented', ['search_memory', 'similarity_rank']],
  ['golden_path_replay', 'Golden-path replay', ['implementation', 'unknown_cause_bug'], ['memory', 'low_cost', 'reproducible'], 'implemented', ['cherry_pick_golden_path', 'replay']],
  ['negative_knowledge', 'Negative knowledge', ['all'], ['memory', 'low_cost', 'safety'], 'implemented', ['search_failures', 'avoid_known_dead_ends']],
  ['experience_cherry_pick', 'Cherry-pick d’expérience', ['all'], ['memory', 'low_cost', 'causal'], 'implemented', ['cherry_pick_experience', 'preserve_provenance']],
  ['cognitive_merge', 'Fusion cognitive', ['all'], ['memory', 'verification', 'multi_objective'], 'implemented', ['experience_packets', 'knowledge_graph', 'reviewed_apply']],
  ['belief_truth_maintenance', 'Maintenance de vérité des croyances', ['scientific_research', 'incident', 'unknown_cause_bug'], ['memory', 'causal', 'verification'], 'implemented', ['belief_provenance', 'contradiction_check']],
  ['memory_compilation', 'Compilation de mémoire', ['all'], ['memory', 'low_cost'], 'implemented', ['compile_memory', 'source_refs']],
  ['stdp_plasticity', 'Plasticité STDP', ['all'], ['memory', 'adaptive'], 'experimental', ['stdp_update', 'causal_weighting']],
  ['memory_sleep_cycle', 'Cycle de sommeil mémoire', ['all'], ['memory', 'low_cost', 'budget'], 'experimental', ['prune_and_scale', 'context_compaction']],
  ['controlled_lamarckian_learning', 'Apprentissage lamarckien contrôlé', ['all'], ['memory', 'mutation', 'reproducible'], 'implemented', ['infer_traits', 'replicate', 'promote_trait']],
  ['evidence_based_breeding', 'Breeding fondé sur les preuves', ['critical_refactor', 'security'], ['mutation', 'high_compute', 'reproducible'], 'implemented', ['phenotype_evidence', 'breed', 'validate_child']],
  ['plasmid_divergent_optimization', 'Optimisation divergente sur plasmide', ['all'], ['memory', 'mutation', 'parallel', 'verification'], 'implemented', ['plasmid_divergent_fork', 'pareto_select', 'assimilate_plasmid']]
]);

const resilience = defineFamily('resilience', [
  ['zero_trust', 'Zero Trust systématique', ['all'], ['safety', 'governance', 'deterministic'], 'implemented', ['sandbox', 'permissions', 'taint_tracking']],
  ['tool_output_validation', 'Validation indépendante des sorties d’outils', ['all'], ['safety', 'verification', 'causal'], 'implemented', ['execution_receipt', 'artifact_hash', 'belief_gate']],
  ['circuit_breaker', 'Circuit breaker', ['all'], ['safety', 'resilient', 'low_latency'], 'implemented', ['failure_window', 'open', 'half_open']],
  ['apoptosis', 'Apoptose', ['all'], ['safety', 'high_impact', 'resilient'], 'implemented', ['checkpoint', 'terminate', 'autopsy']],
  ['cryptobiosis', 'Cryptobiose', ['all'], ['safety', 'resilient', 'temporal'], 'implemented', ['freeze_spore', 'persist', 'rehydrate']],
  ['checkpoint_regeneration', 'Régénération depuis checkpoint sain', ['incident', 'security', 'critical_refactor'], ['safety', 'resilient', 'temporal'], 'implemented', ['last_good_snapshot', 'restore', 'alternate_genome']],
  ['active_redundancy', 'Redondance active / hot spare', ['incident', 'security'], ['safety', 'parallel', 'high_compute'], 'experimental', ['hot_spare', 'health_switch']],
  ['dlq_autopsy', 'DLQ et autopsie', ['all'], ['safety', 'audit', 'resilient'], 'implemented', ['dead_letter_queue', 'forensic_autopsy']],
  ['cyber_immunity', 'Cyber-immunité', ['security'], ['safety', 'adaptive', 'mutation'], 'experimental', ['negative_selection', 'quarantine', 'threat_memory']],
  ['autotomy_honeypot', 'Autotomy / honeypot isolé', ['security'], ['safety', 'high_impact', 'parallel'], 'experimental', ['decoy_branch', 'observe', 'destroy_decoy']],
  ['entropy_sentinel', 'Sentinelle d’entropie', ['all'], ['safety', 'entropy', 'low_cost'], 'implemented', ['shannon_entropy', 'drift_threshold']],
  ['communication_loop_detection', 'Détection des boucles de communication', ['all'], ['safety', 'low_cost', 'collective'], 'implemented', ['message_graph', 'cycle_detection', 'artifact_gate']],
  ['execution_guardrails', 'Guardrails d’exécution', ['all'], ['safety', 'governance', 'budget'], 'implemented', ['iteration_limit', 'token_limit', 'time_limit', 'uncertainty_limit']],
  ['active_abstention_human_approval', 'Abstention active et approbation humaine', ['all'], ['safety', 'human_gate', 'governance'], 'implemented', ['uncertainty_gate', 'approval_request']],
  ['autophagy_cleanup', 'Autophagie et nettoyage', ['all'], ['low_cost', 'resilient', 'governance'], 'experimental', ['dag_mark_sweep', 'worktree_cleanup', 'cas_gc']]
]);

module.exports = [...memory, ...resilience];
