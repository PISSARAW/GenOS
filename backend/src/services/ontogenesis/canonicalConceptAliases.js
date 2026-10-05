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
  , barriere_comparative: 'EVIDENCE_BARRIER', handoffs: 'SIGNALING_BUS', quorum: 'QUORUM'
  , veto_immunitaire: 'IMMUNE_SYSTEM', inference_locale: 'LOCAL_INFERENCE'
  , etat_partage: 'CRDT_SHARED_STATE', crdt: 'CRDT_SHARED_STATE'
  , allocation: 'TOKEN_ECONOMY', demes: 'SWARM_METRICS'
  , arbitrage_pareto: 'STRATEGY_PORTFOLIO', variants: 'STRATEGY_PORTFOLIO'
  , admission_workers: 'LIGAND_RECEPTOR'
  , agent_dna: 'GENOME_EPIGENETICS', agent_genome: 'GENOME_EPIGENETICS'
  , identite_hereditaire: 'GENOME_EPIGENETICS', versioning: 'PROVENANCE_INTEGRITY'
  , fingerprint: 'PROVENANCE_INTEGRITY', canonicalisation: 'PROVENANCE_INTEGRITY'
  , signature: 'PROVENANCE_INTEGRITY', meta: 'GENOME_EPIGENETICS'
  , chrm: 'GENOME_EPIGENETICS', chrp: 'GENOME_EPIGENETICS', xchr: 'GENOME_EPIGENETICS'
  , gene: 'GENOME_EPIGENETICS', plas: 'GENOME_EPIGENETICS', enha: 'GENOME_EPIGENETICS'
  , scar: 'GENOME_EPIGENETICS', phen: 'GENOME_EPIGENETICS', prov: 'PROVENANCE_INTEGRITY'
  , sign: 'PROVENANCE_INTEGRITY', expression_adn_phenotype: 'GENOME_EPIGENETICS'
  , graft: 'GENOME_EPIGENETICS', decoy: 'GENOME_EPIGENETICS'
  , migration_json_legacy: 'PROVENANCE_INTEGRITY', compatibilite_versions: 'PROVENANCE_INTEGRITY'
  , scellement_draft_sealed: 'CAPSULES_SNAPSHOTS', graphe_organisme_procedural: 'PROCEDURAL_GUIDANCE'
  , immutabilite: 'INVARIANT_GATES', provenance_genomique: 'PROVENANCE_INTEGRITY'
  , epigenetique: 'GENOME_EPIGENETICS', chromatine: 'GENOME_EPIGENETICS'
  , genes: 'GENOME_EPIGENETICS', expression_genetique: 'GENOME_EPIGENETICS'
  , mutation: 'PROCEDURAL_EVOLUTION', stabilite_genomique: 'INVARIANT_GATES'
  , phenotype: 'GENOME_EPIGENETICS', dedifferenciation: 'GENOME_EPIGENETICS'
  , embryogenese: 'GENOME_EPIGENETICS', hox: 'GENOME_EPIGENETICS'
  , meristeme: 'GENOME_EPIGENETICS', cambium: 'GENOME_EPIGENETICS'
  , homeostasie: 'CONSCIENCE_HOMEOSTASIS', organes_vitaux: 'CONSCIENCE_HOMEOSTASIS'
  , systemes_survie: 'CONSCIENCE_HOMEOSTASIS', reproduction: 'EVOLUTION_REPRODUCTION'
  , replication: 'EVOLUTION_REPRODUCTION', mitose: 'EVOLUTION_REPRODUCTION'
  , bourgeonnement: 'EVOLUTION_REPRODUCTION', meiose: 'EVOLUTION_REPRODUCTION'
  , clonage: 'EVOLUTION_REPRODUCTION', heredite: 'GENOME_EPIGENETICS'
  , hote_symbionte: 'IMMUNE_SYSTEM', ecosysteme_agentique: 'SWARM_METRICS'
  , antigene_epistemique: 'IMMUNE_SYSTEM', immunite_innee: 'IMMUNE_SYSTEM'
  , immunite_adaptative: 'IMMUNE_SYSTEM', anticorps_specialises: 'IMMUNE_SYSTEM'
  , selection_clonale: 'IMMUNE_SYSTEM', maturation_affinite: 'IMMUNE_SYSTEM'
  , memoire_immunitaire: 'IMMUNE_SYSTEM', inflammation: 'IMMUNE_SYSTEM'
  , homeostasie_effort: 'CONSCIENCE_HOMEOSTASIS', tolerance: 'IMMUNE_SYSTEM'
  , regulateur_t: 'IMMUNE_SYSTEM', biocenose_cognitive: 'SWARM_METRICS'
  , metapopulation_epistemique: 'SWARM_METRICS', stigmergie_epistemique: 'STIGMERGY'
  , holobionte_epistemique: 'IMMUNE_SYSTEM', recus_aeis: 'EVIDENCE_BARRIER'
  , assemblees_aeis: 'QUORUM', oracle_scelle: 'CAPSULES_SNAPSHOTS'
  , calibration_faux_positifs_negatifs: 'EPISTEMICS_BRIER'
  , revue_multi_fournisseur: 'STRATEGY_PORTFOLIO', feedback_immunitaire: 'IMMUNE_SYSTEM'
  , rearbitrage_promotion: 'PROMOTION_GATE'
  , leases_outils: 'execution_guardrails', budgets: 'execution_guardrails'
  , promotion_rejet_quarantaine_escalade: 'PROMOTION_GATE'
  , memoire_travail: 'PROCEDURAL_MEMORY', memoire_semantique: 'GRAPH_MEMORY'
  , memoire_ancestrale: 'GENOME_EPIGENETICS', memoire_autobiographique: 'EPISODIC_MEMORY'
  , memoire_culturelle: 'GRAPH_MEMORY', vector_search: 'VECTOR_MEMORY'
  , plasticite_dendritique: 'SYNAPTIC_PLASTICITY', plasticite_locale: 'SYNAPTIC_PLASTICITY'
  , plasticite_collective: 'SYNAPTIC_PLASTICITY', adaptation: 'STRATEGY_ADAPTATION'
  , lacune_apprentissage: 'CONTROLLED_LAMARCKIAN_LEARNING', transmission: 'SIGNALING_BUS'
  , intelligence_nuee: 'SWARM_METRICS', pheromones: 'STIGMERGY'
  , signaux: 'SIGNALING_BUS', signal_plane: 'SIGNALING_BUS', signal_plane_zero_text: 'SIGNALING_BUS'
  , recepteurs: 'LIGAND_RECEPTOR', boite_reception: 'LIGAND_RECEPTOR', ack: 'SIGNALING_BUS'
  , coalescing: 'SIGNALING_BUS', event_bus: 'SIGNALING_BUS'
  , communication_zero_text: 'SIGNALING_BUS', communication_shadow: 'SIGNALING_BUS'
  , grounding_communicationnel: 'LIGAND_RECEPTOR', cout_communication: 'TOKEN_ECONOMY'
  , consensus: 'QUORUM', flocking: 'SWARM_METRICS', competition: 'ARENA_COMPETITION'
  , arena: 'ARENA_COMPETITION', handoff: 'SIGNALING_BUS', liaison: 'LIGAND_RECEPTOR'
  , relations_inter_agents: 'LIGAND_RECEPTOR', physiologie_relationnelle: 'CONSCIENCE_HOMEOSTASIS'
  , parente_filtrage_routage: 'LIGAND_RECEPTOR', autorite_routage: 'LIGAND_RECEPTOR'
  , graphe_relations: 'GRAPH_MEMORY', graphe_gcir: 'GRAPH_MEMORY', registre_obligations: 'GOVERNANCE_APPROVAL'
  , gcir: 'GRAPH_MEMORY', agow: 'ARENA_COMPETITION', responsabilite_persistante: 'GOVERNANCE_APPROVAL'
  , initiative: 'SIGNALING_BUS', observation_qualifiee: 'EVIDENCE_BARRIER'
  , effet_verifie_projet: 'EVIDENCE_BARRIER'
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
  navigation_active: 'landmark_navigation', olfaction: 'scent_trace', echolocation: 'echolocation_probe',
  versioning: 'provenance_integrity', fingerprint: 'provenance_integrity', canonicalisation: 'provenance_integrity',
  signature: 'provenance_integrity', prov: 'provenance_integrity', sign: 'provenance_integrity',
  migration_json_legacy: 'provenance_integrity', compatibilite_versions: 'provenance_integrity',
  provenance_genomique: 'provenance_integrity', apoptose_controlee: 'apoptosis_concept'
  , apoptose_epistemique: 'apoptosis_concept',
  runtime_agents_reproductible_supervise: 'paired_functional_reproducibility',
  etat_versionne: 'provenance_integrity', branches_forks_snapshots_diffs_replay: 'deterministic_replay',
  succes_technique_vs_verite: 'evidence_first', concept_metaphore_capacite: 'evidence_first',
  leases_outils: 'execution_guardrails', budgets: 'execution_guardrails',
  fossilisation_stratigraphique: 'genos_lineage', heritage_risque: 'genos_lineage',
  infini_sous_contrat: 'execution_guardrails', self_twin_causal: 'causal_replay_intervention_concept',
  lacune_apprentissage: 'controlled_lamarckian_learning'
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

