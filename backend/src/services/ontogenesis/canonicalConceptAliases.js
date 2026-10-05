'use strict';

const CAPABILITY_ALIASES = Object.freeze({
  portfolio_strategies: 'STRATEGY_PORTFOLIO', selection_multi_strategies: 'STRATEGY_PORTFOLIO',
  competition_arena: 'ARENA_COMPETITION', brier_score: 'EPISTEMICS_BRIER',
  barriere_evidence: 'EVIDENCE_BARRIER', ligand_recepteur: 'LIGAND_RECEPTOR',
  evidence_independante: 'EVIDENCE_BARRIER', foraging: 'WEB_FORAGING',
  routage_capacites: 'LIGAND_RECEPTOR', traces_stigmergiques: 'STIGMERGY',
  recovery_lignage: 'RESILIENCE_RECOVERY', stigmergie: 'STIGMERGY', systeme_immunitaire: 'IMMUNE_SYSTEM',
  sandbox: 'VFS_SANDBOX', vfs_sandboxe: 'VFS_SANDBOX', approbation_humaine: 'GOVERNANCE_APPROVAL',
  routage_local_distant: 'MODEL_ROUTING', recovery: 'RESILIENCE_RECOVERY',
  capsules_snapshots: 'CAPSULES_SNAPSHOTS', observabilite: 'OBSERVABILITY',
  memoire_graphe: 'GRAPH_MEMORY', memoire_vectorielle: 'VECTOR_MEMORY',
  memoire_episodique: 'EPISODIC_MEMORY', memoire_procedurale: 'PROCEDURAL_MEMORY',
  economie_tokens: 'TOKEN_ECONOMY', etat_partage_crdt: 'CRDT_SHARED_STATE',
  bus_signalisation: 'SIGNALING_BUS', plasticite_synaptique: 'SYNAPTIC_PLASTICITY',
  etat_causal: 'CAUSAL_STATE', gates_invariants: 'INVARIANT_GATES',
  etat_partage_transactionnel: 'TRANSACTIONAL_SHARED_STATE', sync_selective: 'SELECTIVE_SYNC',
  resilience_recuperation: 'RESILIENCE_RECOVERY', homeostasie_conscience: 'CONSCIENCE_HOMEOSTASIS',
  evolution_reproduction: 'EVOLUTION_REPRODUCTION', genome_epigenetique: 'GENOME_EPIGENETICS',
  metriques_essaim: 'SWARM_METRICS', gate_promotion: 'PROMOTION_GATE', gouverneur_sortie: 'OUTPUT_GOVERNOR',
  sandbox_vfs: 'VFS_SANDBOX', gateway_inference: 'INFERENCE_GATEWAY', inference_locale: 'LOCAL_INFERENCE',
  guidance_procedurale: 'PROCEDURAL_GUIDANCE', evolution_procedurale: 'PROCEDURAL_EVOLUTION',
  validation_causale_procedurale: 'PROCEDURAL_CAUSAL_VALIDATION', conflits_semantiques: 'SEMANTIC_CONFLICTS',
  arene_competition: 'ARENA_COMPETITION', adaptation_strategie: 'STRATEGY_ADAPTATION',
  brier_epistemique: 'EPISTEMICS_BRIER', monitoring_hallucinations: 'HALLUCINATION_MONITORING',
  perception_foveale: 'FOVEAL_PERCEPTION', approbation_gouvernance: 'GOVERNANCE_APPROVAL',
  routage_modeles: 'MODEL_ROUTING'
});

const PHILOSOPHY_ALIASES = Object.freeze({
  ontologie_generale: 'ontology.being', causalite: 'causality.determination',
  temps_identite: 'ontology.identity-change', esprit_conscience: 'metaphysics.mind-body',
  epistemologie: 'epistemology.knowledge', philosophie_processus: 'process.actuality-potentiality',
  ethique: 'ethics.consequentialism', phenomenologie: 'metaphysics.reference-intentionality',
  platonisme: 'school.platonism', aristotelisme: 'school.aristotelianism',
  stoicisme: 'school.stoicism', epicurisme: 'school.epicureanism',
  scholastique: 'school.scholasticism', cartesianisme: 'school.cartesianism',
  leibnizianisme: 'school.leibnizianism', spinozisme: 'school.spinozism',
  newtonianisme: 'school.newtonianism', kantisme: 'school.kantianism',
  contingence_evenement: 'ontology.contingency-necessity', materialisme: 'metaphysics.material-monism',
  panpsychisme: 'metaphysics.panpsychism', eliminativisme: 'metaphysics.eliminativism',
  realisme_speculatif: 'school.speculative-realism', tout_vide_infini: 'ontology.whole-void-infinite',
  alterite: 'ontology.person-other', mondes_possibles: 'ontology.possible-worlds',
  realisme: 'truth.internal-realism', nominalisme: 'ontology.stances',
  conceptualisme: 'ontology.stances', organisme_procedural: 'process.actuality-potentiality'
});

