'use strict';

/**
 * @file conceptRegistryService.js
 * @description Canonical Concept Registry — THE single source of truth for all
 * GenOS concepts. Everything else (CAPABILITY_TOOLS, leases, topology
 * compatibilities, prompts) is GENERATED from this registry.
 */

const KINDS = new Set(['strategy', 'capability', 'tool', 'primitive', 'handler',
  'topology', 'phenotype', 'daemon', 'relation', 'signal', 'stigmergy',
  'sandbox', 'routing', 'inference', 'philosophy']);

const KIND_AUTH = {
  strategy: ['read', 'execute'], capability: ['read'], tool: ['execute'],
  primitive: ['execute'], handler: ['execute'], topology: ['read'],
  phenotype: ['read', 'spawn'], daemon: ['read', 'execute', 'spawn'],
  relation: ['read', 'write'], signal: ['read'], stigmergy: ['execute', 'write'],
  sandbox: ['execute', 'delegate'], routing: ['read', 'execute'],
  inference: ['execute', 'delegate'], philosophy: ['read']
};

const DEF_COST = { tokenCost: 50, latency: 1, risk: 1, reversibility: 'high' };
const ALL_TOPO = ['trinity', 'a_team', 'biome', 'biocenose', 'holobionte', 'syncytium', 'rhizome', 'metapopulation'];

