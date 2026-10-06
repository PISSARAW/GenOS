'use strict';

const assert = require('assert');
const registry = require('../../src/services/ontogenesis/canonicalConceptRegistry');

const coreFoundationsMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'runtime_agents_reproductible_supervise', 'etat_versionne',
  'branches_forks_snapshots_diffs_replay', 'succes_technique_vs_verite',
  'leases_outils', 'budgets', 'promotion_rejet_quarantaine_escalade', 'concept_metaphore_capacite'
] });
assert.deepStrictEqual(coreFoundationsMission.resolvedConcepts.map((concept) => concept.source), [
  'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'capability', 'runtime'
]);
assert.deepStrictEqual(coreFoundationsMission.resolvedConcepts.map((concept) => concept.id), [
  'paired_functional_reproducibility', 'provenance_integrity', 'deterministic_replay', 'evidence_first',
  'execution_guardrails', 'execution_guardrails', 'PROMOTION_GATE', 'evidence_first'
]);

const memoryFoundationMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'memoire_travail', 'memoire_semantique', 'memoire_ancestrale', 'memoire_autobiographique',
  'vector_search', 'plasticite_dendritique', 'adaptation', 'lacune_apprentissage',
  'transmission', 'fossilisation_stratigraphique', 'heritage_risque', 'infini_sous_contrat', 'self_twin_causal'
] });
assert.deepStrictEqual(memoryFoundationMission.resolvedConcepts.map((concept) => concept.source), [
  'capability', 'capability', 'capability', 'capability', 'capability', 'capability',
  'capability', 'runtime', 'capability', 'runtime', 'runtime', 'runtime', 'runtime'
]);
assert.deepStrictEqual(memoryFoundationMission.resolvedConcepts.map((concept) => concept.id), [
  'PROCEDURAL_MEMORY', 'GRAPH_MEMORY', 'GENOME_EPIGENETICS', 'EPISODIC_MEMORY', 'VECTOR_MEMORY',
  'SYNAPTIC_PLASTICITY', 'STRATEGY_ADAPTATION', 'controlled_lamarckian_learning', 'SIGNALING_BUS',
  'genos_lineage', 'genos_lineage', 'execution_guardrails', 'causal_replay_intervention_concept'
]);

const operationsResilienceMission = registry.resolveMission({ topology: 'a_team', requestedConcepts: [
  'pathologie_runtime', 'derive', 'claims_interrompus', 'redemarrage', 'retry_policy',
  'apoptose_agent', 'recuperation_wal', 'checkpoint_cryptographique', 'rollback',
  'restauration', 'idempotence_appels_externes', 'isolated_recovery', 'heartbeat', 'chargeback'
] });
assert.deepStrictEqual(operationsResilienceMission.resolvedConcepts.map((concept) => concept.source), [
  'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime',
  'capability', 'runtime', 'runtime', 'capability', 'runtime', 'capability', 'capability'
]);
assert.deepStrictEqual(operationsResilienceMission.resolvedConcepts.map((concept) => concept.id), [
  'diagnose_baseline', 'entropy_sentinel', 'circuit_breaker_concept', 'checkpoint_regeneration_concept',
  'circuit_breaker_concept', 'apoptosis_concept', 'checkpoint_regeneration_concept', 'CAPSULES_SNAPSHOTS',
  'checkpoint_regeneration_concept', 'checkpoint_regeneration_concept', 'RESILIENCE_RECOVERY',
  'isolated_recovery', 'OBSERVABILITY', 'TOKEN_ECONOMY'
]);

const possibleWorldMission = registry.resolveMission({ requestedConcepts: [
  'ontologie', 'etre', 'monde_possible', 'accessibilite_mondes', 'identite',
  'continuite_identite', 'realisme_independant', 'vide', 'autrui', 'modele_esprit_matiere'
] });
assert.ok(possibleWorldMission.resolvedConcepts.every((concept) => concept.source === 'philosophy'));
assert.deepStrictEqual(possibleWorldMission.resolvedConcepts.map((concept) => concept.id), [
  'ontology.being', 'ontology.being', 'ontology.possible-worlds', 'ontology.possible-worlds',
  'ontology.identity-change', 'ontology.identity-change', 'truth.internal-realism',
  'ontology.whole-void-infinite', 'ontology.person-other', 'metaphysics.mind-body'
]);

const orchestrationCoreMission = registry.resolveMission({ topology: 'a_team', requestedConcepts: [
  'orchestrateur', 'mission', 'tache', 'graphe_etats', 'survivant', 'branches_execution',
  'strategie', 'backoff_jitter', 'wal', 'rollback_atomique', 'capsule', 'workspace_contrefactuel',
  'lignage', 'progressive_delivery', 'strategy_arena', 'permission_check', 'frontier_escalation'
] });
assert.deepStrictEqual(orchestrationCoreMission.resolvedConcepts.map((concept) => concept.source), [
  'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime',
  'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'capability', 'runtime', 'runtime', 'runtime'
]);
assert.ok(orchestrationCoreMission.resolvedConcepts.every((concept) => concept.source === 'runtime' || concept.source === 'capability'));
assert.ok(orchestrationCoreMission.blockedConcepts.length > 0);

const securityMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'autorite', 'rbac', 'organisation', 'workspace', 'environnement', 'separation_responsabilites',
  'gestion_risque', 'auditabilite', 'conservation_preuves', 'isolation', 'confinement_chemins',
  'release', 'autorite_plateforme', 'confirmation_actions_destructives', 'permission_explicite', 'cedar'
] });
assert.ok(securityMission.resolvedConcepts.every((concept) => concept.source === 'capability' || concept.source === 'runtime'));
assert.ok(securityMission.resolvedConcepts.every((concept) => concept.available === true || concept.available === false));
assert.ok(securityMission.blockedConcepts.length > 0);

const researchMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'natural_creative_ecology', 'exploration', 'recombinaison', 'divergence', 'candidat_creatif',
  'falsification_creative', 'recherche_naturelle', 'pression_recherche', 'progres_causal',
  'simulation_prospective', 'recherche_adaptative', 'arene_strategies', 'experience_discriminante',
  'conservation_contre_exemples'
] });
assert.ok(researchMission.resolvedConcepts.every((concept) => concept.source === 'runtime' || concept.source === 'capability'));
assert.ok(researchMission.resolvedConcepts.every((concept) => concept.available === true || concept.available === false));

const sensingIncarnationMission = registry.resolveMission({ topology: 'biome', requestedConcepts: [
  'vision_polarisee', 'sensorium_incarn'
] });
assert.deepStrictEqual(sensingIncarnationMission.resolvedConcepts.map((concept) => concept.source),
  ['capability', 'capability']);
assert.deepStrictEqual(sensingIncarnationMission.resolvedConcepts.map((concept) => concept.id),
  ['FOVEAL_PERCEPTION', 'FOVEAL_PERCEPTION']);

const cognitionMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'interoception', 'calibration', 'dissonance_cognitive', 'memoire_autobiographique',
  'modele_soi', 'indicateurs_conscience', 'imagination', 'simulation_interne', 'reflexion', 'metacognition'
] });
assert.ok(cognitionMission.resolvedConcepts.every((concept) =>
  concept.source === 'runtime' || concept.source === 'capability' || concept.source === 'existing_adapter'));
assert.deepStrictEqual(cognitionMission.resolvedConcepts.map((concept) => concept.id), [
  'CONSCIENCE_HOMEOSTASIS', 'EPISTEMICS_BRIER', 'SEMANTIC_CONFLICTS', 'EPISODIC_MEMORY',
  'CONSCIENCE_HOMEOSTASIS', 'CONSCIENCE_HOMEOSTASIS', 'n_way_counterfactual_fork',
  'simulated_annealing_concept', 'memory_compilation_strategy', 'metacognition'
]);

const epistemologyMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'epistemologie_operationnelle', 'savoir', 'verite', 'inference', 'justification',
  'gettier', 'reliabilisme', 'epistemologie_sociale', 'corroboration', 'incertitude',
  'claim', 'ledger_hypotheses', 'contre_exemple', 'preuve_directe', 'grounding',
  'resultat_formel', 'resultat_non_verifie', 'promotion_eligible', 'revision_croyance',
  'dissonance', 'biais', 'consensus_pondere', 'quorum_abstention'
] });
assert.ok(epistemologyMission.resolvedConcepts.every((concept) => concept.source === 'capability'));
assert.ok(epistemologyMission.resolvedConcepts.some((concept) => concept.available));
assert.ok(epistemologyMission.resolvedConcepts.some((concept) => !concept.available));
assert.ok(epistemologyMission.resolvedConcepts.filter((concept) => concept.available)
  .every((concept) => concept.executable));

const computationalBiologyMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'cellule_computationnelle', 'agent_cellule_specialisee', 'genome', 'niche',
  'metabolisme_computationnel', 'sensorium', 'dormance', 'symbiose'
] });
assert.deepStrictEqual(computationalBiologyMission.resolvedConcepts.map((concept) => concept.source), [
  'capability', 'capability', 'capability', 'capability', 'capability', 'capability',
  'runtime', 'capability'
]);
assert.ok(computationalBiologyMission.resolvedConcepts.every((concept) => concept.id));