const RUNTIME_ALIASES = Object.freeze({
  preuve_avant_promotion: 'evidence_first', falsifiabilite: 'falsification_principle',
  provenance: 'provenance_integrity', decisions_bornees: 'execution_guardrails',
  recus_verifiables: 'tool_output_validation', autorite_explicite: 'active_abstention_human_approval',
  isolation_workspaces: 'vfs_sandbox', fail_closed: 'zero_trust',
  execution_contrefactuelle: 'n_way_counterfactual_fork', falsification: 'falsifiable_hypothesis_tree',
  hypothese: 'falsifiable_hypothesis_tree', prediction: 'bayesian_sequential_diagnosis',
  compilation_memoire: 'memory_compilation_strategy', retrieval: 'retrieval_first',
  circuit_breaker: 'circuit_breaker_concept', regeneration: 'checkpoint_regeneration_concept',
  attention: 'foveal_scan_concept', workflow: 'plan_execute_verify',
  retry: 'circuit_breaker_concept', checkpoint: 'checkpoint_regeneration_concept',
  reprise: 'checkpoint_regeneration_concept', rejeu_causal: 'deterministic_replay',
  bisection_causale: 'causal_bisection', escalade: 'entropy_model_escalation_concept',
  selection: 'pareto_frontier_concept', arbitrage: 'pareto_frontier_concept',
  trajectoire: 'loop_detection_lkgs', consolidation: 'memory_compilation_strategy',
  oubli: 'memory_sleep_cycle', stdp: 'stdp_plasticity',
  apprentissage: 'controlled_lamarckian_learning', reutilisation_resultats: 'golden_path_replay',
  contrefactuel: 'n_way_counterfactual_fork', dependance_causale: 'causal_replay_intervention_concept',
  replay: 'deterministic_replay', diagnostic: 'diagnose_baseline', quarantaine: 'immune_challenge',
  reparation: 'checkpoint_regeneration_concept', autopsie_causale: 'dlq_autopsy_concept',
  defaillance: 'circuit_breaker_concept', sentinel: 'entropy_sentinel',
  dead_letter: 'dlq_autopsy_concept', reprise_crash: 'checkpoint_regeneration_concept',
  wal_recovery: 'checkpoint_regeneration_concept', foraging_charnov: 'energy_foraging_concept',
  foveation: 'foveal_scan_concept', perception_active: 'echolocation_probe',
  navigation_active: 'landmark_navigation', olfaction: 'scent_trace', echolocation: 'echolocation_probe'
});

const LIFECYCLE_REFERENCES = Object.freeze({
  incarnation: 'agentIncarnationService', chargement_soi: 'agentExpressionContextService',
  chargement_mission: 'agentIncarnationService', chargement_autorite: 'agentAuthorityService',
  perception: 'agentExpressionContextService', mise_a_jour_epistemique: 'agentProcessEventPipeline',
  recuperation_memoire: 'agentExpressionContextService', verification_regulation: 'workerContractEnforcement',
  selection_recette_cognitive: 'agentAutonomyPlanService', selection_strategie: 'strategyExecutionAdapter',
  selection_procedures: 'deterministicWorkerProcedures', action: 'deterministicWorkerRuntime',
  collecte_recus: 'agentEvidenceService', evaluation_evidence: 'agentProcessEventPipeline',
  mise_a_jour_memoire: 'agentExpressionContextService', communication: 'subOrchestratorDispatchService',
  revue: 'workerContractEnforcement', terminaison: 'agentProcessSupervisor', continuer: 'adaptiveWorkerService',
  adapter: 'adaptiveWorkerService', demander_capacite: 'workerContractEnforcement', escalader: 'subOrchestratorService',
  terminer: 'agentProcessSupervisor'
});

module.exports = { CAPABILITY_ALIASES, PHILOSOPHY_ALIASES, RUNTIME_ALIASES, LIFECYCLE_REFERENCES };