const INTERFACE_REFERENCES = Object.freeze({
  api_rest: 'backendHttpServer', grpc: 'backendGrpcServer', mcp: 'mcpToolRegistry',
  mcp_stdio: 'mcpStdioServer', cli_rust: 'genosCli', facade_operateur: 'genosCli',
  ide: 'ideIntegration', studio: 'studioIntegration', tui: 'genosCli',
  providers_modeles: 'modelProviderRegistry', endpoints_openai_compatibles: 'modelProviderRegistry',
  sqlite_wal: 'sqliteWalStore', event_log: 'eventLogStore', persistance_sessions: 'sessionStore',
  observabilite: 'telemetryObserver', logs_audit: 'auditLogService', traces: 'telemetryObserver',
  spans: 'telemetryObserver', request_ids: 'telemetryObserver', trace_ids: 'telemetryObserver',
  metriques_tenant: 'evaluationObservabilityService', health_checks: 'healthRoutes',
  readiness: 'readinessRoutes', alertes: 'telemetryObserver'
});

const CENTRAL_CHAIN_REFERENCES = Object.freeze({
  differenciation: 'agentIncarnationService', contrat: 'workerContractEnforcement',
  execution_isolee: 'vfsSandbox', observation: 'observationService', action_bornee: 'strategyExecutionAdapter',
  recus: 'agentEvidenceService', preuve: 'evidenceGate', decision: 'decisionObservabilityService',
  promotion: 'promotionGate', rejet: 'evidenceGate', recuperation: 'checkpointRegeneration',
  fossilisation: 'agentEvolutionService', transport_non_preuve: 'evidenceGate'
});

module.exports = { CAPABILITY_ALIASES, PHILOSOPHY_ALIASES, RUNTIME_ALIASES,
  LIFECYCLE_REFERENCES, INTERFACE_REFERENCES, CENTRAL_CHAIN_REFERENCES };