const workerFamiliesMission = registry.resolveMission({ topology: 'a_team', requestedConcepts: [
  'famille_sensorielle', 'famille_execution', 'famille_epistemique', 'famille_reparation_adaptative',
  'famille_organisationnelle', 'mode_deterministe', 'mode_borne', 'mode_adaptatif', 'mode_creatif',
  'role_producteur', 'role_verificateur', 'role_adversaire', 'role_experimentateur', 'role_synthetiseur'
] });
assert.ok(workerFamiliesMission.resolvedConcepts.every((concept) =>
  concept.source === 'capability' || concept.source === 'runtime'));
assert.ok(workerFamiliesMission.resolvedConcepts.every((concept) => concept.id));

const directLinksMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'lease', 'hallucination', 'couverture_temporelle'
] });
assert.deepStrictEqual(directLinksMission.resolvedConcepts.map((concept) => concept.source), [
  'central_chain_runtime', 'capability', 'capability'
]);
assert.equal(directLinksMission.resolvedConcepts[0].service, 'claimService');

const physicsMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'inertie', 'friction', 'entropie', 'seuil', 'pression', 'materiau_computationnel',
  'resistance', 'cout', 'energie', 'degradation', 'gating_decisionnel',
  'contraintes_physiques_calcul', 'ressources_environnement_hote', 'regulation_cpu_disque_memoire'
] });
assert.ok(physicsMission.resolvedConcepts.every((concept) =>
  concept.source === 'capability' || concept.source === 'runtime'));
assert.ok(physicsMission.resolvedConcepts.every((concept) => concept.id));

const topologyMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'garage_fabric', 'architecte', 'juge', 'trois_mondes', 'equipe_specialisee', 'domaines',
  'integration', 'communaute', 'arguments', 'veto_minoritaire', 'hote', 'symbiontes',
  'coherence_invariants', 'niches', 'biofilm', 'ramification_decentralisee',
  'populations_semi_independantes', 'recuperation_lignage'
] });
assert.ok(topologyMission.resolvedConcepts.every((concept) =>
  concept.source === 'capability' || concept.source === 'runtime' || concept.source === 'existing_adapter'));
assert.ok(topologyMission.resolvedConcepts.every((concept) => concept.id));

const philosophyReadMission = registry.resolveMission({ requestedConcepts: [
  'esprit', 'conscience', 'qualia', 'intentionalite', 'supervenience', 'emergence',
  'loi', 'determinisme', 'temps_a_series', 'identite_personnelle', 'semantique_modale',
  'recu_monde_possible', 'propriete_second_ordre', 'analyse_interpretative',
  'non_promotion_analyse_philosophique'
] });
assert.ok(philosophyReadMission.resolvedConcepts.every((concept) => concept.source === 'philosophy'));
assert.ok(philosophyReadMission.resolvedConcepts.every((concept) => concept.access === 'read'));

const orchestrationSensingMission = registry.resolveMission({ topology: 'biome', requestedConcepts: [
  'worker', 'sous_orchestrateur', 'fan_out', 'contrat_execution', 'contrat_mission',
  'git_agentique', 'agent_git', 'electroreception', 'magnetoreception', 'cellules_balistiques',
  'electrocytes', 'cellules_osmotiques', 'organismes_acaryotes', 'primitives_controle_animal'
] });
assert.ok(orchestrationSensingMission.resolvedConcepts.every((concept) =>
  concept.source === 'runtime' || concept.source === 'capability'));
assert.ok(orchestrationSensingMission.resolvedConcepts.every((concept) => concept.id));

const securityOperationsMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'scopes_tenant', 'multi_tenant', 'cors', 'authentification', 'sso', 'oidc', 'saml',
  'daemon_resident', 'autostart', 'nettoyage', 'rollout', 'deploiement_docker', 'deploiement_windows'
] });
assert.ok(securityOperationsMission.resolvedConcepts.every((concept) =>
  concept.source === 'capability' || concept.source === 'interface_runtime' || concept.source === 'runtime'));
assert.ok(securityOperationsMission.resolvedConcepts.every((concept) => concept.id));

const nosologyMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'gaia', 'maladies_auto_immunes', 'maladies_degeneratives', 'maladies_infectieuses',
  'maladies_genetiques', 'cancers', 'maladies_metaboliques', 'maladies_cardiovasculaires',
  'maladies_psychiatriques', 'maladies_environnementales', 'maladie_nosocomiale',
  'maladie_iatrogene', 'therapie', 'pharmacopee'
] });
assert.equal(nosologyMission.resolvedConcepts[0].source, 'capability');
assert.ok(nosologyMission.resolvedConcepts.slice(1).every((concept) =>
  concept.source === 'existing_adapter' && concept.available && concept.executable));
assert.ok(nosologyMission.resolvedConcepts.some((concept) => concept.service === 'clinicalTherapyService'));
assert.equal(nosologyMission.coverage.documentationOnly, 0);
assert.equal(nosologyMission.coverage.inventory, 704);