// ── COMPACT RAW DEFINITIONS ──────────────────────────────────────
// Keys: k=kind a=aliases d=description c=capabilities t=tools pr=primitives
// st=strategies tp=compatibleTopologies m=maturity cm=costModel e=effects
const RAW = {
  evidence_first: { k: 'philosophy', a: ['Evidence First'], d: 'Claims require evidence before promotion', e: ['gate:promotion_on_evidence'], tp: ALL_TOPO },
  epistemic_humility: { k: 'philosophy', a: ['Humilité épistémique'], d: 'Uncertainty disclosure', e: ['gate:uncertainty_disclosure'], tp: ALL_TOPO },
  falsification_principle: { k: 'philosophy', a: ['Principe de falsifiabilité'], d: 'Hypotheses must be falsifiable', e: ['gate:hypothesis_falsifiable'], tp: ['trinity', 'biocenose', 'holobionte'] },
  provenance_integrity: { k: 'philosophy', a: ['Intégrité de provenance'], d: 'Full lineage tracking', e: ['gate:lineage_tracked'], tp: ['trinity', 'holobionte', 'syncytium'] },
  reversibility_maximum: { k: 'philosophy', a: ['Réversibilité maximale'], d: 'Every mutation has rollback', e: ['gate:rollback_always_possible'], tp: ['holobionte', 'syncytium', 'rhizome'] },
  trinity: { k: 'topology', a: ['Trinity'], d: 'Coordinator/Worker/Reviewer triad', c: ['STRATEGY_PORTFOLIO', 'EVIDENCE_BARRIER', 'EPISTEMICS_BRIER', 'HALLUCINATION_MONITORING', 'ARENA_COMPETITION', 'PROMOTION_GATE', 'TOKEN_ECONOMY', 'GRAPH_MEMORY', 'PROVENANCE', 'OBSERVABILITY'] },
  a_team: { k: 'topology', a: ['A-Team'], d: 'Specialized domain experts', c: ['STRATEGY_PORTFOLIO', 'EVIDENCE_BARRIER', 'SIGNALING_BUS', 'LIGAND_RECEPTOR', 'ARENA_COMPETITION', 'TOKEN_ECONOMY', 'GRAPH_MEMORY', 'WEB_FORAGING', 'OBSERVABILITY'] },
  biome: { k: 'topology', a: ['Biome'], d: 'Ecological stigmergic coordination', c: ['TOKEN_ECONOMY', 'STIGMERGY', 'SWARM_METRICS', 'QUORUM', 'WEB_FORAGING', 'FOVEAL_PERCEPTION', 'EPISODIC_MEMORY', 'RESILIENCE_RECOVERY'] },
  biocenose: { k: 'topology', a: ['Biocénose'], d: 'Weighted consensus broadcast', c: ['QUORUM', 'EPISTEMICS_BRIER', 'ARENA_COMPETITION', 'EVIDENCE_BARRIER', 'SWARM_METRICS', 'SIGNALING_BUS', 'PROMOTION_GATE'] },
  holobionte: { k: 'topology', a: ['Holobionte'], d: 'Host-controlled immune system', c: ['IMMUNE_SYSTEM', 'CONSCIENCE_HOMEOSTASIS', 'LOCAL_INFERENCE', 'INFERENCE_GATEWAY', 'GRAPH_MEMORY', 'EPISODIC_MEMORY', 'GENOME_EPIGENETICS', 'SIGNALING_BUS', 'PROCEDURAL_MEMORY', 'PROCEDURAL_GUIDANCE', 'PROCEDURAL_EVOLUTION', 'PROCEDURAL_CAUSAL_VALIDATION'] },
  syncytium: { k: 'topology', a: ['Syncyte'], d: 'CRDT shared state sync', c: ['CRDT_SHARED_STATE', 'SIGNALING_BUS', 'VFS_SANDBOX', 'OUTPUT_GOVERNOR', 'LOCAL_INFERENCE', 'OBSERVABILITY'] },
  rhizome: { k: 'topology', a: ['Rhizome'], d: 'Distributed mesh routing', c: ['SIGNALING_BUS', 'LIGAND_RECEPTOR', 'STIGMERGY', 'STRATEGY_ADAPTATION', 'GRAPH_MEMORY', 'WEB_FORAGING'] },
  metapopulation: { k: 'topology', a: ['Métapopulation'], d: 'Lineage recovery neighbors', c: ['QUORUM', 'SYNAPTIC_PLASTICITY', 'RESILIENCE_RECOVERY', 'GENOME_EPIGENETICS', 'SWARM_METRICS', 'EPISODIC_MEMORY'] },
  specialist_expert_committee: { k: 'phenotype', a: ['Comité d’experts spécialisés'], d: 'Parallel expert role-forks', c: ['SIGNALING_BUS', 'EVIDENCE_BARRIER', 'PROVENANCE', 'OBSERVABILITY'], tp: ['a_team', 'trinity'], pr: ['role_forks', 'independent_reports', 'synthesis'] },
  blind_adversarial_review: { k: 'phenotype', a: ['Revue contradictoire aveugle'], d: 'Security blind critique', c: ['ARENA_COMPETITION', 'HALLUCINATION_MONITORING', 'EVIDENCE_BARRIER', 'IMMUNE_SYSTEM'], tp: ['trinity', 'a_team', 'biocenose'], pr: ['adversarial_review', 'blind_critics'] },
  red_blue_coevolution: { k: 'phenotype', a: ['Red/Blue Coevolution'], d: 'Adversarial coevolution', c: ['ARENA_COMPETITION', 'IMMUNE_SYSTEM', 'EVIDENCE_BARRIER', 'PROMOTION_GATE'], tp: ['trinity', 'biocenose'], pr: ['security_coevolution', 'neutral_observer'] },
  brier_weighted_consensus: { k: 'phenotype', a: ['Consensus Brier'], d: 'Calibrated weighted quorum', c: ['EPISTEMICS_BRIER', 'EVIDENCE_BARRIER', 'QUORUM'], tp: ['biocenose', 'metapopulation'], pr: ['brier_scores', 'weighted_quorum'] },
  quorum_with_abstention: { k: 'phenotype', a: ['Quorum avec abstention'], d: 'Safety-aware quorum', c: ['QUORUM', 'EPISTEMICS_BRIER', 'EVIDENCE_BARRIER'], tp: ['biocenose', 'metapopulation'], pr: ['quorum', 'active_refusal'] },
  stigmergy_org: { k: 'phenotype', a: ['Stigmergie'], d: 'Env trace coordination', c: ['STIGMERGY', 'SIGNALING_BUS', 'SWARM_METRICS'], tp: ['biome', 'rhizome'], pr: ['pheromone_deposit', 'trail_selection', 'evaporation'] },
  flocking_boids: { k: 'phenotype', a: ['Flocking/Boids'], d: 'Separation/alignment/cohesion', c: ['SWARM_METRICS', 'SIGNALING_BUS'], tp: ['biome'], pr: ['separation', 'alignment', 'cohesion'] },
  fish_school_search: { k: 'phenotype', a: ['Fish School Search'], d: 'Weighted barycenter search', c: ['SWARM_METRICS', 'SIGNALING_BUS'], tp: ['biome'], pr: ['weighted_barycenter', 'resource_shift'] },
  slime_mould_network: { k: 'phenotype', a: ['Slime-mould'], d: 'Adaptive path conductivity', c: ['STIGMERGY', 'SIGNALING_BUS', 'STRATEGY_ADAPTATION'], tp: ['rhizome'], pr: ['path_conductivity', 'route_pruning'] },
  grey_wolf_optimizer: { k: 'phenotype', a: ['Grey Wolf Optimizer'], d: 'Alpha/beta/delta swarm opt', c: ['SWARM_METRICS', 'TOKEN_ECONOMY'], tp: ['biome'], pr: ['alpha_beta_delta', 'position_update'] },
  mycelial_routing: { k: 'phenotype', a: ['Routage mycélien'], d: 'Capability mesh routing', c: ['LIGAND_RECEPTOR', 'SIGNALING_BUS', 'STRATEGY_ADAPTATION'], tp: ['rhizome'], pr: ['capability_route', 'knowledge_transfer'] },
  dynamic_polyethism: { k: 'phenotype', a: ['Polyéthisme dynamique'], d: 'Role gradient assign', c: ['STRATEGY_ADAPTATION', 'LIGAND_RECEPTOR'], tp: ['biome', 'holobionte'], pr: ['role_gradient', 'dynamic_assignment'] },
  energy_huddle: { k: 'phenotype', a: ['Huddle énergétique'], d: 'Energy resource equalization', c: ['TOKEN_ECONOMY', 'SWARM_METRICS'], tp: ['biome'], pr: ['energy_observe', 'resource_equalize'] },
  network_silence: { k: 'phenotype', a: ['Silence réseau'], d: 'Local buffer critical flush', c: ['CAPSULES_SNAPSHOTS', 'VFS_SANDBOX'], tp: ['syncytium'], pr: ['local_buffer', 'critical_or_success_flush'] },
  strategy_arena: { k: 'phenotype', a: ['Arena de stratégies'], d: 'Multi-objective tournament', c: ['ARENA_COMPETITION', 'STRATEGY_PORTFOLIO', 'PROMOTION_GATE'], tp: ['trinity', 'biocenose'], pr: ['solver_tournament', 'elo', 'pareto'] },
  hierarchical_merge: { k: 'phenotype', a: ['Merge hiérarchique'], d: 'Evidence-barrier provenance merge', c: ['EVIDENCE_BARRIER', 'PROVENANCE', 'PROMOTION_GATE'], tp: ['trinity', 'holobionte'], pr: ['merge', 'causal_merge'] },
  competitive_arena: { k: 'phenotype', a: ['Arena compétitive'], d: 'Adversarial epistemic arena', c: ['ARENA_COMPETITION', 'EPISTEMICS_BRIER'], tp: ['trinity', 'biocenose'], pr: ['adversarial_review', 'evaluate'] },
  isolated_recovery: { k: 'phenotype', a: ['Recovery isolée'], d: 'Chaos engineering recovery', c: ['RESILIENCE_RECOVERY', 'CAPSULES_SNAPSHOTS', 'CHAOS_ENGINEERING'], tp: ['holobionte', 'syncytium'], pr: ['last_good_snapshot', 'restore'] },
  memory_compilation: { k: 'phenotype', a: ['Compilation mémoire'], d: 'Multi-modal memory compile', c: ['GRAPH_MEMORY', 'VECTOR_MEMORY', 'EPISODIC_MEMORY'], tp: ['holobionte', 'metapopulation'], pr: ['compile_memory', 'source_refs'] },
  waggle_dance: { k: 'signal', a: ['Danse frétillante'], d: 'Recruitment signal', e: ['signal:recruitment'], c: ['SIGNALING_BUS'], tp: ['biome', 'rhizome', 'biocenose'], pr: ['publish_waggle_signal', 'validate_recruitment'] },
  pheromone_trail: { k: 'signal', a: ['Piste phromonale'], d: 'Stigmergic trail signal', e: ['signal:stigmergy'], c: ['SIGNALING_BUS'], tp: ['biome', 'rhizome'], pr: ['pheromone_deposit', 'trail_selection'] },
  action_potential: { k: 'signal', a: ["Potentiel d'action"], d: 'Depolarization signal', e: ['signal:depolarization'], c: ['SIGNALING_BUS'], tp: ['biome', 'holobionte'], pr: ['detect_weak_signal', 'amplify_anomaly'] },
  ligand_binding: { k: 'signal', a: ['Liaison ligand'], d: 'Receptor activation', e: ['signal:receptor_activation'], c: ['LIGAND_RECEPTOR'], tp: ['rhizome', 'biome', 'holobionte'], pr: ['capability_route'] },
  cytokine_storm: { k: 'signal', a: ['Tempête de cytokines'], d: 'Immune activation cascade', e: ['signal:immune_activation'], c: ['IMMUNE_SYSTEM'], tp: ['holobionte', 'biocenose'], pr: ['adversarial_challenge', 'quarantine'] },
  quorum_sensing: { k: 'signal', a: ['Quorum sensing'], d: 'Density-dependent activation', e: ['signal:density_dependent'], c: ['QUORUM', 'SIGNALING_BUS'], tp: ['biocenose', 'biome'], pr: ['quorum'] },
  trace_deposit: { k: 'stigmergy', a: ['Dépôt de trace'], d: 'Env trace marking', pr: ['pheromone_deposit'], e: ['stigmergy:environment_marked'], c: ['STIGMERGY'], tp: ['biome', 'rhizome'] },
  trail_reinforcement: { k: 'stigmergy', a: ['Renforcement de sentier'], d: 'Path positive feedback', pr: ['trail_selection'], e: ['stigmergy:path_strengthened'], c: ['STIGMERGY'], tp: ['biome', 'rhizome'] },
  evaporation_concept: { k: 'stigmergy', a: ['Évaporation'], d: 'Trace decay', pr: ['evaporation'], e: ['stigmergy:trace_decayed'], c: ['STIGMERGY'], tp: ['biome', 'rhizome'] },
  route_pruning_concept: { k: 'stigmergy', a: ['Élagage de route'], d: 'Suboptimal path removal', pr: ['route_pruning'], e: ['stigmergy:suboptimal_removed'], c: ['STIGMERGY'], tp: ['biome', 'rhizome'] },
  vfs_sandbox: { k: 'sandbox', a: ['Bac à sable VFS'], d: 'Isolated FS sandbox', c: ['VFS_SANDBOX'], pr: ['vfs_dry_run'], e: ['sandbox:isolated_fs'], tp: ['syncytium', 'holobionte'] },
  dry_run: { k: 'sandbox', a: ['Simulation dry-run'], d: 'Non-mutating simulation', pr: ['vfs_dry_run'], e: ['sandbox:mutation_simulated'], tp: ['syncytium', 'holobionte'] },
  permission_check: { k: 'sandbox', a: ['Vérification permissions'], d: 'Permission validation', pr: ['permission_check'], e: ['sandbox:access_validated'], tp: ['syncytium', 'holobionte'] },
  blast_radius: { k: 'sandbox', a: ['Blast radius analysis'], d: 'Impact bounding', pr: ['blast_radius'], e: ['sandbox:impact_bounded'], tp: ['syncytium', 'holobionte'] },
  model_routing: { k: 'routing', a: ['Routage de modèle'], d: 'SLM-to-frontier entropy routing', c: ['MODEL_ROUTING'], pr: ['slm_route', 'entropy_check', 'frontier_escalation'], e: ['routing:model_selected'], tp: ['holobionte', 'syncytium'] },
  provider_fallback_concept: { k: 'routing', a: ['Fallback fournisseur'], d: 'Degraded-mode fallback chain', pr: ['provider_fallback', 'fallback_chain', 'degraded_mode'], e: ['routing:degraded_path'], tp: ['holobionte', 'syncytium'] },
  capability_routing_concept: { k: 'routing', a: ['Routage par capacité'], d: 'Capability-mesh routing', pr: ['capability_route'], e: ['routing:capability_matched'], c: ['LIGAND_RECEPTOR'], tp: ['rhizome', 'biome'] },
  inference_gateway: { k: 'routing', a: ["Passerelle d'inférence"], d: 'Unified inference dispatch', c: ['INFERENCE_GATEWAY'], e: ['routing:inference_dispatched'], tp: ['holobionte', 'trinity', 'syncytium'] },
  local_inference: { k: 'inference', a: ['Inférence locale'], d: 'On-device inference', c: ['LOCAL_INFERENCE'], e: ['inference:local_model'], cm: { tokenCost: 0, latency: 1, risk: 1, reversibility: 'high' }, tp: ['holobionte', 'syncytium'] },
  frontier_escalation: { k: 'inference', a: ['Escalade frontier'], d: 'Frontier escalation', pr: ['frontier_escalation'], e: ['inference:stronger_model'], cm: { tokenCost: 200, latency: 3, risk: 2, reversibility: 'high' }, tp: ['holobionte', 'trinity', 'syncytium'] },
  entropy_gating: { k: 'inference', a: ['Péage entropique'], d: 'Shannon entropy gate', pr: ['entropy_check'], e: ['inference:confidence_gate'], cm: { tokenCost: 10, latency: 1, risk: 1, reversibility: 'high' }, tp: ['holobionte', 'syncytium'] },
  calibrated_quorum: { k: 'inference', a: ['Quorum calibré'], d: 'Brier weighted aggregation', pr: ['brier_scores'], e: ['inference:weighted_aggregate'], cm: { tokenCost: 150, latency: 2, risk: 2, reversibility: 'medium' }, tp: ['biocenose', 'metapopulation'] },
  deterministic_direct_path: { k: 'strategy', a: ['Chemin déterministe direct'], d: 'Low-cost deterministic path', st: ['direct'], pr: ['snapshot', 'run', 'verify', 'diff', 'audit'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  minimal_patch: { k: 'strategy', a: ['Correctif minimal'], d: 'Low blast radius mutation', st: ['direct'], pr: ['snapshot', 'fork', 'minimal_mutation', 'tests', 'diff'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  plan_execute_verify: { k: 'strategy', a: ['Planifier–exécuter–vérifier'], d: 'Plan/run/verify', st: ['direct'], pr: ['plan', 'run', 'independent_verify'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  dry_run_blast_radius_concept: { k: 'strategy', a: ['Dry-run avec blast radius'], d: 'Safety dry-run', st: ['direct'], pr: ['vfs_dry_run', 'permission_check', 'blast_radius'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  entropy_model_escalation_concept: { k: 'strategy', a: ['Escalade par entropie'], d: 'SLM-to-frontier entropy escalation', st: ['direct'], pr: ['slm_route', 'entropy_check', 'frontier_escalation'], cm: { tokenCost: 200, latency: 2, risk: 2, reversibility: 'high' }, m: 'ready' },
  provider_fallback_strategy: { k: 'strategy', a: ['Fallback fournisseur'], d: 'Provider fallback', st: ['direct'], pr: ['provider_route', 'fallback_chain', 'degraded_mode'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  computer_use_direct_concept: { k: 'strategy', a: ['Contrôle natif PC'], d: 'Vision-based system control', st: ['direct'], pr: ['capture', 'run_plan', 'verify'], cm: { tokenCost: 100, latency: 1, risk: 2, reversibility: 'medium' }, m: 'ready' },
  falsifiable_hypothesis_tree: { k: 'strategy', a: ['Arbre d’hypothèses'], d: 'Hypothesis tree', st: ['diagnosis'], pr: ['diagnose', 'hypothesis_evidence'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  falsification_forks: { k: 'strategy', a: ['Fork par hypothèse'], d: 'Parallel hypothesis fork', st: ['diagnosis'], pr: ['snapshot', 'fork', 'common_probes', 'evaluate'], cm: { tokenCost: 400, latency: 3, risk: 1, reversibility: 'high' }, m: 'ready' },
  controlled_probe: { k: 'strategy', a: ['Probe contrôlé'], d: 'Low blast radius probe', st: ['diagnosis'], pr: ['snapshot', 'probe', 'evidence', 'conditional_mutation'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  bayesian_sequential_diagnosis: { k: 'strategy', a: ['Diagnostic bayésien'], d: 'Adaptive belief update', st: ['diagnosis'], pr: ['belief_update', 'expected_information_gain', 'next_probe'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  causal_bisection: { k: 'strategy', a: ['Bisection causale'], d: 'Deterministic bisection', st: ['diagnosis'], pr: ['bisect_agent', 'snapshot_test'], cm: { tokenCost: 100, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  loop_detection_lkgs: { k: 'strategy', a: ['Détection boucle LKGS'], d: 'Loop detection', st: ['diagnosis'], pr: ['analyze_trajectory', 'safe_revert'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  assumption_invalidation: { k: 'strategy', a: ['Invalidation hypothèse'], d: 'Causal invalidation', st: ['diagnosis'], pr: ['invalidate_assumption', 'impact_graph'], cm: { tokenCost: 200, latency: 2, risk: 2, reversibility: 'medium' }, m: 'ready' },
  diagnose_baseline: { k: 'strategy', a: ['Diagnostic de référence'], d: 'Baseline diagnosis', st: ['diagnosis'], pr: ['diagnose', 'hypothesis_evidence'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  n_way_counterfactual_fork: { k: 'strategy', a: ['Fork N-way'], d: 'Parallel reproducible fork', st: ['exploration'], pr: ['snapshot', 'fork', 'isolated_run', 'diff'], cm: { tokenCost: 400, latency: 3, risk: 1, reversibility: 'high' }, m: 'ready' },
  one_factor_at_a_time: { k: 'strategy', a: ['One-factor-at-a-time'], d: 'OFAT', st: ['exploration'], pr: ['fork', 'single_mutation', 'paired_evaluation'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  factorial_experiment_concept: { k: 'strategy', a: ['Expérience factorielle'], d: 'Factorial experiment', st: ['exploration'], pr: ['heredity_experiment', 'variance_analysis'], cm: { tokenCost: 500, latency: 4, risk: 2, reversibility: 'high' }, m: 'ready' },
  winner_takes_branch: { k: 'strategy', a: ['Winner-takes-branch'], d: 'Selection branch', st: ['exploration'], pr: ['evaluate', 'select_winner', 'preserve_losers'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  pareto_frontier_concept: { k: 'strategy', a: ['Front de Pareto'], d: 'Pareto frontier', st: ['exploration'], pr: ['multi_objective_evaluation', 'pareto_select'], cm: { tokenCost: 300, latency: 3, risk: 1, reversibility: 'high' }, m: 'ready' },
  pareto_knee_point: { k: 'strategy', a: ['Knee-point Pareto'], d: 'Utopia knee', st: ['exploration'], pr: ['pareto_frontier', 'utopia_distance'], cm: { tokenCost: 300, latency: 3, risk: 1, reversibility: 'high' }, m: 'ready' },
  successive_halving: { k: 'strategy', a: ['Successive halving'], d: 'Adaptive halving', st: ['exploration'], pr: ['minimum_evaluation', 'prune', 'reallocate'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  recursive_branch_evolution: { k: 'strategy', a: ['Évolution récursive'], d: 'Budget evolution', st: ['exploration'], pr: ['branch_evolution', 'recursive_fork', 'prune'], cm: { tokenCost: 500, latency: 4, risk: 3, reversibility: 'medium' }, m: 'ready' },
  beam_search_concept: { k: 'strategy', a: ['Beam search'], d: 'Deep beam search', st: ['exploration'], pr: ['rank_states', 'retain_top_k', 'expand'], cm: { tokenCost: 400, latency: 3, risk: 2, reversibility: 'high' }, m: 'ready' },
  mcts_prm: { k: 'strategy', a: ['MCTS + PRM'], d: 'MCTS with PRM', st: ['exploration'], pr: ['mcts_select', 'prm_evaluate', 'backpropagate'], cm: { tokenCost: 500, latency: 4, risk: 3, reversibility: 'high' }, m: 'ready' },
  simulated_annealing_concept: { k: 'strategy', a: ['Recuit simulé'], d: 'Temperature schedule', st: ['exploration'], pr: ['mutate', 'temperature_schedule', 'tests'], cm: { tokenCost: 500, latency: 4, risk: 3, reversibility: 'medium' }, m: 'ready' },
  hypermutation_reheat: { k: 'strategy', a: ['Réchauffement hypermutation'], d: 'Hypermutation', st: ['exploration'], pr: ['stagnation_check', 'hypermutation', 'affinity_selection'], cm: { tokenCost: 500, latency: 4, risk: 3, reversibility: 'medium' }, m: 'ready' },
  genetic_strategy_algorithm: { k: 'strategy', a: ['Algorithme génétique'], d: 'Mutation evolution', st: ['exploration'], pr: ['select', 'breed', 'mutate', 'evaluate'], cm: { tokenCost: 500, latency: 4, risk: 3, reversibility: 'medium' }, m: 'ready' },
  niche_exploration_concept: { k: 'strategy', a: ['Exploration niches'], d: 'Speciation', st: ['exploration'], pr: ['speciation', 'niche_preservation', 'pareto_select'], cm: { tokenCost: 500, latency: 4, risk: 2, reversibility: 'high' }, m: 'ready' },
  deterministic_replay: { k: 'strategy', a: ['Replay déterministe'], d: 'Deterministic replay', st: ['temporal'], pr: ['replay', 'state_fold'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  causal_replay_intervention_concept: { k: 'strategy', a: ['Replay causal intervention'], d: 'Causal replay', st: ['temporal'], pr: ['restore', 'intervene', 'replay', 'causal_diff'], cm: { tokenCost: 200, latency: 3, risk: 2, reversibility: 'medium' }, m: 'ready' },
  retroactive_exploration: { k: 'strategy', a: ['Exploration rétroactive'], d: 'Alternative future', st: ['temporal'], pr: ['restore', 'fork', 'alternative_future'], cm: { tokenCost: 200, latency: 3, risk: 2, reversibility: 'medium' }, m: 'ready' },
  causal_rebase_concept: { k: 'strategy', a: ['Rebase causal'], d: 'Causal rebase', st: ['temporal'], pr: ['checkpoint', 'inject_change', 'replay_dependencies'], cm: { tokenCost: 300, latency: 3, risk: 5, reversibility: 'low' }, m: 'ready' },
  mutated_incident_universes: { k: 'strategy', a: ['Univers mutés incident'], d: 'Mutated universe search', st: ['temporal'], pr: ['production_snapshot', 'mutated_universes', 'signature_match'], cm: { tokenCost: 400, latency: 4, risk: 3, reversibility: 'high' }, m: 'ready' },
  partial_reproduction_refinement: { k: 'strategy', a: ['Raffinement reproductions'], d: 'Partial repro refinement', st: ['temporal'], pr: ['score_partial_repro', 'recursive_refinement'], cm: { tokenCost: 300, latency: 4, risk: 2, reversibility: 'high' }, m: 'ready' },
  future_ci_concept: { k: 'strategy', a: ['Future-CI'], d: 'Future worlds', st: ['temporal'], pr: ['future_worlds', 'dependency_matrix', 'verify'], cm: { tokenCost: 400, latency: 3, risk: 2, reversibility: 'high' }, m: 'ready' },
  paired_functional_reproducibility: { k: 'strategy', a: ['Reproductibilité appariée'], d: 'Paired execution', st: ['temporal'], pr: ['paired_execution', 'similarity', 'equivalence_verdict'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  retrieval_first: { k: 'strategy', a: ['Retrieval-first'], d: 'Memory retrieval', st: ['memory'], pr: ['search_memory', 'similarity_rank'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  golden_path_replay: { k: 'strategy', a: ['Golden-path replay'], d: 'Golden path replay', st: ['memory'], pr: ['cherry_pick_golden_path', 'replay'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  negative_knowledge: { k: 'strategy', a: ['Negative knowledge'], d: 'Avoid dead ends', st: ['memory'], pr: ['search_failures', 'avoid_known_dead_ends'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  experience_cherry_pick: { k: 'strategy', a: ["Cherry-pick d'expérience"], d: 'Experience cherry-pick', st: ['memory'], pr: ['cherry_pick_experience', 'preserve_provenance'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  cognitive_merge_concept: { k: 'strategy', a: ['Fusion cognitive'], d: 'Experience merge', st: ['memory'], pr: ['experience_packets', 'knowledge_graph', 'reviewed_apply'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  belief_truth_maintenance: { k: 'strategy', a: ['Maintenance vérité'], d: 'Belief provenance', st: ['memory'], pr: ['belief_provenance', 'contradiction_check'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  memory_compilation_strategy: { k: 'strategy', a: ['Compilation mémoire'], d: 'Memory compilation', st: ['memory'], pr: ['compile_memory', 'source_refs'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  stdp_plasticity: { k: 'strategy', a: ['Plasticité STDP'], d: 'STDP plasticity', st: ['memory'], pr: ['stdp_update', 'causal_weighting'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  memory_sleep_cycle: { k: 'strategy', a: ['Cycle sommeil mémoire'], d: 'Sleep cycle', st: ['memory'], pr: ['prune_and_scale', 'context_compaction'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  controlled_lamarckian_learning: { k: 'strategy', a: ['Apprentissage lamarckien'], d: 'Lamarckian learning', st: ['memory'], pr: ['infer_traits', 'replicate', 'promote_trait'], cm: { tokenCost: 200, latency: 2, risk: 2, reversibility: 'medium' }, m: 'ready' },
  evidence_based_breeding: { k: 'strategy', a: ['Breeding evidence'], d: 'Evidence breeding', st: ['memory'], pr: ['phenotype_evidence', 'breed', 'validate_child'], cm: { tokenCost: 500, latency: 3, risk: 3, reversibility: 'medium' }, m: 'ready' },
  plasmid_divergent_optimization: { k: 'strategy', a: ['Optimisation plasmide'], d: 'Plasmid optimization', st: ['memory'], pr: ['plasmid_divergent_fork', 'pareto_select', 'assimilate_plasmid'], cm: { tokenCost: 300, latency: 3, risk: 2, reversibility: 'high' }, m: 'ready' },
  zero_trust: { k: 'strategy', a: ['Zero Trust'], d: 'Zero Trust', st: ['resilience'], pr: ['sandbox', 'permissions', 'taint_tracking'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  tool_output_validation: { k: 'strategy', a: ['Validation sorties'], d: 'Output validation', st: ['resilience'], pr: ['execution_receipt', 'artifact_hash', 'belief_gate'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  circuit_breaker_concept: { k: 'strategy', a: ['Circuit breaker'], d: 'Circuit breaker', st: ['resilience'], pr: ['failure_window', 'open', 'half_open'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  apoptosis_concept: { k: 'strategy', a: ['Apoptose'], d: 'Apoptosis', st: ['resilience'], pr: ['checkpoint', 'terminate', 'autopsy'], cm: { tokenCost: 100, latency: 1, risk: 5, reversibility: 'low' }, m: 'ready' },
  cryptobiosis_concept: { k: 'strategy', a: ['Cryptobiose'], d: 'Cryptobiosis', st: ['resilience'], pr: ['freeze_spore', 'persist', 'rehydrate'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  checkpoint_regeneration_concept: { k: 'strategy', a: ['Régénération checkpoint'], d: 'Checkpoint recovery', st: ['resilience'], pr: ['last_good_snapshot', 'restore', 'alternate_genome'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  axolotl_regeneration: { k: 'strategy', a: ['Régénération axolotl'], d: 'Axolotl regeneration', st: ['resilience'], pr: ['assess_regeneration', 'plan_regeneration', 'execute_regeneration', 'validate_equivalence'], cm: { tokenCost: 500, latency: 4, risk: 3, reversibility: 'medium' }, m: 'ready' },
  active_redundancy: { k: 'strategy', a: ['Redondance active'], d: 'Hot spare', st: ['resilience'], pr: ['hot_spare', 'health_switch'], cm: { tokenCost: 400, latency: 2, risk: 2, reversibility: 'high' }, m: 'ready' },
  dlq_autopsy_concept: { k: 'strategy', a: ['DLQ et autopsie'], d: 'Dead letter autopsy', st: ['resilience'], pr: ['dead_letter_queue', 'forensic_autopsy'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  cyber_immunity: { k: 'strategy', a: ['Cyber-immunité'], d: 'Cyber immunity', st: ['resilience'], pr: ['negative_selection', 'quarantine', 'threat_memory'], cm: { tokenCost: 200, latency: 2, risk: 2, reversibility: 'medium' }, m: 'ready' },
  autotomy_honeypot: { k: 'strategy', a: ['Autotomy honeypot'], d: 'Honeypot', st: ['resilience'], pr: ['decoy_branch', 'observe', 'destroy_decoy'], cm: { tokenCost: 400, latency: 2, risk: 3, reversibility: 'medium' }, m: 'ready' },
  entropy_sentinel: { k: 'strategy', a: ['Sentinelle entropie'], d: 'Entropy sentinel', st: ['resilience'], pr: ['shannon_entropy', 'drift_threshold'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  communication_loop_detection: { k: 'strategy', a: ['Détection boucles'], d: 'Loop detection', st: ['resilience'], pr: ['message_graph', 'cycle_detection', 'artifact_gate'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  execution_guardrails: { k: 'strategy', a: ['Guardrails exécution'], d: 'Guardrails', st: ['resilience'], pr: ['iteration_limit', 'token_limit', 'time_limit', 'uncertainty_limit'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  active_abstention_human_approval: { k: 'strategy', a: ['Abstention active'], d: 'Human gate', st: ['resilience'], pr: ['uncertainty_gate', 'approval_request'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  autophagy_cleanup: { k: 'strategy', a: ['Autophagie cleanup'], d: 'Cleanup', st: ['resilience'], pr: ['dag_mark_sweep', 'worktree_cleanup', 'cas_gc'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  echolocation_probe: { k: 'strategy', a: ['Probe echolocatif'], d: 'Echolocation probe', st: ['animal_control'], pr: ['probe_system', 'observe_response', 'infer_hidden_structure', 'adapt_next_action'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  scent_trace: { k: 'strategy', a: ['Trace olfactive'], d: 'Scent trace', st: ['animal_control'], pr: ['follow_trace_gradient', 'reinforce_causal_trail', 'falsify_false_trail'], cm: { tokenCost: 200, latency: 3, risk: 2, reversibility: 'high' }, m: 'ready' },
  foveal_scan_concept: { k: 'strategy', a: ['Scan foveal'], d: 'Foveal scan', st: ['animal_control'], pr: ['peripheral_watch', 'focus_region', 'verify_focus'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  vibration_sense: { k: 'strategy', a: ['Senseur vibratoire'], d: 'Vibration sense', st: ['animal_control'], pr: ['detect_weak_signal', 'amplify_anomaly', 'confirm_signal'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  landmark_navigation: { k: 'strategy', a: ['Navigation repères'], d: 'Landmark nav', st: ['animal_control'], pr: ['build_landmark_map', 'navigate_by_landmark', 'return_to_safe_point'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  homing_return: { k: 'strategy', a: ['Retour point sûr'], d: 'Safe return', st: ['animal_control'], pr: ['safe_checkpoint', 'return_to_safe_point', 'validate_return'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  stigmergic_mark: { k: 'strategy', a: ['Marque stigmergique'], d: 'Stigmergic mark', st: ['animal_control'], pr: ['deposit_trace', 'reinforce_trace', 'evaporate_trace'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  distributed_limb_probe: { k: 'strategy', a: ['Probe distribuée'], d: 'Distributed probe', st: ['animal_control'], pr: ['assign_local_probe', 'collect_limb_signal', 'arbitrate_limb_feedback'], cm: { tokenCost: 400, latency: 3, risk: 2, reversibility: 'high' }, m: 'ready' },
  waggle_recruitment_concept: { k: 'strategy', a: ['Recrutement danse'], d: 'Waggle recruitment', st: ['animal_control'], pr: ['publish_waggle_signal', 'validate_recruitment', 'allocate_quorum_budget'], cm: { tokenCost: 200, latency: 2, risk: 1, reversibility: 'high' }, m: 'ready' },
  immune_challenge: { k: 'strategy', a: ['Challenge immunitaire'], d: 'Immune challenge', st: ['animal_control'], pr: ['adversarial_challenge', 'permission_challenge', 'promotion_quarantine'], cm: { tokenCost: 200, latency: 2, risk: 2, reversibility: 'medium' }, m: 'ready' },
  feign_inert_state: { k: 'strategy', a: ['État inerte feint'], d: 'Feign inert', st: ['animal_control'], pr: ['reduce_attack_surface', 'observe_threat_persistence', 'restore_visibility'], cm: { tokenCost: 100, latency: 1, risk: 2, reversibility: 'high' }, m: 'ready' },
  energy_foraging_concept: { k: 'strategy', a: ['Fourragement énergétique'], d: 'Energy foraging', st: ['animal_control'], pr: ['estimate_patch_yield', 'compare_metabolic_cost', 'select_next_patch'], cm: { tokenCost: 100, latency: 1, risk: 1, reversibility: 'high' }, m: 'ready' },
  genos_orchestrate: { k: 'tool', a: ['genos_orchestrate'], d: 'Orchestration dispatch', t: ['genos_orchestrate'] },
  genos_search_failures: { k: 'tool', a: ['genos_search_failures'], d: 'Negative knowledge', t: ['genos_search_failures'], c: ['GRAPH_MEMORY'] },
  genos_diagnose: { k: 'tool', a: ['genos_diagnose'], d: 'Hypothesis diagnosis', t: ['genos_diagnose'], c: ['EVIDENCE_BARRIER'] },
  genos_hypothesis_evidence: { k: 'tool', a: ['genos_hypothesis_evidence'], d: 'Evidence barrier', t: ['genos_hypothesis_evidence'], c: ['EVIDENCE_BARRIER', 'EPISTEMICS_BRIER'] },
  genos_snapshot: { k: 'tool', a: ['genos_snapshot'], d: 'Snapshot', t: ['genos_snapshot'], c: ['CAPSULES_SNAPSHOTS'] },
  genos_diff: { k: 'tool', a: ['genos_diff'], d: 'Causal diff', t: ['genos_diff'], c: ['PROVENANCE'] },
  genos_evaluate_trajectories: { k: 'tool', a: ['genos_evaluate_trajectories'], d: 'Trajectory eval', t: ['genos_evaluate_trajectories'], c: ['ARENA_COMPETITION', 'EPISTEMICS_BRIER'] },
  genos_record_experience: { k: 'tool', a: ['genos_record_experience'], d: 'Experience recording', t: ['genos_record_experience'], c: ['EPISODIC_MEMORY', 'PROCEDURAL_MEMORY'] },
  genos_replay: { k: 'tool', a: ['genos_replay'], d: 'Replay', t: ['genos_replay'], c: ['PROCEDURAL_MEMORY'] },
  genos_organization_state: { k: 'tool', a: ['genos_organization_state'], d: 'Org state', t: ['genos_organization_state'], c: ['OBSERVABILITY'] },
  genos_worker_publish: { k: 'tool', a: ['genos_worker_publish'], d: 'Worker publish', t: ['genos_worker_publish'], c: ['SIGNALING_BUS', 'CRDT_SHARED_STATE', 'LIGAND_RECEPTOR'] },
  genos_worker_inbox: { k: 'tool', a: ['genos_worker_inbox'], d: 'Worker inbox', t: ['genos_worker_inbox'], c: ['SIGNALING_BUS', 'CRDT_SHARED_STATE', 'LIGAND_RECEPTOR'] },
  genos_philosophy: { k: 'tool', a: ['genos_philosophy'], d: 'Philosophy registry', t: ['genos_philosophy'] },
  genos_fork: { k: 'tool', a: ['genos_fork'], d: 'Fork', t: ['genos_fork'], c: ['CAPSULES_SNAPSHOTS'] },
  genos_create: { k: 'tool', a: ['genos_create'], d: 'Create', t: ['genos_create'] },
  genos_solve: { k: 'tool', a: ['genos_solve'], d: 'Solve', t: ['genos_solve'] },
  genos_merge: { k: 'tool', a: ['genos_merge'], d: 'Provenance merge', t: ['genos_merge'], c: ['PROVENANCE', 'PROMOTION_GATE'] },
  genos_record_decision: { k: 'tool', a: ['genos_record_decision'], d: 'Decision record', t: ['genos_record_decision'], c: ['PROVENANCE', 'PROMOTION_GATE', 'GOVERNANCE_APPROVAL'] },
  genos_adversarial_review: { k: 'tool', a: ['genos_adversarial_review'], d: 'Adversarial review', t: ['genos_adversarial_review'], c: ['ARENA_COMPETITION', 'HALLUCINATION_MONITORING'] },
  genos_compile_memory: { k: 'tool', a: ['genos_compile_memory'], d: 'Memory compilation', t: ['genos_compile_memory'], c: ['GRAPH_MEMORY', 'VECTOR_MEMORY'] },
  genos_resilience_hypermutation: { k: 'tool', a: ['genos_resilience_hypermutation'], d: 'Hypermutation', t: ['genos_resilience_hypermutation'], c: ['EVOLUTION_REPRODUCTION', 'PROCEDURAL_EVOLUTION', 'RESILIENCE_RECOVERY'] },
  genos_security_coevolution: { k: 'tool', a: ['genos_security_coevolution'], d: 'Security coevolution', t: ['genos_security_coevolution'], c: ['IMMUNE_SYSTEM'] },
  genos_delegate_worker: { k: 'tool', a: ['genos_delegate_worker'], d: 'Delegate worker', t: ['genos_delegate_worker'] },
  genos_a_team_preview: { k: 'tool', a: ['genos_a_team_preview'], d: 'A-Team preview', t: ['genos_a_team_preview'] },
  genos_trinity_launch: { k: 'tool', a: ['genos_trinity_launch'], d: 'Trinity launch', t: ['genos_trinity_launch'] },
  genos_change_strategy: { k: 'tool', a: ['genos_change_strategy'], d: 'Change strategy', t: ['genos_change_strategy'], c: ['STRATEGY_PORTFOLIO', 'STRATEGY_ADAPTATION'] },
  genos_change_organization: { k: 'tool', a: ['genos_change_organization'], d: 'Change org', t: ['genos_change_organization'] },
  genos_report_progress: { k: 'tool', a: ['genos_report_progress'], d: 'Progress report', t: ['genos_report_progress'], c: ['OBSERVABILITY', 'TOKEN_ECONOMY'] },
  genos_inspect: { k: 'tool', a: ['genos_inspect'], d: 'Inspect', t: ['genos_inspect'] },
  genos_lineage: { k: 'tool', a: ['genos_lineage'], d: 'Lineage', t: ['genos_lineage'], c: ['PROVENANCE'] },
  genos_bug_investigation: { k: 'tool', a: ['genos_bug_investigation'], d: 'Bug investigation', t: ['genos_bug_investigation'] },
  genos_blame: { k: 'tool', a: ['genos_blame'], d: 'Blame', t: ['genos_blame'], c: ['PROVENANCE'] },
  genos_cherry_pick_experience: { k: 'tool', a: ['genos_cherry_pick_experience'], d: 'Cherry-pick experience', t: ['genos_cherry_pick_experience'], c: ['EPISODIC_MEMORY', 'PROCEDURAL_MEMORY'] },
  genos_future_ci: { k: 'tool', a: ['genos_future_ci'], d: 'Future-CI', t: ['genos_future_ci'] },
  genos_repository_genome: { k: 'tool', a: ['genos_repository_genome'], d: 'Repository genome', t: ['genos_repository_genome'], c: ['GENOME_EPIGENETICS', 'PROCEDURAL_EVOLUTION'] },
  genos_bisect_agent: { k: 'tool', a: ['genos_bisect_agent'], d: 'Bisect agent', t: ['genos_bisect_agent'] },
  genos_analyze_trajectory: { k: 'tool', a: ['genos_analyze_trajectory'], d: 'Analyze trajectory', t: ['genos_analyze_trajectory'] },
  genos_workspace_experiment: { k: 'tool', a: ['genos_workspace_experiment'], d: 'Workspace experiment', t: ['genos_workspace_experiment'], c: ['PROCEDURAL_CAUSAL_VALIDATION'] },
  genos_causal_replay_experiment: { k: 'tool', a: ['genos_causal_replay_experiment'], d: 'Causal replay experiment', t: ['genos_causal_replay_experiment'], c: ['PROCEDURAL_CAUSAL_VALIDATION'] },
  genos_incident_experiment: { k: 'tool', a: ['genos_incident_experiment'], d: 'Incident experiment', t: ['genos_incident_experiment'] },
  genos_scientific_experiment: { k: 'tool', a: ['genos_scientific_experiment'], d: 'Scientific experiment', t: ['genos_scientific_experiment'] },
  genos_browser_act: { k: 'tool', a: ['genos_browser_act'], d: 'Browser act', t: ['genos_browser_act'], c: ['WEB_FORAGING'] },
  genos_foveal_crop: { k: 'tool', a: ['genos_foveal_crop'], d: 'Foveal crop', t: ['genos_foveal_crop'], c: ['FOVEAL_PERCEPTION'] },
  genos_optimal_foraging: { k: 'tool', a: ['genos_optimal_foraging'], d: 'Optimal foraging', t: ['genos_optimal_foraging'], c: ['WEB_FORAGING'] },
  genos_computer_use: { k: 'tool', a: ['genos_computer_use'], d: 'Computer use', t: ['genos_computer_use'], c: ['COMPUTER_USE'] },
  genos_guardrails_verify: { k: 'tool', a: ['genos_guardrails_verify'], d: 'Guardrails verify', t: ['genos_guardrails_verify'], c: ['OUTPUT_GOVERNOR'] },
  genos_topology_session: { k: 'tool', a: ['genos_topology_session'], d: 'Topology session', t: ['genos_topology_session'], c: ['SIGNALING_BUS', 'LIGAND_RECEPTOR', 'STIGMERGY', 'CRDT_SHARED_STATE'] },
  genos_execute_primitive: { k: 'tool', a: ['genos_execute_primitive'], d: 'Primitive exec', t: ['genos_execute_primitive'], c: ['TOKEN_ECONOMY', 'QUORUM', 'STIGMERGY', 'IMMUNE_SYSTEM'] },
  genos_execute_strategy_pipeline: { k: 'tool', a: ['genos_execute_strategy_pipeline'], d: 'Strategy pipeline', t: ['genos_execute_strategy_pipeline'], c: ['PROCEDURAL_GUIDANCE'] },
  genos_parasitic_pressure: { k: 'tool', a: ['genos_parasitic_pressure'], d: 'Parasitic pressure', t: ['genos_parasitic_pressure'], c: ['IMMUNE_SYSTEM'] },
  genos_run: { k: 'tool', a: ['genos_run'], d: 'VFS sandbox run', t: ['genos_run'], c: ['VFS_SANDBOX'] },
};

// ── FIELD MAPPINGS (raw key → canonical key, default) ────────────
const FIELDS = [
  ['k', 'kind'], ['a', 'aliases'], ['d', 'description'], ['c', 'capabilities'],
  ['t', 'tools'], ['pr', 'primitives'], ['st', 'strategies'], ['tp', 'compatibleTopologies'],
  ['pp', 'compatiblePhenotypes'], ['rp', 'compatibleRelations'], ['pre', 'preconditions'],
  ['dep', 'dependencies'], ['co', 'conflicts'], ['eh', 'evidenceContract'],
  ['th', 'transitionHooks'], ['ts', 'tests'], ['e', 'effects'], ['cm', 'costModel'], ['m', 'maturity']
];

function expand(raw) {
  const out = { authorityRequirements: KIND_AUTH[raw.k] || ['read'] };
  for (const [rawKey, canonKey] of FIELDS) {
    if (raw[rawKey] !== undefined) out[canonKey] = raw[rawKey];
  }
  return out;
}

// ── BUILD REGISTRY ──────────────────────────────────────────────
function rawArr(raw, key) { return raw[key] || []; }
function rawStr(raw, key, def) { return raw[key] || def; }
function rawCost(cm) { return cm ? { tokenCost: cm.tokenCost, latency: cm.latency, risk: cm.risk, reversibility: cm.reversibility } : { ...DEF_COST }; }

function conceptFromRaw(id, raw) {
  return {
    id,
    kind: raw.k,
    aliases: raw.a || [id],
    description: rawStr(raw, 'd', ''),
    capabilities: rawArr(raw, 'c'),
    tools: rawArr(raw, 't'),
    primitives: rawArr(raw, 'pr'),
    strategies: rawArr(raw, 'st'),
    compatibleTopologies: rawArr(raw, 'tp'),
    compatiblePhenotypes: rawArr(raw, 'pp'),
    compatibleRelations: rawArr(raw, 'rp'),
    preconditions: rawArr(raw, 'pre'),
    dependencies: rawArr(raw, 'dep'),
    conflicts: rawArr(raw, 'co'),
    authorityRequirements: KIND_AUTH[raw.k] || ['read'],
    costModel: rawCost(raw.cm),
    evidenceContract: rawArr(raw, 'eh'),
    transitionHooks: rawArr(raw, 'th'),
    maturity: rawStr(raw, 'm', 'ready'),
    tests: rawArr(raw, 'ts'),
    effects: rawArr(raw, 'e')
  };
}

function build() {
  const reg = new Map();
  for (const [id, raw] of Object.entries(RAW)) {
    reg.set(id, conceptFromRaw(id, raw));
  }
  return reg;
}

let REGISTRY = build();

// ── VALIDATION ──────────────────────────────────────────────────
function checkId(def, errors) { if (!def.id) errors.push('id required'); }
function checkKind(def, errors) { if (def.kind && !KINDS.has(def.kind)) errors.push(`Invalid kind: ${def.kind}`); }
function checkCostModel(def, errors) {
  if (!def.costModel) return;
  const cm = def.costModel;
  if (typeof cm.tokenCost !== 'number' || cm.tokenCost < 0) errors.push('tokenCost must be >= 0');
  if (typeof cm.latency !== 'number' || cm.latency < 0) errors.push('latency must be >= 0');
  if (typeof cm.risk !== 'number' || cm.risk < 0 || cm.risk > 5) errors.push('risk must be 0-5');
  if (!['high', 'medium', 'low'].includes(cm.reversibility)) errors.push('reversibility must be high|medium|low');
}

function validateConcept(def) {
  if (!def || typeof def !== 'object') return { valid: false, errors: ['Concept must be an object'] };
  const errors = [];
  checkId(def, errors);
  checkKind(def, errors);
  checkCostModel(def, errors);
  return { valid: errors.length === 0, errors };
}

// ── PUBLIC API ──────────────────────────────────────────────────
function registerConcept(def) {
  const v = validateConcept(def);
  if (!v.valid) return { ok: false, errors: v.errors };
  const id = def.id;
  const prev = REGISTRY.get(id);
  const merged = prev ? { ...prev, ...def, id } : { id, ...expand(mapToRaw(def)) };
  REGISTRY.set(id, merged);
  return { ok: true, id, concept: merged };
}

function getConcept(id) { return REGISTRY.get(id) || null; }

function findConceptsByCategory(kind) {
  return [...REGISTRY.values()].filter((c) => c.kind === kind);
}

function findCompatibleConcepts(filter) {
  const { phenotype, topology, relation } = filter || {};
  return [...REGISTRY.values()].filter((c) => {
    if (phenotype && !c.compatiblePhenotypes.includes(phenotype)) return false;
    if (topology && !c.compatibleTopologies.includes(topology)) return false;
    if (relation && !c.compatibleRelations.includes(relation)) return false;
    return true;
  });
}

function resolveCapabilities(ids) {
  const tools = new Set();
  for (const id of ids || []) {
    const c = REGISTRY.get(id) || REGISTRY.get(`capability:${id}`);
    if (!c) continue;
    (c.tools || []).forEach((t) => tools.add(t));
    (c.capabilities || []).forEach((cap) => {
      const capConcept = [...REGISTRY.values()].find((x) => x.kind === 'tool' && x.capabilities.includes(cap));
      if (capConcept) (capConcept.tools || []).forEach((t) => tools.add(t));
    });
  }
  return [...tools].sort();
}

function getAuthorityProfile(conceptId) {
  const c = REGISTRY.get(conceptId);
  if (!c) return null;
  return { conceptId, authority: c.authorityRequirements, kind: c.kind, cost: c.costModel };
}

function generateLeaseForConcept(conceptId) {
  const c = REGISTRY.get(conceptId);
  if (!c) return [];
  const lease = new Set([...(c.tools || []), ...resolveCapabilities(c.capabilities || [])]);
  return [...lease].filter((t) => t !== 'genos_orchestrate').sort();
}

function mapToRaw(def) {
  return {
    k: def.kind, a: def.aliases, d: def.description, c: def.capabilities,
    t: def.tools, pr: def.primitives, st: def.strategies, tp: def.compatibleTopologies,
    pp: def.compatiblePhenotypes, rp: def.compatibleRelations, pre: def.preconditions,
    dep: def.dependencies, co: def.conflicts, cm: def.costModel, eh: def.evidenceContract,
    th: def.transitionHooks, m: def.maturity, ts: def.tests, e: def.effects
  };
}

function getAllConcepts() { return Object.fromEntries(REGISTRY); }
function getRegistrySize() { return REGISTRY.size; }

module.exports = {
  registerConcept, getConcept, findConceptsByCategory, findCompatibleConcepts,
  resolveCapabilities, getAuthorityProfile, validateConcept, generateLeaseForConcept,
  getAllConcepts, getRegistrySize, KINDS: [...KINDS], AUTHORITY_OPS: Object.keys(KIND_AUTH)
};
