# Décisions d'architecture (ADR)

Un **ADR** (*Architecture Decision Record*) capture une décision structurante : son
contexte, les options considérées, la décision retenue et ses conséquences. La règle
de gouvernance de GenOS impose un ADR pour toute modification d'architecture
(voir [.genos.md](../../.genos.md), règle 5).

## Index

| N° | Titre | Statut | Date | Domaine |
| --- | --- | --- | --- | --- |
| [0001](0001-agent-dna-binary-format.md) | AgentDNA : format héréditaire binaire | Accepté | 2026-09-13 | Génome, reproduction, runtime, persistance |
| [0002](0002-agentdna-innovation-loop.md) | Boucle d'innovation AgentDNA | Accepté | 2026-09-14 | Génome, apprentissage, orchestration, preuve |
| [0003](0003-fossilization-stratigraphic-archive.md) | Fossilisation stratigraphique | Accepté | 2026-09-27 | Persistance, mémoire, orchestration, preuve |
| [0004](0004-instinct-innate-circuits.md) | Instinct : circuits innés et PAF | Proposé | 2026-09-14 | Biomimétique, génome, neurobiologie, sûreté |
| [0005](0005-reorganisation-arborescence-documentaire.md) | Réorganisation de l'arborescence documentaire | Accepté | 2026-09-14 | Documentation, provenance, distribution |
| [0006](0006-active-global-organism-workspace.md) | Active Global Organism Workspace (AGOW) | Accepté | 2026-10-01 | Runtime cognitif, orchestration |
| [0007](0007-agow-runtime-persistence-et-evaluation.md) | Persistance, activation et évaluation AGOW | Accepté | 2026-10-01 | Runtime cognitif, persistance, évaluation |
| [0012a](0012-re-grounding-topologies-biologiques.md) | Re-grounding durable des workers biologiques | Acceptée | 2026-09-28 | Topologie, orchestration, workers, preuve |
| [0012b](0012-volition-autonome-et-preservation.md) | Volition autonome et préservation | Accepté (amendé 2026-09-27) | 2026-09-15 / 2026-09-27 | Orchestration, survie, autonomie |
| [0013](0013-survival-model-control-plane.md) | Modèle de survie dans le control plane | Accepté | 2026-09-16 | Orchestration, budgets, sûreté, biomimétisme |
| [0014](0014-theorie-du-soi-operationnelle.md) | Théorie du soi opérationnelle de l'orchestrator | Accepté | 2026-09-16 | Orchestration, apprentissage, persistance, sûreté |
| [0015](0015-convergence-organisme-cognitif-composite.md) | Convergence d'un organisme cognitif composite | Accepté | 2026-09-16 | Orchestration, contrôle, preuve, sûreté |
| [0016](0016-effets-runtime-philosophiques-controles.md) | Effets runtime philosophiques contrôlés | Accepté | 2026-09-17 | Philosophie, runtime, sûreté |
| [0017](0017-philosophie-politique-et-gouvernance.md) | Philosophie politique et gouvernance contrôlée | Accepté | 2026-09-17 | Philosophie, gouvernance, preuve, sûreté |
| [0018a](0018-execution-cognitive-via-client-mcp.md) | Exécution cognitive via le client MCP (`caller_mcp`) | Accepté | 2026-09-27 | Runtime, MCP, harness, preuve |
| [0018b](0018-gouvernance-registre-philosophique.md) | Gouvernance du registre philosophique | Accepté | 2026-09-17 | Philosophie, registre, relations, preuve |
| [0019](0019-socle-epistemique-du-savoir.md) | Socle épistémique du savoir | Accepté | 2026-09-17 | Philosophie, épistémologie, preuves, inférence |
| [0020a](0020-moteurs-logiques-bornes-et-semantique.md) | Moteurs logiques bornés et sémantiques explicites | Accepté | 2026-09-17 | Philosophie, inférence, épistémologie |
| [0020b](0020-persistance-analyses-philosophiques.md) | Persistance explicite des analyses philosophiques | Accepté | 2026-09-17 | Philosophie, analyses, provenance, persistance |
| [0021a](0021-ontologie-operationnelle.md) | Ontologie opérationnelle | Acceptée (implémentation en cours) | 2026-09-17 | Philosophie, ontologie, runtime |
| [0021b](0021-promotion-epistemique-des-decisions.md) | Promotion épistémique des décisions | Accepté | 2026-09-17 | Épistémologie, contrats, gates, mémoire |
| [0022a](0022-promotions-de-maturite-des-strategies.md) | Promotions de maturité des stratégies | Accepté | 2026-09-18 | Stratégies, maturité, registres |
| [0022b](0022-resultats-operationnels-et-preuve.md) | Résultats opérationnels et preuve | Accepté | 2026-09-18 | Runtime, MCP, validation, preuves |
| [0023](0023-pont-causalite-modalite.md) | Pont borné entre causalité et modalité | Accepté | 2026-09-18 | Mondes possibles, causalité, épistémologie |
| [0024](0024-contexte-epistemique-scientifique.md) | Contexte épistémique des analyses scientifiques | Accepté | 2026-09-18 | Méthode scientifique, vérité, promotion |
| [0025](0025-fiabilite-cognitive-bornee.md) | Évaluation bornée de la fiabilité cognitive | Accepté | 2026-09-18 | Reliabilisme, épistémologie, promotion |
| [0026](0026-transport-zerotexte-handlers.md) | Intégration sélective du transport zéro-texte aux handlers | Accepté | 2026-09-19 | Orchestration, signalisation inter-agents |
| [0027](0027-adaptateurs-conscience-et-metaphysique.md) | Adaptateurs bornés pour conscience et métaphysique | Accepté | 2026-09-19 | Registre philosophique, ontologie, conscience |
| [0028](0028-iam-avance-abac-mtls-secrets.md) | Autorisation ABAC, mTLS et secrets externes (Vault KV2) | Accepté | 2026-09-19 | IAM, mTLS, secrets |
| [0029](0029-resultat-formel-messagepack.md) | Résultat formel canonique en MessagePack | Accepté | 2026-09-19 | Résultats, preuve, provenance, sérialisation |
| [0030](0030-immunite-epistemique-et-composition.md) | Immunité épistémique et composition de résultats | Accepté | 2026-09-19 | Orchestration, preuve, mémoire, promotion |
| [0031](0031-scheduler-epistemique-mathematique.md) | Scheduler épistémique mathématique | Accepté | 2026-09-19 | Orchestration, mathématiques, preuves, budgets |
| [0032](0032-natural-search-control-plane.md) | Natural Search Control Plane | Accepté | 2026-09-21 | Recherche naturelle, contrôle, ledger, pression |
| [0033](0033-cognitive-key-system.md) | Cognitive Key System | Accepté | 2026-09-22 | Cognition, philosophie, orchestration, phénotype |
| [0034](0034-resident-daemon-ecology.md) | Écologie de daemons résidents : territoire, evidence, stigmergie, handoff | Accepté | 2026-09-23 | Daemons, territoires, evidence, stigmergie, handoff |
| [0035](0035-model-uplift-benchmark.md) | GMUB / GCAB — Model Uplift longitudinal et ablations | Accepté | 2026-09-23 | Évaluation, preuve, ladder, ablations |
| [0036](0036-harness-compatibility-layer.md) | Harness Compatibility Layer — rendre le harness remplaçable | Accepté | 2026-09-27 | Orchestration, runtime, exécution, preuve |
| [0037](0037-ecosysteme-agentique-11-15.md) | Écosystème agentique 11-15 : environnement, substrat, physiologie, gouvernance, interoception | Accepté | 2026-09-23 | Environnement, cognition, collectif, gouvernance, santé |
| [0038](0038-boucle-controle-cognitif-morphogenese.md) | Boucle de controle cognitif de la morphogenese | Accepte | 2026-09-23 | Orchestration, epistemologie, memoire, cognition, strategie, regulation |
| [0039](0039-systemes-vitaux-agents-6-10.md) | Systèmes vitaux des agents 6-10 : sensorium, métabolisme, résilience, développement, symbiontes | Accepté | 2026-09-23 | Perception, métabolisme, résilience, développement, procédures |
| [003x](003x-communication-ecology.md) | Communication Ecology Invariants (verbal = ressource rare, Signal Plane zero-text) | Accepté | 2026-09-27 | Communication, cognition, distribution |
| [0040](0040-morphogenese-git-contrefactuel.md) | Morphogenèse versionnée Git et contrefactuelle | Proposé | 2026-09-23 | Orchestration, morphogenèse, Git agentique, contrefactuel, substrat |
| [0041](0041-medecine-immunite-graduee.md) | Médecine graduée et immunité proportionnée | Accepté | 2026-09-27 | Santé agentique, immunité, thérapies, quarantaine, iatrogénie |
| [0042](0042-qpu-organe-specialise.md) | QPU comme organe spécialisé et sélection quantum-inspired | Rejeté | 2026-09-27 | Substrat de calcul, quantum-inspired, QPU, GPU, VFS |
| [0043](0043-runtime-worker-phenotypes.md) | Runtime worker commun et phenotypes composables | Accepté | 2026-09-24 | Workers, phenotypes, autorité, cycle de vie |
| [0044](0044-matrice-autorite-gates-double-runtime.md) | Matrice d'autorité unifiée, gates de provenance et d'observabilité, double runtime | Accepté | 2026-09-27 | Autorité, gouvernance, provenance, observabilité, runtime |
| [0045](0045-noyau-controle-morphogenetique.md) | Noyau de contrôle morphogénétique de l'orchestrateur Rust | Accepté | 2026-09-27 | Orchestration, morphogenèse, gouvernance, incarnation, santé |
| [0046](0046-routage-minimal-memoire-resultats.md) | Routage minimal suffisant et mémoire des meilleurs résultats | Accepté | 2026-09-24 | Orchestration, routage, mémoire, preuve, persistance |
| [0047](0047-sessions-persistantes-metapopulation.md) | Sessions persistantes de Métapopulation | Accepté | 2026-09-24 | Orchestration, Métapopulation, persistance, lignées, provenance |
| [0048](0048-session-holobionte-persistante.md) | Session Holobionte persistante et journal de symbiose | Accepté — première tranche de fondation. | -- | -- |
| [0049](0049-trinity-sealed-experiments.md) | Expériences Trinity scellées | accepté | 2026-09-24 | -- |
| [0050](0050-constitution-hote-holobionte.md) | Constitution de l'hôte Holobionte | Accepté — deuxième tranche de fondation. | -- | -- |
| [0051](0051-morphology-graph-and-topology-contracts.md) | Graphe morphologique et contrats typés de topologie | Accepté | 2026-09-27 | Orchestration, morphogenèse, topologies, preuves, budget |
| [0052](0052-contrat-symbiotique-holobionte.md) | Contrat symbiotique Holobionte | Accepté | 2026-09-24 | Holobionte, autorité, capacités, confidentialité, persistance |
| [0053](0053-admission-sandbox-symbiontes-holobionte.md) | Admission sandbox des symbiontes Holobionte | Accepté | 2026-09-24 | Holobionte, admission, sandbox, permissions, preuves |
| [0054](0054-classement-partenaires-holobionte.md) | Classement des partenaires Holobionte | Accepté | 2026-09-24 | Holobionte, sélection, capacités, risques, dépendance |
| [0055](0055-plan-metabolique-ressources-holobionte.md) | Plan métabolique des ressources Holobionte | Accepté | 2026-09-24 | Holobionte, ressources, allocations, contribution, coûts |
| [0056](0056-contribution-verifiee-ledger-holobionte.md) | Contribution vérifiée et ledger symbiotique Holobionte | Accepté | 2026-09-24 | Holobionte, contribution, preuves, fitness, persistance |
| [0057](0057-plan-immunitaire-aeis-holobionte.md) | Plan immunitaire AEIS obligatoire pour Holobionte | Accepté | 2026-09-24 | Holobionte, AEIS, admission, preuves, sécurité |
| [0058](0058-niveaux-veto-constitution-host-holobionte.md) | Niveaux de veto et garde constitutionnelle du Host Holobionte | Accepté | 2026-09-24 | Holobionte, autorité, veto, constitution, approbation |
| [0059](0059-plan-memoire-holobionte.md) | Plan mémoire Holobionte | Accepté | 2026-09-24 | Holobionte, mémoire, continuité, confidentialité, persistance |
| [0060](0060-redundance-et-dependance-holobionte.md) | Redondance fonctionnelle et contrôle de dépendance Holobionte | Accepté | 2026-09-24 | Holobionte, résilience, redondance, dépendance, keystone |
| [0061](0061-remplacement-et-reprise-symbionte.md) | Remplacement et reprise d'un symbionte | Accepté | 2026-09-24 | Holobionte, reprise, backup, substitution, ressources |
| [0062](0062-transmission-verticale-holobionte.md) | Transmission verticale Holobionte | Accepté | 2026-09-24 | Holobionte, génération, héritage, AEIS, admission |
| [0063a](0063-acquisition-horizontale-holobionte.md) | Acquisition horizontale Holobionte | Accepté — quatorzième lot du plan Holobionte. | -- | -- |
| [0063b](0063-contrats-worker-autorite-bornee.md) | Contrats worker avec autorité et délégation bornées | Accepté | 2026-09-24 | Workers, contrats, autorité, délégation, budgets |
| [0064a](0064-registre-workerkind-node-et-dispatch.md) | Registre WorkerKind Node et propagation au dispatch | Accepté | 2026-09-24 | Workers, registre, dispatch, autorité, preuves |
| [0064b](0064-transmission-mixte-holobionte.md) | Transmission mixte Holobionte | Accepté — quinzième lot du plan Holobionte. | -- | -- |
| [0065a](0065-homeostasie-environnement-hote.md) | Homéostasie de l'environnement hôte | Accepté (test dédié manquant) | 2026-09-27 | Environnement hôte, stockage, homéostasie |
| [0065b](0065-transfert-controle-procedures-holobionte.md) | Transfert contrôlé de procédures Holobionte | Accepté — seizième lot du plan Holobionte. | -- | -- |
| [0066](0066-co-adaptation-holobionte.md) | Co-adaptation Holobionte | Accepté — dix-septième lot du plan Holobionte. | -- | -- |
| [0067](0067-succession-symbiontes-holobionte.md) | Succession des symbiontes Holobionte | Accepté — dix-huitième lot du plan Holobionte. | -- | -- |
| [0068](0068-cross-feeding-symbiotique-holobionte.md) | Cross-feeding symbiotique Holobionte | Accepté — dix-neuvième lot du plan Holobionte. | -- | -- |
| [0069](0069-graphe-interactions-symbiontes-holobionte.md) | Graphe d’interactions des symbiontes Holobionte | Accepté — vingtième lot du plan Holobionte. | -- | -- |
| [0070](0070-syncytium-variant-code.md) | Variant Code pour Syncytium | Accepté | 2026-09-24 | Syncytium, code partagé, symboles, conflits sémantiques |
| [0071a](0071-morphogenese-fractale-et-controle-local.md) | Morphogenèse fractale et contrôle local | Accepté | 2026-09-24 | Orchestration, morphogenèse, autorités déléguées |
| [0071b](0071-sanctions-progressives-holobionte.md) | Sanctions progressives des symbiontes Holobionte — identifiant historique 0071 | Remplacé — voir ADR 0073 | 2026-09-24 | Holobionte, gouvernance, contrats, immunité |
| [0072](0072-classification-defaillances-symbiontes.md) | Classification des défaillances de symbiontes — identifiant historique 0072 | Remplacé — voir ADR 0074 | 2026-09-24 | Holobionte, santé, résilience, gouvernance |
| [0073a](0073-routage-moteur-contrat-symbionte.md) | Routage du moteur selon le contrat du symbionte — chemin historique 0073 | Remplacé — voir ADR 0075 | 2026-09-24 | Holobionte, runtime, routage, confidentialité |
| [0073b](0073-sanctions-progressives-holobionte.md) | Sanctions progressives des symbiontes Holobionte | Accepté | 2026-09-24 | Holobionte, gouvernance, contrats, immunité |
| [0074](0074-classification-defaillances-symbiontes.md) | Classification des défaillances de symbiontes | Accepté | 2026-09-24 | Holobionte, santé, résilience, gouvernance |
| [0075](0075-routage-moteur-contrat-symbionte.md) | Routage du moteur selon le contrat du symbionte | Accepté | 2026-09-24 | Holobionte, runtime, routage, confidentialité |
| [0076a](0076-kinds-non-agentiques-symbiontes-holobionte.md) | Kinds non agentiques pour les symbiontes Holobionte | Accepté | 2026-09-24 | Holobionte, symbiontes, modèles, outils, runtime |
| [0076b](0076-runtime-morphogenese-v2.md) | Runtime morphogénétique v2 | Accepté | 2026-09-24 | Orchestration, contrôle morphogénétique, observabilité |
| [0077](0077-variants-policies-holobionte.md) | Variants du Holobionte comme policies | Accepté | 2026-09-24 | Holobionte, composition, configuration, résilience |
| [0078a](0078-holobionte-persistant.md) | Host Holobionte persistant entre missions | Accepté | 2026-09-24 | Holobionte, identité, mémoire, continuité, capacités |
| [0078b](0078-syncytium-variant-graphe.md) | Variant Graphe pour Syncytium | Accepté | 2026-09-24 | Syncytium, graphes, arêtes, acyclicité |
| [0079a](0079-daemons-symbiontes-residents.md) | Daemons comme symbiontes résidents | Accepté | 2026-09-24 | Holobionte, daemons, continuité, admission |
| [0079b](0079-syncytium-transactionnel.md) | Variant Transactionnel pour Syncytium | Accepté — lot 20 du plan Syncytium. | -- | -- |
| [0080](0080-integration-rhizome-holobionte.md) | Intégration de Rhizome au Holobionte | Accepté | 2026-09-24 | Holobionte, Rhizome, découverte, admission |
| [0081](0081-integration-trinity-holobionte.md) | Intégration de Trinity au Holobionte | Accepté | 2026-09-24 | Holobionte, Trinity, sélection, admission |
| [0082a](0082-integration-biocenose-holobionte.md) | Intégration de Biocénose au Holobionte | Accepté | 2026-09-24 | Holobionte, Biocénose, jugement, autorité |
| [0082b](0082-syncytium-epistemique.md) | Variant Épistémique pour Syncytium | Accepté — lot 21 du plan Syncytium. | -- | -- |
| [0083a](0083-integration-a-team-holobionte.md) | Intégration d'A-Team au Holobionte | Accepté | 2026-09-24 | Holobionte, A-Team, sous-topologies, autorité |
| [0083b](0083-syncytium-blackboard.md) | Variant Blackboard pour Syncytium | Accepté — lot 22 du plan Syncytium. | -- | -- |
| [0084](0084-integration-syncytium-holobionte.md) | Intégration de Syncytium au Holobionte | Accepté | 2026-09-24 | Holobionte, Syncytium, cohérence, sous-topologies |
| [0085a](0085-integration-morphogenese-holobionte.md) | Intégration de Morphogenèse au Holobionte persistant | Accepté | 2026-09-24 | Holobionte, Morphogenèse, identité, capacités résidentes |
| [0085b](0085-syncytium-hierarchique.md) | Variant Hiérarchique pour Syncytium | Accepté — lot 23 du plan Syncytium. | -- | -- |
| [0086a](0086-branche-rhizome-morphogenese.md) | Branche Rhizome dans la Morphogenèse | Accepté | 2026-09-27 | Morphogenèse, Rhizome, exploration, preuves, budgets |
| [0086b](0086-runtime-evenementiel-holobionte.md) | Runtime événementiel Holobionte | Accepté | 2026-09-24 | Holobionte, runtime, contrats, contribution, mémoire |
| [0087a](0087-branche-trinity-morphogenese.md) | Branche Trinity dans la Morphogenèse | Accepté | 2026-09-24 | Morphogenèse, Trinity, comparaison, preuves, budgets |
| [0087b](0087-syncytium-humain-ia.md) | Variant Humain-IA pour Syncytium | Accepté — lot 24 du plan Syncytium. | -- | -- |
| [0088a](0088-conditions-arret-holobionte.md) | Conditions d'arrêt du Holobionte | Accepté | 2026-09-24 | Holobionte, cycle de vie, missions, gouvernance |
| [0088b](0088-services-runtime-syncytium.md) | Services du Runtime Syncytium | Accepté — lot 25 du plan Syncytium. | -- | -- |
| [0089](0089-gates-decision-biocenose.md) | Gates de promotion au jugement Biocénose | Accepté | 2026-09-24 | Biocénose, épistémologie, gouvernance, audit |
| [0090a](0090-contrat-capacites-syncytium.md) | Contrat de Capacités Syncytium | Accepté — lot 26 du plan Syncytium. | -- | -- |
| [0090b](0090-variants-executables-biocenose.md) | Variants exécutables de Biocénose | Accepté | 2026-09-24 | Biocénose, protocoles, décisions |
| [0091](0091-variants-syncytium-comme-policies.md) | Variants Syncytium comme Policies | Accepté — lot 27 du plan Syncytium. | -- | -- |
| [0092](0092-topologies-imbriquees-syncytium.md) | Topologies Imbriquées dans Syncytium | Accepté — lot 28 du plan Syncytium. | -- | -- |
| [0093a](0093-controleur-regional-autonome-metapopulation.md) | Contrôleur régional autonome de Métapopulation | Accepté | 2026-09-24 | Métapopulation, runtime, observabilité, Morphogenèse |
| [0093b](0093-morphogenese-topologies-syncytium.md) | Conseiller de Morphogenèse pour Syncytium | Accepté — lot 29 du plan Syncytium. | -- | -- |
| [0094](0094-ontologie-et-selection-morphogenetiques.md) | Ontologie et sélection morphogénétiques | Accepté — 2026-09-24. | -- | -- |
| [0095a](0095-admission-croissance-rhizome-runtime.md) | Admission de croissance dans le runtime Rhizome | Accepté | 2026-09-27 | Rhizome, croissance, providers, vérification, persistance |
| [0095b](0095-runtime-autonome-syncytium.md) | Runtime Autonome Syncytium | Accepté — lot 30 du plan Syncytium. | -- | -- |
| [0097](0097-calibration-immunitaire-holobionte.md) | Calibration immunitaire Holobionte | Accepté | 2026-09-25 | Holobionte, immunité, épistémologie |
| [0100](0100-controle-ecologique-biocenose.md) | Contrôle écologique de Biocénose | Accepté | 2026-09-25 | Biocénose, runtime, observabilité, Morphogenèse |
| [0101](0101-prevol-shadow-et-commit-cas-morphogenese-v2.md) | Prévol shadow et commit CAS de Morphogenèse V2 | Accepté | 2026-09-25 | Morphogenèse, persistance, runtime V2 |
| [0102](0102-boucle-migration-regionale-verifiee.md) | Boucle de migration régionale vérifiée | Accepté | 2026-09-25 | Métapopulation, migration, corridors, runtime |
| [0103a](0103-routage-fiable-du-thalamus.md) | Routage fiable du thalamus | Accepté | 2026-09-25 | API LLM, routage, cache, filtrage d'outils |
| [0103b](0103-vecteur-fitness-holobionte.md) | Vecteur de fitness Holobionte | Accepté | 2026-09-25 | Holobionte, fitness, observabilité |
| [0104](0104-dysbiose-holobionte.md) | Détection de dysbiose Holobionte | Accepté | 2026-09-25 | Holobionte, santé, résilience |
| [0105](0105-benchmark-longitudinal-holobionte.md) | Benchmark longitudinal Holobionte | Accepté | 2026-09-25 | Holobionte, évaluation, preuves |
| [0106](0106-detection-surreaction-immunitaire-holobionte.md) | Détection de sur-réaction immunitaire Holobionte | Accepté | 2026-09-25 | Holobionte, immunité, gouvernance |
| [0107](0107-impact-keystone-holobionte.md) | Impact des symbiontes keystone | Accepté | 2026-09-25 | Holobionte, résilience, mesure de contribution |
| [0108a](0108-branchement-topologies-fail-closed.md) | Branchement fail-closed des topologies | Accepté | 2026-09-25 | Orchestration, morphogenèse, transitions, preuves |
| [0108b](0108-cycle-de-vie-plasmidique.md) | Cycle de vie et gates plasmidiques | Accepté | 2026-09-25 | génome, capacités, CLI |
| [0110](0110-catalogue-central-des-variants-morphologiques.md) | Catalogue central des variants morphologiques | Accepté | 2026-09-25 | Morphogenèse, topologies, variants |
| [0111](0111-regulation-cognitive-bornee-et-eureka.md) | Régulation cognitive bornée et Eurêka fondé sur l’évidence | Accepté | 2026-09-25 | Régulation cognitive, preuves, persistance, runtime |
| [0113](0113-benchmark-avec-sans-genos.md) | Benchmark apparié avec / sans GenOS (campagne v1) | Accepté | 2026-09-25 | Évaluation, preuve, orchestration |
| [0114](0114-emission-dossier-worker-runtime-local.md) | Émission du dossier workerArtifact par les runtimes supervisés et timeout de barrière proportionné | Voir le fichier | -- | -- |
| [0115](0115-reparation-a-team-windows-handoffs-preuves.md) | Réparation A-Team Windows, handoffs créatifs et preuves intégrales | Voir le fichier | -- | -- |
| [0116](0116-execution-fiable-communication.md) | Exécution fiable des décisions de communication | Accepté | 2026-09-25 | Communication, transport, sécurité |
| [0117](0117-enveloppe-canonique-communication.md) | Enveloppe canonique de communication | Accepté | 2026-09-25 | Communication, contrats, interopérabilité |
| [0118](0118-preparer-les-workers-et-operer-le-graphe-rhizome.md) | Préparer les workers de topologie et exposer le graphe Rhizome | Accepté | 2026-09-25 | Topologies, workers, Rhizome, Morphogenèse |
| [0119](0119-actions-metier-et-detection-de-collapse.md) | Actions métier et détection de collapse | Accepté | 2026-09-25 | Runtime worker, supervision, observabilité |
| [0120](0120-resultats-de-mission-rhizome-et-croissance-du-graphe.md) | Résultats de mission Rhizome et croissance du graphe | Accepté | 2026-09-25 | Rhizome, workers et provenance |
| [0121](0121-contrat-mission-comparative-et-frontieres.md) | Contrat de mission comparative et frontières de responsabilité | Accepté | 2026-09-25 | Contrats, orchestration, Métapopulation, évaluation |
| [0122a](0122-evaluation-comparative-intertopologies-et-recolonisation.md) | Évaluation comparative inter-topologies et preuve de recolonisation | Accepté | 2026-09-25 | Topologies, évaluateurs, Métapopulation, lignées |
| [0122b](0122-partager-le-stockage-avec-les-runtimes-enfants.md) | Partager explicitement le stockage avec les runtimes enfants | Acceptée | -- | -- |
| [0123](0123-separer-profil-worker-et-contrat-de-methode.md) | Séparer le profil worker du contrat de méthode | Accepté | 2026-09-25 | Sélection des workers, contrats de mission, topologies |
| [0124](0124-selection-automatique-des-variants.md) | Sélection automatique et exécution des variants de topologie | Proposé | 2026-09-25 | Morphogenèse, orchestration, topologies |
| [0125](0125-profils-morphologiques-composables.md) | Profils morphologiques composables | Accepté | 2026-09-25 | Morphogenèse, catalogue de variants, graphes d'exécution |
| [0126a](0126-dsl-de-plan-experimental-trinity.md) | DSL de plan expérimental Trinity | Accepté | 2026-09-25 | Trinity, plans expérimentaux, preuves et orchestration |
| [0126b](0126-lier-les-politiques-de-metapopulation-au-runtime-regional.md) | Lier les politiques de métapopulation au runtime régional | Accepté | 2026-09-25 | Orchestration, métapopulation |
| [0128](0128-mecanismes-argumentatifs-et-polycentriques-biocenose.md) | Mécanismes argumentatifs et polycentriques Biocénose | Accepté | 2026-09-26 | Biocénose, agrégation, argumentation |
| [0129](0129-runtime-des-variants-holobionte.md) | Runtime contractuel des variants Holobionte | Accepté | 2026-09-26 | Orchestration, Holobionte |
| [0130](0130-runtime-comportemental-des-variants-rhizome.md) | Contrats comportementaux des variants Rhizome | Accepté | 2026-09-26 | Rhizome, routage, persistance, sûreté, morphogenèse |
| [0131](0131-mecanismes-runtime-des-variants-syncytium.md) | Mécanismes runtime des variants Syncytium | Accepté | 2026-09-26 | Syncytium, cohérence, coédition, réplication, autorité humaine |
| [0132](0132-runtime-des-variants-biome.md) | Runtime comportemental des variants Biome | Accepté | 2026-09-26 | Biome, ressources, recherche, persistance, preuves |
| [0133](0133-graphe-morphologique-executable-et-plugins-topologies.md) | Graphe morphologique exécutable et plugins de topologies | Accepté | 2026-09-26 | Morphogenèse, runtime, opérateurs, preuve, sûreté |
| [0134](0134-boucles-reflexives-fonctionnelles.md) | Boucles réflexives fonctionnelles (indicateurs, jamais conscience) | Accepté | 2026-09-26 | Réflexivité, métacognition, gates, best-effort |
| [0135](0135-gates-de-preuve-pour-promotion-des-findings.md) | gates de preuve pour promouvoir les findings daemon | Voir le fichier | -- | -- |
| [0136](0136-selection-pareto-des-cultures-verifiees.md) | sélection Pareto des propagules culturelles versionnées | Voir le fichier | -- | -- |
| [0137](0137-routage-relationnel-et-mesure-des-tokens.md) | routage relationnel et comptabilité des tokens | Voir le fichier | -- | -- |
| [0138](0138-persistance-recus-contractuels-versionnes.md) | Persistance transactionnelle des reçus contractuels versionnés | Accepté. | -- | -- |
| [0139](0139-runner-experimental-isole.md) | Runner expérimental isolé | Accepté. | -- | -- |
| [0140](0140-protocoles-corpus-et-anti-fuite.md) | Protocoles versionnés et corpus anti-fuite | Accepté. | -- | -- |
| [0141](0141-pipeline-truthgraph-semanticreport-rendu-ferme.md) | Pipeline TruthGraph → SemanticReport → rendu fermé | Accepté. | -- | -- |
| [0142](0142-gate-sorties-finales.md) | Gate des sorties finales | Accepté. | -- | -- |
| [0143](0143-reproduction-controlee-des-findings-daemon.md) | reproduction contrôlée avant promotion causale | Voir le fichier | -- | -- |
| [0144](0144-worldstate-conditionnel.md) | WorldState conditionnel | Accepté (portée Node) | 2026-09-27 | Représentation d'état, incertitude, décision |
| [0145](0145-rollout-controle-et-reversible.md) | Rollout contrôlé et réversible | Accepté (portée Node) | 2026-09-27 | Expérimentation, déploiement, rollback |
| [0146](0146-substrat-perceptif-binding-recurrence.md) | Substrat perceptif, binding et récurrence | Accepté (portée Node) | 2026-09-27 | Perception, suivi d'objets, binding |
| [0147](0147-hierarchie-generative-espace-perceptif.md) | Hiérarchie générative et espace perceptif | Accepté (portée Node) | 2026-09-27 | Perception générative, hiérarchie prédictive |
| [0148](0148-workspace-global-ignition.md) | Workspace global et ignition compétitive | Accepté (portée Node) | 2026-09-27 | Cognition, espace de travail global |
| [0149](0149-attention-controlee-par-modele.md) | Attention contrôlée par son modèle | Accepté (portée Node) | 2026-09-27 | Attention, allocation, leases |
| [0150](0150-metacognition-croyance-action.md) | Métacognition, croyance et action | Accepté (portée Node) | 2026-09-27 | Métacognition, calibration, abstention |
| [0151](0151-modele-de-soi-effecteurs.md) | Modèle de soi et effecteurs | Accepté (portée Node) | 2026-09-27 | Modèle de soi, copie d'efférence |
| [0152](0152-objectifs-concurrents-allostase.md) | Objectifs concurrents et allostase | Accepté (portée Node) | 2026-09-27 | Objectifs multiples, allostase |
| [0153](0153-population-morphogenetique-bornee.md) | Population morphogénétique bornée | Accepté (portée Node) | 2026-09-27 | Morphogenèse, variants, provenance |
| [0154a](0154-fitness-pareto-destins.md) | Fitness, Pareto et destins multiples | Accepté (portée Node) | 2026-09-27 | Sélection multi-objectifs, niches |
| [0154b](0154-recu-typé-du-pont-rust-snapshot.md) | Reçu typé du pont Rust pour les snapshots | Accepté | 2026-09-27 | Pont Rust/Node, snapshots, provenance |
| [0155](0155-hypothese-plan-action.md) | Hypothèse promue, plan et action | Accepté (portée Node) | 2026-09-27 | Planification, hypothèses, rollback |
| [0156](0156-verdict-experimental-planner.md) | Verdict expérimental et planner | Accepté (portée Node) | 2026-09-27 | Expérimentation, verdicts, PID |
| [0157](0157-apprentissage-inter-missions-consolidation.md) | Apprentissage inter-missions et consolidation | Accepté (portée Node) | 2026-09-27 | Mémoire inter-missions, lignées |
| [0158](0158-banc-morphogenese-operateurs.md) | Banc morphogenèse et opérateurs comparés | Accepté (portée Node) | 2026-09-27 | Morphogenèse, banc d'opérateurs |
| [0159](0159-no-report-ablations-croisees.md) | No-report et ablations croisées | Accepté (portée Node) | 2026-09-27 | Évaluation, ablations, plan factoriel |
| [0160](0160-campagne-reservee-replication.md) | Campagne réservée et réplication indépendante | Accepté (portée Node) | 2026-09-27 | Réplication, campagnes réservées |
| [0161](0161-contrats-communs-runtime-biologique.md) | Contrats communs du runtime biologique | Accepté | 2026-09-28 | Biomimétisme, runtime, Rust/Node, preuve |
| [0162](0162-niveaux-preuve-maturite-et-contrats-phase-0.md) | Niveaux de preuve de maturité et gel des contrats Phase 0 | Proposé | 2026-09-28 | Maturité, contrats, preuves, gouvernance documentaire |
| [0163](0163-contrats-transversaux-operation-receipt-preuve.md) | Contrats transversaux d'opération : événement, reçu et preuve | Accepté | 2026-09-28 | Contrats, provenance, budgets, orchestration, preuve |
| [0164](0164-racine-runtime-volume-optimal.md) | Placement de la racine runtime selon l'espace disponible | Accepté | 2026-09-28 | -- |
| [0166](0166-livraison-durable-signaux.md) | Livraison durable des signaux entre processus | Accepté | 2026-09-28 | Signal Plane, persistance, concurrence, reprise |
| [0168](0168-validation-semantique-des-reponses-biologiques.md) | Validation sémantique des réponses biologiques | Acceptée | 2026-09-28 | Syncytium, sémantique, preuve, orchestration |
| [0169](0169-benchmark-biologique-apparie.md) | Benchmark biologique apparié | Acceptée | -- | -- |
| [0170](0170-specialisation-workers-variants-syncytium.md) | Spécialisation des workers par variant Syncytium | Acceptée | 2026-09-28 | Syncytium, orchestration, workers, capacités |
| [0171](0171-workgraph-staffing-et-apprentissage-topologies.md) | Staffing A-Team depuis WorkGraph et apprentissage des topologies | Accepté | 2026-09-28 | WorkGraph, A-Team, apprentissage, topologies |
| [0172](0172-preuves-pour-apprentissage-causal-et-analyse-sociale.md) | Preuves pour l'apprentissage causal et analyse sociale descriptive | Accepté | 2026-09-28 | preuves, apprentissage, annulation, cognition sociale |
| [0173](0173-noyau-routage-et-niveaux-de-verification.md) | Noyau de routage et niveaux de vérification des claims | Accepté | 2026-09-30 | épistémologie, vérificateurs, reçus |
| [0174](0174-feedback-homeostatique-et-benchmark-eab.md) | Feedback homéostatique en contrôle et runner EAB | Accepté | 2026-09-30 | contrôle runtime, évaluation épistémique |
| [0175](0175-checkpoints-interprocessus-persistes.md) | Checkpoints interprocessus persistés | Accepté | 2026-09-30 | Communication, persistance |
| [0176](0176-boucles-biologiques-mesurees.md) | Boucles biomimétiques runtime mesurées | Accepté — intégration par tranches | 2026-09-30 | Perception, action, signalisation, cellules spécialisées, preuves |
| [0177](0177-routage-cognitif-plasticite-et-selections-relationnelles.md) | Routage cognitif, plasticité persistée et sélection relationnelle | Accepté | 2026-09-30 | Signalisation, cognition, relations inter-agents, persistance |
| [0178](0178-recus-biologiques-et-autorite-homeostatique.md) | Reçus biologiques versionnés et autorité homéostatique | Proposé | 2026-09-30 | Exécution biologique, homéostasie, preuves, persistance |
| [0179](0179-causalite-procedurale-durable.md) | Exécutions causales procédurales durables | Acceptée | -- | -- |
| [0180](0180-workspace-global-chemin-mission.md) | Consommer le workspace global dans le chemin de mission | Accepte | 2026-09-30 | Runtime Node, planification de mission |
| [0181a](0181-copie-efference-outils-mcp.md) | Corréler les outils MCP du backend à la copie d'efférence | Accepté | 2026-09-30 | Runtime Node, exécution MCP et attribution soi/monde |
| [0181b](0181-identite-durable-de-mission.md) | Identité durable de mission et succession d’orchestrateur | Accepté | 2026-09-30 | Continuité, orchestration, persistance |
| [0182a](0182-navigation-web-et-vision-foveale.md) | Navigation web et vision fovéale par session explicite | Proposé — intégration expérimentale. | 2026-09-30. | Backend, navigation, perception, preuves. |
| [0182b](0182-planification-allostatique-mesuree.md) | Planification allostatique depuis les mesures runtime | Accepte | 2026-09-30 | Interoception, planification |
| [0183a](0183-mesures-workspace-physique-computationnelle.md) | Mesures workspace et profils physiques par mission | Accepté — implémentation par lots. | -- | -- |
| [0183b](0183-regeneration-axolotl-bornee.md) | Régénération Axolotl ciblée et fondée sur des preuves | Remplacé | 2026-09-30 | Backend, résilience, cognition |
| [0184](0184-persistance-moteur-creativite.md) | Persistance du moteur de créativité | Accepté | 2026-09-30 | Créativité, runtime Rust, persistance |
| [0185](0185-navigation-web-et-vision-foveale.md) | Navigation web et vision fovéale par session explicite | Accepté — intégration expérimentale. | 2026-09-30. | Backend, navigation, perception, preuves. |
| [0186](0186-signaux-sensoriels-animaux-synthetiques.md) | Signaux sensoriels animaux typés comme synthétiques | Accepté | 2026-09-30 | Perception, capteurs, provenance |
| [0187](0187-quarantaine-avant-dispatch-mission.md) | Quarantaine avant dispatch de mission | Accepté | 2026-09-30 | Immunité, dispatch de workers, sécurité |
| [0188](0188-provenance-reproduction-fossilisation.md) | Provenance versionnée de reproduction et fossilisation | Accepté | 2026-09-30 | Lignées, reproduction, fossilisation |
| [0189](0189-snapshots-durables-de-population.md) | Snapshots durables de population | Accepté | 2026-09-30 | Écologie, tissus, spores, persistance |
| [0190](0190-filtre-cnidocyte-au-dispatch-mcp.md) | Filtre cnidocyte au dispatch MCP | Accepté | 2026-09-30 | MCP, filtrage, audit, mesures |
| [0191a](0191-marqueurs-cliniques-extensibles.md) | Marqueurs cliniques computationnels extensibles | Voir le fichier | -- | -- |
| [0191b](0191-quorum-electrocyte-lie-a-la-mission.md) | Quorum d'électrocyte lié à la mission | Accepté | 2026-09-30 | Cellules, votes, délai, mesure |
| [0192](0192-reponse-neuro-gliale-aux-evenements-de-mission.md) | Réponse neuro-gliale corrélée aux événements de mission | Accepté | 2026-09-30 | Runtime, neurobiologie, glie, quorum, preuve |
| [0193](0193-mesures-du-filtrage-choanocyte.md) | Mesures runtime du filtrage choanocyte | Accepté | 2026-09-30 | Runtime, flux, cellules spécialisées, mesure |
| [0194](0194-conformite-du-rendu-iridophore.md) | Conformité du rendu iridophore au runtime | Accepté, amendé et implémenté | 2026-10-15 | Runtime, rendu, cellules spécialisées, preuve |
| [0195](0195-enforcement-metabolique-cellule-de-garde.md) | Enforcement métabolique par la cellule de garde | Accepté | 2026-09-30 | Runtime, métabolisme, flux, cellules spécialisées |
| [0196](0196-plan-runtime-tracheide-et-mesure-de-cout.md) | Plan runtime et mesure de coût de la trachéide | Accepté, amendé et implémenté | 2026-10-15 | Runtime, plan interprété, cellules spécialisées, preuves |
| [0197](0197-transfert-hgt-sous-lease-et-revocation.md) | Transfert HGT sous lease et révocation | Accepté | 2026-09-30 | Runtime, transfert horizontal, autorisation, audit |
| [0198](0198-contrat-canonique-de-verification-epistemique.md) | Contrat canonique de vérification épistémique | Accepté | 2026-09-30 | Épistémologie, vérification, promotion |
| [0199](0199-resolution-et-boucle-evenementielle-de-morphogenese.md) | Résolution morphologique et boucle événementielle | Accepté | 2026-09-30 | Morphogenèse, planification, adaptation runtime |
| [0200a](0200-activation-des-boucles-de-morphogenese.md) | Activation des boucles de morphogenèse | Accepté | 2026-09-30 | Morphogenèse, contrôle runtime, apprentissage |
| [0200b](0200-lier-la-morphogenese-au-dispatch-de-mission.md) | Lier Morphogenèse au dispatch réel d’une mission | Accepté | 2026-10-01 | Orchestration, Morphogenèse, exécution des workers |
| [0201](0201-outcomes-de-morphogenese-verifies.md) | Outcomes de morphogenèse vérifiés | Accepté | 2026-09-30 | Morphogenèse, apprentissage, provenance |
| [0202](0202-handoff-daemon-actualise-au-demarrage.md) | Handoff daemon actualisé au démarrage d'une mission | Accepté | 2026-09-30 | Daemons résidents, cartographie, orchestration |
| [0203](0203-parcours-cli-init-doctor-run.md) | Parcours CLI `init`, `doctor`, `run` | Accepté | 2026-09-30 | CLI, expérience opérateur, orchestration |
| [0204](0204-recu-biologique-durable-rust-backend.md) | Reçu biologique durable Rust/backend | Accepté | 2026-09-30 | Biologie computationnelle, persistance, homéostasie |
| [0205](0205-parcours-aeis-et-causalite-procedurale.md) | Brancher les parcours AEIS et causalité procédurale | Accepté | 2026-09-30 | Backend, assurance épistémique, causalité |
| [0206](0206-decision-evidence-binding.md) | Lier les décisions persistées à leurs preuves | Accepté | 2026-10-01 | Décisions, provenance, preuves, isolation tenant |
| [0207](0207-transmettre-les-politiques-de-coordination-aux-workers.md) | Transmettre les politiques de coordination aux workers | Accepté | 2026-10-01 | Dispatch A-Team, coordination, handoffs |
| [0208](0208-relier-perception-memoire-et-rappel.md) | Relier perception, mémoire et rappel | Accepté | 2026-10-01 | Perception, mémoire autobiographique, apprentissage |
| [0209](0209-allowlist-surfaces-publiques.md) | Fermer les surfaces publiques par allowlist | Accepté | 2026-10-01 | API, authentification, sécurité |
| [0211](0211-routage-des-missions-syncytium-vers-les-services-de-variant.md) | Routage des missions Syncytium vers les services de variant | accepté | 2026-10-04 | -- |
| [0229](0229-deadlines-et-oracles-de-maturite.md) | Deadlines et oracles de maturité | Voir le fichier | -- | -- |
| [0230](0230-journal-biologique-et-population-signee.md) | Journal biologique et population signée | Voir le fichier | -- | -- |
| [0231](0231-succession-et-autorite-executable.md) | Succession et autorité executable | Voir le fichier | -- | -- |
| [0232](0232-therapie-autorisee-sur-cellule-durable.md) | Thérapie autorisée sur cellule durable | Voir le fichier | -- | -- |
| [0233a](0233-confiance-aeis-sur-implementation-deployee.md) | Confiance AEIS sur l’implémentation déployée | Voir le fichier | -- | -- |
| [0233b](0233-profil-developpement-codex-mcp.md) | Profil de développement Codex via MCP | Accepté | 2026-10-01 | Codex, MCP, workflows, persistance |
| [0234a](0234-hooks-session-codex-genos.md) | Gates de session Codex via hooks GenOS | Accepté | 2026-10-01 | Codex, MCP, preuve, sessions |
| [0234b](0234-preuves-poet-et-benchmark-multi-graines.md) | Preuves POET et benchmark multi-graines | Voir le fichier | -- | -- |
| [0235](0235-ontogenese-orchestrateur-resident-projet.md) | Ontogenèse : orchestrateur résident de projet à missions bornées et vérifiées | Accepté (première tranche : contrat et persistance) | 2026-10-01 | Orchestration, persistance, preuve, ressources, Git |
| [0236](0236-consensus-global-lecture-seule.md) | Consensus global en lecture seule | Voir le fichier | -- | -- |
| [0237](0237-differenciation-preuve-pluralite-immunite.md) | Différenciation GenOS : preuve, pluralité, immunité (pas la course aux canaux) | Accepté | 2026-10-01 | Stratégie produit, orchestration, épistémologie, sécurité |
| [0238](0238-execution-et-integration-ontogenese.md) | Exécution persistante et intégration vérifiée d’Ontogenèse | Voir le fichier | -- | -- |
| [0239a](0239-agow-provenance-epistemique.md) | Provenance épistémique des candidats AGOW | Accepté | 2026-10-01 | AGOW, épistémologie, contrefactuels |
| [0239b](0239-socle-genos-verified-evo-devo.md) | Socle de développement évolutif vérifié (GVX) | Accepté | 2026-10-01 | Ontogenèse, morphogenèse, persistance, expériences, AgentDNA, preuve |
| [0240](0240-agow-regret-predictif.md) | Arbitrage AGOW par regret prédictif | Accepté | 2026-10-01 | AGOW, décision, allostase, épistémologie |
| [0241](0241-agow-shadow-contrefactuel-isole.md) | Simulation contrefactuelle AGOW en espace isolé | Accepté | 2026-10-01 | AGOW, expérimentation, isolation des effets |
| [0242](0242-agow-plasticite-rapide-lente.md) | Plasticité rapide et lente coordonnée par AGOW | Accepté | 2026-10-01 | AGOW, plasticité, Signal Plane, procédures |
| [0243](0243-voies-directes-agow.md) | Voies cognitives directes via le Signal Plane | Accepté | 2026-10-01 | AGOW, Signal Plane, automatisation |
| [0244](0244-compilateur-de-trajectoires-agow.md) | Compiler de trajectoires cognitives AGOW | Accepté | 2026-10-01 | AGOW, mémoire de trajectoire, procéduralisation |
| [0245](0245-decompilation-voie-agow.md) | Décompilation des voies automatiques AGOW | Accepté | 2026-10-01 | AGOW, voies directes, prédiction et sécurité |
| [0246](0246-marches-cognitifs-distribues-agow.md) | Marchés cognitifs régionaux AGOW | Accepté | 2026-10-01 | AGOW, compétition, scalabilité |
| [0247a](0247-gvx-graphe-competences.md) | Graphe de compétences GVX dérivé du registre | Accepté | 2026-10-01 | GVX, compétences, preuves, registre |
| [0247b](0247-topologies-de-marches-par-morphogenese.md) | Topologies de marché proposées par Morphogenesis | Accepté | 2026-10-01 | Morphogenesis, AGOW, compétition distribuée |
| [0248](0248-trajectoires-causales-autobiographiques-agow.md) | Trajectoires causales dans la mémoire autobiographique | Accepté | 2026-10-01 | AGOW, mémoire autobiographique, provenance causale |
| [0249a](0249-ablations-et-controles-agow.md) | Conditions d'ablation AGOW étendues | Accepté | 2026-10-01 | AGOW, expérimentation, falsification |
| [0249b](0249-gvx-application-somatique.md) | Application somatique GVX sous autorisation externe | Accepté | 2026-10-01 | GVX, runtime, autorité, rollback |
| [0250](0250-baseline-ctm-style-agow.md) | Baseline CTM-style pour les expériences AGOW | Accepté | 2026-10-01 | AGOW, compétition, comparaison expérimentale |
| [0251](0251-protocoles-benchmarks-agow.md) | Protocoles de benchmarks AGOW comparatifs | Accepté | 2026-10-01 | AGOW, expérience, mesure d'efficacité |
| [0252](0252-gvx-curriculum-competences.md) | Curriculum de compétences GVX sous budget | Accepté | 2026-10-01 | GVX, compétences, budget, apprentissage |
| [0253](0253-gvx-suivi-somatique.md) | Suivi somatique et rollback GVX | Accepté | 2026-10-01 | GVX, observation, régression, rollback |
| [0254](0254-ingress-outcomes-trajectoires-agow.md) | Outcomes runtime vers plasticité et trajectoires AGOW | Accepté | 2026-10-01 | AGOW, ingress runtime, apprentissage causal |
| [0255](0255-active-query-simulation-prospective.md) | Active Query de simulation prospective | Accepté | 2026-10-01 | AGOW, Active Query, contrefactuels |
| [0256](0256-gvx-experimentation-and-ledger-integrity.md) | Protocoles GVX adaptatifs et intégrité du ledger | Accepté | 2026-10-01 | GVX, expériences, preuves, intégrité |
| [0257](0257-causal-self-twin.md) | Self-Twin causal versionné et écarts prédictifs | Accepté | 2026-10-01 | Self-Twin, causalité, GVX, AGOW |
| [0258](0258-pont-developpemental-agow-gvx.md) | Pont développemental asymétrique entre AGOW et GVX | Accepté | 2026-10-01 | AGOW, GVX, preuves, interoception |
| [0259](0259-systeme-predictif-multi-echelles.md) | Système prédictif multi-échelles T0–T6 | Accepté | 2026-10-01 | Prédiction, AGOW, apprentissage, morphogenèse, lignée |
| [0260](0260-politique-modes-cognitifs-agow.md) | Sélection des modes cognitifs par regret prédictif | Accepté | 2026-10-01 | AGOW, regret prédictif, contrôle cognitif |
| [0261a](0261-cognition-a-la-demande-agow.md) | Cognition à la demande pour les requêtes AGOW | Accepté | 2026-10-02 | AGOW, requêtes actives, voies directes |
| [0261b](0261-detection-lacunes-apprentissage-gvx.md) | Détection des lacunes et buts d'apprentissage bornés | Accepté | 2026-10-01 | GVX, curriculum, curiosité, autorité |
| [0262](0262-proposition-mutation-recherche-lignees-gvx.md) | Proposition de mutation et recherche de lignées candidates | Accepté | 2026-10-01 | GVX, Self-Twin, AgentGit, expérimentation |
| [0263](0263-nursery-experimentale-gvx.md) | Nursery expérimentale GVX et vérificateurs de confiance | Accepté | 2026-10-01 | GVX, expériences, isolation, preuve indépendante |
| [0264](0264-monitoring-longitudinal-somatique.md) | Monitoring longitudinal de transformations somatiques | Accepté | 2026-10-01 | GVX, application somatique, régression, maturité |
| [0265](0265-cycle-assimilation-transfert-gvx.md) | Cycle d'assimilation et consolidation des transferts GVX | Accepté | 2026-10-01 | GVX, transfert, outcome receveur, maturation |
| [0266](0266-plan-puissance-benchmarks-gvx.md) | Plan d'analyse et puissance dérivée des benchmarks GVX | Accepté | 2026-10-01 | GVX, benchmarks, réplication, inférence |
| [0267](0267-branchement-runtime-adaptateurs-gvx.md) | Branchement des outcomes runtime et adaptateurs GVX de confiance | Accepté | 2026-10-01 | AGOW, T0–T3, AgentGit, preuves GVX |
| [0268](0268-ledger-preuves-scientifiques.md) | Ledger partagé de preuves scientifiques | Accepté | 2026-10-02 | Épistémologie, expériences, provenance, topologies |
| [0269](0269-campagnes-rivales-agow-gmw.md) | Protocoles Rivals pour AGOW et signature GMW | Accepté | 2026-10-02 | AGOW, expérimentation, médiation, preuves |
| [0270](0270-control-plane-de-verification-gvx.md) | Control plane de vérification GVX isolé | Accepté | 2026-10-02 | GVX, vérification indépendante, clés de signature |
| [0271](0271-adaptation-predictive-et-self-twin.md) | Campagnes CTM externes et modèles adaptatifs | Accepté | 2026-10-02 | AGOW, Self-Twin, prédiction, expérimentation |
| [0272a](0272-execution-cycle-developpemental-gvx.md) | Dispatch runtime du cycle développemental GVX | Accepté | 2026-10-02 | GVX, runtime AGOW, expérimentation et plasticité |
| [0272b](0272-self-twin-dependency-recovery.md) | Découverte de dépendances et récupération Self-Twin | Accepté | 2026-10-02 | Self-Twin, causalité, récupération, preuves |
| [0273](0273-adaptateurs-perception-incarnee.md) | Adaptateurs de perception incarnée | Accepté | 2026-10-02 | Perception multimodale, AGOW, environnement |
| [0274](0274-jspace-adaptateurs-inspectables.md) | Adaptateurs J-space pour modèles inspectables | Accepté | 2026-10-02 | AGOW, interprétabilité, modèles locaux, causalité |
| [0275a](0275-evidence-conscience-suite-unifiee.md) | Gates Butlin et suite fonctionnelle unifiée | Accepté | 2026-10-02 | Épistémologie, benchmarks, promotion, AGOW |
| [0275b](0275-execution-campagne-gvx.md) | Exécution vérifiée des campagnes GVX | Accepté | 2026-10-02 | GVX, benchmarks, preuves, exécution |
| [0276](0276-phases-runtime-core-et-portefeuille.md) | Séparation des phases du runtime core et du portefeuille de stratégies | Accepté | 2026-10-03 | Orchestration, stratégie, leases, benchmarks |
| [0277a](0277-gates-de-couverture-et-branches-executables.md) | Branches réalisables et statut fondé sur les reçus | Accepté | 2026-10-03 | Orchestration, stratégie, preuves, benchmarks |
| [0277b](0277-workflows-persistants-holobionte.md) | Workflows persistants du runtime Holobionte | Accepté | 2026-10-04 | Holobionte, orchestration, reçus d'exécution |
| [0278a](0278-formal-read-only-benchmark.md) | Mode de lecture seule pour le pilote mathématique formel | Voir le fichier | -- | -- |
| [0278b](0278-simulation-ecologique-bornee.md) | Simulation écologique bornée du Holobionte | Accepté | 2026-10-04 | Holobionte, microbiome adaptatif, fitness |
| [0279a](0279-calibration-immunitaire-decisionnelle.md) | Calibration immunitaire décisionnelle | Accepté | 2026-10-04 | Holobionte, immunité, mémoire épistémique |
| [0279b](0279-variants-trinity-effectifs.md) | Variants Trinity effectifs sur le chemin de dispatch | Accepté | 2026-10-03 | Trinity, variants, diversité, routage modèle, preuves |
| [0280a](0280-scellage-memoire-missions.md) | Scellage mémoire des missions (scope mission/chambre) | Accepté | 2026-10-03 | Mémoire agent, Trinity, isolation, preuves |
| [0280b](0280-simulations-temporelles-regeneration-sync.md) | Simulations temporelles de régénération et synchronisation | Accepté | 2026-10-04 | Holobionte, résilience, synchronisation Edge |
| [0281a](0281-preuves-resolvables-ou-rien.md) | Preuves résolvables ou rien (scoring Trinity anti-fabrication) | Accepté | 2026-10-03 | Trinity, scoring, barrière comparative, preuves |
| [0281b](0281-selection-remplacement-partenaire.md) | Séparer sélection et remplacement du partenaire | Accepté | 2026-10-04 | Holobionte, compétition, succession |
| [0282a](0282-cross-examination-trinity.md) | Lier la falsification adversariale à la barrière Trinity | Acceptée. | -- | -- |
| [0282b](0282-lifecycle-admission-procedurale.md) | Lier le variant procédural au cycle d'admission | Accepté | 2026-10-04 | Holobionte, contrats, essais, admission |
| [0283a](0283-require-independent-verification-for-trinity-evidence.md) | Exiger une vérification indépendante pour les preuves Trinity | Acceptée. | -- | -- |
| [0283b](0283-validation-schema-outils.md) | Validation JSON Schema et porte d'exécution des outils | Accepté | 2026-10-04 | Holobionte, outils, validation de schéma |
| [0284a](0284-gate-trinity-diversite-reelle.md) | Bloquer les expériences hétérogènes sans diversité effective | Acceptée. | -- | -- |
| [0284b](0284-routage-missions-variants.md) | Routage priorisé des missions Holobionte | Accepté | 2026-10-04 | Holobionte, sélection de variants, missions |
| [0285](0285-transmettre-profils-pareto-trinity.md) | Transmettre les profils Pareto jusqu'au comparateur | Acceptée. | -- | -- |
| [0286](0286-contrats-de-mission-et-preuve-executable-trinity.md) | Contrats de mission et preuves exécutables Trinity | Accepté | 2026-10-03 | Trinity, vérification indépendante, contrats |
| [0287](0287-qualification-repetitions-campagnes.md) | Séparer le pilote de la qualification confirmatoire | Accepté | 2026-10-03 | Benchmarks, reproductibilité, qualification |
| [0288](0288-barriere-de-preuve-des-missions-topologiques.md) | Barrière de preuve des missions topologiques | Accepté | 2026-10-03 | Benchmarks topologiques, dossiers, vérification indépendante |
| [0289](0289-probes-topologiques-read-only.md) | Probes topologiques en lecture seule | Accepté | 2026-10-03 | Benchmarks topologiques, observation, preuve |
| [0290](0290-livraison-interprocessus-des-evenements-daemon.md) | Livraison interprocessus au daemon résident par curseur SQLite | Accepté | 2026-10-03 | Daemons résidents, événements, persistance |
| [0291](0291-persistance-du-daemon-de-metapopulation.md) | Persistance du daemon de métapopulation | Accepté | 2026-10-03 | Daemons, métapopulations, baux |
| [0292](0292-execution-des-variants-trinity.md) | Exécution et gates des douze variants Trinity | Accepté | 2026-10-03 | Trinity, orchestration, preuves, promotion |
| [0293a](0293-execution-missions-variants-holobionte.md) | Exécution persistante des missions par variant Holobionte | Accepté | 2026-10-04 | Holobionte, Morphogenèse, exécution de missions |
| [0293b](0293-persistance-des-variants-metapopulation.md) | Persistance des états de variants Metapopulation | Accepté | 2026-10-04 | Metapopulation, cycles régionaux, dèmes persistants et culture |
| [0293c](0293-runner-reel-campagne-holobionte.md) | Runner réel et reprise de campagne Holobionte | Voir le fichier | -- | -- |
| [0294a](0294-candidats-morphogenetiques-du-catalogue.md) | Candidats morphogénétiques issus du catalogue canonique | Accepté | 2026-10-04 | Morphogenèse, recherche de topologies et de variants |
| [0294b](0294-cloture-de-continuite-de-mission.md) | Fermeture des transitions de continuité de mission | Accepté | 2026-10-04 | Orchestration et survie des missions |
| [0294c](0294-contrat-de-preuve-aeis.md) | Contrat de preuve exécutable AEIS | Accepté | 2026-10-04 | AEIS, preuve, promotion, confinement |
| [0294d](0294-contrat-residuel-cognitif-signal-plane.md) | Contrat cognitif résiduel du Signal Plane | Accepté | 2026-10-04 | Signal Plane, cognition, preuve |
| [0294e](0294-executeurs-deterministes-workers.md) | Exécuteurs déterministes des workers | Accepté | 2026-10-04 | Workers, orchestration, preuve |
| [0294f](0294-fermeture-runtime-nce.md) | Contrats de preuve des chemins runtime NCE | Accepté | 2026-10-04 | Natural Creative Ecology, Play, phénotype, culture, POET |
| [0294g](0294-persistance-des-registres-biomimetiques.md) | Persistance des registres biomimétiques | Voir le fichier | -- | -- |
| [0294h](0294-reprise-campagne-longitudinale-holobionte.md) | Reprise de campagne longitudinale Holobionte | Accepté | 2026-10-04 | Holobionte, benchmark |
| [0295a](0295-memoire-immunitaire-portee-et-oracle.md) | Mémoire immunitaire AEIS portée et résolue par preuve | Accepté | 2026-10-04 | AEIS, mémoire, SQLite, multitenance |
| [0295b](0295-registre-des-recepteurs-du-signal-plane.md) | Registre durable des récepteurs du Signal Plane | Voir le fichier | -- | -- |
| [0295c](0295-responsabilite-persistante-shev.md) | Responsabilité persistante et initiatives SHEV | Accepté | 2026-10-04 | projets persistants, perception, Ontogenèse, GVX |
| [0295d](0295-transitions-morphologiques-avec-jugement-et-verification.md) | Transitions morphologiques avec jugement et vérification | Accepté | 2026-10-04 | Morphogenèse, transitions et preuves |
| [0296a](0296-capacites-transversales-morphogenese.md) | Première tranche des capacités transversales de morphogenèse | Proposé, première implémentation opt-in | 2026-10-04 | Morphogenèse, preuves, mémoire, risque statistique |
| [0296b](0296-erreurs-explicites-de-cleavage.md) | Erreurs explicites de clivage embryogénétique | Accepté | 2026-10-04 | Orchestrateur Rust, embryogenèse |
| [0296c](0296-file-cognitive-du-signal-plane.md) | File cognitive durable du Signal Plane | Voir le fichier | -- | -- |
| [0296d](0296-rejeu-causal-sous-bail.md) | Rejeu causal sous bail et journal chaîné | Accepté | 2026-10-04 | Causalité procédurale, persistance, concurrence |
| [0296e](0296-revue-multi-fournisseur-aeis.md) | Revue AEIS par fournisseurs indépendants | Accepté | 2026-10-04 | AEIS, fournisseurs, processus, promotion |
| [0297a](0297-budget-et-retroaction-aeis.md) | Budget et rétroaction homéostatique AEIS | Accepté | 2026-10-04 | AEIS, runtime, ré-arbitration, budget |
| [0297b](0297-campagnes-biocenose-avec-sorties-verifiables.md) | Campagnes Biocénose avec sorties vérifiables | Accepté | 2026-10-04 | Biocénose, formation et qualification avec modèle local |
| [0297c](0297-g-cir-generation-hypotheses-trinity.md) | G-CIR pour la generation d'hypotheses Trinity | Accepte | 2026-10-04 | Trinity, cognition, preuve |
| [0297d](0297-protocoles-de-responsabilite-shev.md) | Protocoles de responsabilité, de surveillance et de transfert SHEV | Accepté | 2026-10-04 | SHEV, Ontogenèse, GVX, évaluation |
| [0297e](0297-reprise-des-wake-handlers.md) | Réarmement des workers au démarrage | Voir le fichier | -- | -- |
| [0298a](0298-boite-de-reception-signaux.md) | Boîte de réception des signaux | Voir le fichier | -- | -- |
| [0298b](0298-cycle-de-vie-des-recus-aeis.md) | Cycle de vie des reçus et assemblées AEIS | Accepté | 2026-10-04 | AEIS, signature, rétention, audit |
| [0298c](0298-physiologie-relationnelle-executable.md) | Physiologie relationnelle exécutable | Proposé, avec noyau intégré et raccord ciblé | 2026-10-04 | Relations inter-agents, communication, autorité, preuves |
| [0299a](0299-admission-relationnelle-transactionnelle.md) | Admission transactionnelle des signaux relationnels | Proposé, implémentation ciblée | 2026-10-04 | Communication inter-agents, autorité, persistance |
| [0299b](0299-capacites-transversales-morphogenese.md) | Cinq capacités transversales de morphogenèse | Proposé, avec première implémentation opt-in | 2026-10-04 | Morphogenèse, preuves, mémoire, risque statistique |
| [0299c](0299-capsule-prompt-utf8-direct.md) | Capsule de prompt UTF-8 directe | Accepté | 2026-10-04 | Transport interprocessus, communication, coût |
| [0299d](0299-liaison-des-assemblages-aeis-au-run.md) | Liaison des assemblages AEIS au run | Accepté | 2026-10-04 | AEIS, mémoire, intégrité, portée |
| [0299e](0299-registre-obligations-g-cir.md) | Registre d'obligations et graphe G-CIR | Accepté | 2026-10-04 | cognition, orchestration, preuve |
| [0299f](0299-resultats-actions-signaux.md) | Résultats réels des actions de récepteur | Voir le fichier | -- | -- |
| [0300a](0300-affectation-niches-et-contrats-hotes.md) | Niche du spécialiste et contrat du symbiote en topologie | Accepté | 2026-10-04 | Topologies, workers spécialistes, Holobionte |
| [0300b](0300-checkpoint-communication-fin-mission.md) | Checkpoint de communication à la fin d'une mission | Accepté | 2026-10-04 | Orchestration, communication, preuve |
| [0300c](0300-scellement-spores-biome.md) | Scellement des spores Biome | Accepté | 2026-10-04 | cryptobiose, confidentialité, restauration |
| [0301a](0301-expiration-des-buffers-de-signaux.md) | Expiration des buffers de signaux | Voir le fichier | -- | -- |
| [0301b](0301-falsification-deterministe-red-worker.md) | Falsification déterministe du red worker | Accepté | 2026-10-04 | Workers, revue adversariale, preuve |
| [0301c](0301-msgpack-sans-repli-json-illisible.md) | MsgPack sans repli JSON illisible | Accepté | 2026-10-04 | Transport binaire, communication inter-agents, compatibilité |
| [0302a](0302-autorite-actions-recepteurs.md) | Autorité des actions de récepteurs | Accepté | 2026-10-04 | Communication, signalisation, isolation des projets |
| [0302b](0302-benchmark-rival-autogen-local.md) | Première mesure rivale locale avec AutoGen | Accepté | 2026-10-04 | Workers, benchmarks comparatifs, provenance |
| [0303](0303-mesure-bornee-experimental-worker.md) | Mesure bornée du worker expérimental | Accepté | 2026-10-04 | Workers, expérimentation, preuve |
| [0304](0304-synthese-structuree-des-desaccords.md) | Synthèse structurée des désaccords | Accepté | 2026-10-04 | Workers, synthèse, provenance |
| [0305](0305-fenetre-observation-resident-daemon.md) | Fenêtre d'observation du resident daemon | Accepté | 2026-10-04 | Workers, observation, anomalies |
| [0306](0306-reconstruction-causes-declarees-forensic-worker.md) | Reconstruction des causes déclarées du forensic worker | Accepté | 2026-10-04 | Workers, analyse d'incident, provenance |
| [0307](0307-observation-litterale-scout-cell.md) | Observation littérale du scout cell | Accepté | 2026-10-04 | Workers, observation, provenance |
| [0308](0308-transfert-subset-sum-teaching-worker.md) | Transfert contrôlé de subset_sum par le teaching worker | Accepté | 2026-10-04 | Workers, transmission, vérification |
| [0309a](0309-audits-web-shev-independants.md) | Audits web indépendants pour SHEV | Accepté | 2026-10-04 | SHEV, vérification d'effet, qualité web |
| [0309b](0309-evaluation-isolee-variants-a-team.md) | Évaluation isolée des variantes A-Team | Accepté | 2026-10-04 | A-Team, contrats de variante, preuve, dispatch |
| [0310a](0310-audits-web-shev-independants.md) | Audits web indépendants pour SHEV | Accepté | 2026-10-04 | SHEV, vérification d'effet, qualité web |
| [0310b](0310-autorisation-cedar-agents.md) | Autorisation Cedar des missions et du contrôle d'agents | Accepté | 2026-10-04 | autorisation, missions, délégation, relations |
| [0311](0311-autorisation-cedar-agents.md) | Autorisation Cedar des missions et du contrôle d'agents | Accepté | 2026-10-04 | autorisation, missions, délégation, relations |
| [0312](0312-garage-fabric-adaptatif.md) | Garage Fabric adaptatif pour le control plane | Accepté — première tranche de fondation | 2026-10-05 | orchestration, workers, capacité, résilience |
| [0313](0313-niveaux-maturite-et-criteres-certification.md) | Niveaux de maturité et critères de certification | Accepté | 2026-10-05 | Gouvernance, maturité, certification, métaphysique |
| [0314](0314-critere-reussite-global-et-matrice-statut.md) | Critère de réussite global et matrice de statut des concepts | Accepté | 2026-10-05 | Gouvernance, statut, transparence, audit |
| [0315](0315-terminologie-organisme-computationnel.md) | Terminologie : organisme computationnel vs biologique | Accepté | 2026-10-05 | Biomimétique, terminologie, anti-anthropomorphisme |
| [0316](0316-terminologie-controleur-multi-application-contrat.md) | Terminologie : contrôleur multi-application sous contrat | Accepté | 2026-10-05 | Sécurité, contrats, moindre privilège |
| [0317](0317-interdictions-structurelles-autonomie-autofix.md) | Interdictions structurelles : autonomie, auto-promotion, autofix | Accepté — Coercitif | 2026-10-05 | Sécurité, architecture, CI gate |
| [0318](0318-contrats-implementation-concepts.md) | Contrats d’implémentation des concepts | Accepté | 2026-10-05 | Registre philosophique, épistémologie, expérimentation |
| [0319](0319-raccord-contrats-philosophiques-ontogenese.md) | Raccord des contrats philosophiques au cycle Ontogenèse | Accepté | 2026-10-05 | Ontogenèse, registre philosophique, preuve |
| [0320](0320-compilation-procedurale-runtime.md) | Compilation procédurale runtime | Voir le fichier | -- | -- |
| [0321](0321-economie-cognitive-omega-topologies.md) | Économie cognitive Omega et topologies | Voir le fichier | -- | -- |
| [0322](0322-interop-gcir-omega-rust-node.md) | Interopérabilité G-CIR Omega Rust/Node | Voir le fichier | -- | -- |
| [0323a](0323-biscuit-delegation-workers.md) | Jetons Biscuit pour la délégation bornée | Accepté | 2026-10-06 | autorisation, sous-orchestration, délégation |
| [0323b](0323-frontieres-preuve-execution-omega.md) | Frontières de preuve et d’exécution Omega | Accepté pour le durcissement du runtime, pas comme certificat de complétude. | -- | -- |
| [0323c](0323-nce-procedures-et-preuves-executables.md) | NCE : procédures exécutables et preuves liées au phénotype | Accepté | 2026-10-05 | NCE, procédures, phénotype et preuves |
| [0323d](0323-reprise-atomique-natural-search.md) | Reprise atomique du Natural Search Control Plane | accepté | 2026-10-06 | contrôle de recherche, SQLite, preuves et reprise |
| [0324a](0324-biologie-execution-et-autorite-durable.md) | Biologie des exécutions et autorité durable | Voir le fichier | -- | -- |
| [0324b](0324-capsules-secretstream-transport.md) | Capsules transportables par flux authentifié | Accepté | 2026-10-06 | continuité, cryptographie, restauration |
| [0325a](0325-indicateurs-campagnes-et-frontieres-de-preuve.md) | Indicateurs, campagnes et frontières de preuve | Voir le fichier | -- | -- |
| [0325b](0325-regeneration-axolotl-executable.md) | Régénération Axolotl avec admission exécutable | Accepté | 2026-10-06 | Régénération, cognition, plasticité |
| [0326a](0326-audits-philosophiques-executables-et-preuves.md) | Audits philosophiques exécutables et preuves bornées | Voir le fichier | -- | -- |
| [0326b](0326-catalogue-nosologique-et-preuve-application.md) | Catalogue nosologique et preuve d'application | Accepté | 2026-10-06 | Nosologie, clinique computationnelle et preuves |
| [0327a](0327-aeis-preuves-et-autorite-persistante.md) | AEIS : preuves exécutables et autorité persistante | Voir le fichier | -- | -- |
| [0327b](0327-mesures-et-calibration-physique.md) | Mesures et calibration persistante de la physique computationnelle | Voir le fichier | -- | -- |
| [0327c](0327-trinity-comparaison-recherche-et-assemblage.md) | Comparaison commune, recherche et assemblage Trinity | Accepté | 2026-10-06 | Trinity, preuves, recherche expérimentale |
| [0328a](0328-cycle-standard-gvx-verifie-et-reprenable.md) | Cycle standard GVX vérifié et reprenable | Accepté | 2026-10-06 | GVX, exécution, preuves, reprise |
| [0328b](0328-laboratoire-qualite-diversite.md) | Laboratoire qualité-diversité et évolution bornée | Accepté | 2026-10-06 | morphogenèse, GVX, évaluation expérimentale |
| [0329a](0329-cloture-verifiable-runs-a-team.md) | Clôture vérifiable des runs A-Team | Accepté | 2026-10-06 | A-Team, dispatch, preuve et reprise |
| [0329b](0329-traces-otlp-apres-persistance.md) | Traces OpenTelemetry après persistance | Accepté | 2026-10-06 | observabilité, télémétrie, confidentialité |
| [0330a](0330-bancs-agentdojo-browsergym.md) | Bancs externes pour l'immunité et la navigation | Accepté | 2026-10-06 | évaluation, sécurité, navigation |
| [0330b](0330-effets-durables-metapopulation.md) | Effets durables et reprise vérifiée de Metapopulation | Voir le fichier | -- | -- |
| [0330c](0330-holobionte-missions-contractuelles-verifiees.md) | Missions Holobionte contractuelles et vérifiées | Accepté | 2026-10-06 | Holobionte, exécution, immunité, ressources et persistance |
| [0331a](0331-syncytium-rejeu-causal-et-preuve-de-completion.md) | Syncytium : rejeu causal et preuve de complétion | Voir le fichier | -- | -- |
| [0331b](0331-wasmtime-heuristiques-bornees.md) | Exécution Wasmtime des heuristiques bornées | Accepté | 2026-10-06 | plugins, GVX, isolation |
| [0332a](0332-adaptateur-openhands-sdk.md) | Adaptateur expérimental OpenHands SDK | Accepté | 2026-10-06 | workers développeurs, ontogenèse |
| [0332b](0332-capacites-morphogenese-runtime.md) | Exécution et provenance des cinq capacités de morphogenèse | Accepté | 2026-10-06 | Backend, morphogenèse, mémoire et observation résidente |
| [0332c](0332-delegation-workspaces-scelles-trinity.md) | ADR 0332 Délégation des workspaces scellés Trinity | Voir le fichier | -- | -- |
| [0332d](0332-rhizome-execution-verifiee-et-telemetrie-reelle.md) | Rhizome : exécution vérifiée et télémétrie réelle | Accepté | 2026-10-06 | Rhizome, routage, croissance, preuves et télémétrie |
| [0333a](0333-biocenose-cycle-persistant-et-finalisation.md) | Biocénose : cycle persistant et finalisation vérifiable | Accepté | 2026-10-06 | Biocénose, délibération, reprise, preuves |
| [0333b](0333-boucle-shev-et-reconciliation-durable.md) | Boucle SHEV et réconciliation durable | Voir le fichier | -- | -- |
| [0333c](0333-cloture-runtime-agow.md) | Clôture des contrats runtime AGOW | Accepté | 2026-10-06 | AGOW, budgets, persistance, preuve |
| [0333d](0333-reconciliation-activites-temporal.md) | Réconciliation des effets externes avant reprise Temporal | Accepté | 2026-10-06 | missions longues, effets externes, reprise |
| [0334a](0334-automerge-observations.md) | Automerge pour observations seulement | Accepté | 2026-10-06 | Syncytium, état partagé |
| [0334b](0334-biome-boucle-ecologique-transactionnelle.md) | Biome : boucle écologique transactionnelle et exécution vérifiée | Accepté | 2026-10-06 | Biome, écologie, ressources, persistance et preuves |
| [0334c](0334-cycle-morphogenetique-executable-et-isole.md) | Cycle morphogénétique exécutable et isolé | Voir le fichier | -- | -- |
| [0334d](0334-ontogenese-pilotage-reprise-et-retention.md) | Ontogenèse : pilotage opérateur, reprise et rétention vérifiables | Accepté | 2026-10-06 | Orchestration résidente, contrôle, persistance, exploitation |
| [0334e](0334-registre-executeurs-workers.md) | Registre des exécuteurs natifs des 19 workers | Accepté | 2026-10-06 | Workers, runtime, contrats, preuve |
| [0335a](0335-orchestrator-recus-proprietaires-et-cloture-prouvee.md) | Boucle orchestrator attendue et reçus propriétaires | Voir le fichier | -- | -- |
| [0335b](0335-propagation-differentielle.md) | Mesurer la propagation différentielle du Rhizome | Accepté | 2026-10-06 | Rhizome, RPE, calcul incrémental |
| [0336a](0336-cycle-resident-et-verification-des-daemons.md) | Cycle résident et vérification des daemons | Accepté | 2026-10-06 | Daemons, territoires, persistance, réparation et preuves |
| [0336b](0336-sonde-capnproto.md) | Sonde Cap'n Proto sans migration implicite | Accepté | 2026-10-06 | transport interne, sérialisation |
| [0337](0337-sonde-causale-shev.md) | Estimation causale exploratoire des interventions SHEV | Accepté | 2026-10-06 | SHEV, attribution des effets |
| [0338](0338-comparaison-dgm-gvx.md) | Comparer les archives DGM et GVX sous contrat identique | Accepté | 2026-10-06 | GVX, ontogenèse, recherche comparative |
| [0339](0339-traces-lean-dojo-et-dafny.md) | Traces LeanDojo-v2 et invariants Dafny | Accepté | 2026-10-06 | preuve formelle, budgets, leases |
| [0340](0340-commandes-xgrammar.md) | Commandes compactes sous XGrammar | Accepté | 2026-10-06 | décodage contraint, outils, budgets |
| [0341](0341-trinity-contrats-et-traces-de-qualification.md) | Trinity : contrats et traces de qualification | Accepté | 2026-10-06 | Qualification, provenance, replay |
| [0342](0342-trinity-identites-capsules-et-profils-executables.md) | Trinity : identités, capsules et profils exécutables | Accepté | 2026-10-06 | Identité, isolation, workers, provenance |
| [0343](0343-consommation-des-recus-avant-promotion.md) | Consommer les reçus avant les effets de promotion | accepté. | 2026-10-06. | -- |
| [0344](0344-refactorings-qualite-et-frontieres-de-controle.md) | Refactorings de qualité et frontières de contrôle | accepté. | 2026-10-07. | -- |
| [0345](0345-provenance-memoire-des-promotions.md) | Lier la mémoire de promotion à son exécution | accepté. | 2026-10-07. | -- |
| [0346](0346-journal-de-reprise-des-promotions.md) | Journal de reprise des promotions | Accepté | 2026-10-07 | Promotions, persistance et récupération |
| [0347](0347-clients-studio-et-vscode-de-reference.md) | Clients Studio et VS Code de référence | Accepté | 2026-10-07 | Consommateurs, interfaces et preuves |
| [0348a](0348-elimination-dette-historique-qualite.md) | Élimination de la dette historique de qualité | Accepté | 2026-10-07 | Qualité, services, orchestration |
| [0348b](0348-studio-modulaire-et-parcours-operateur.md) | Studio modulaire et parcours opérateur | Accepté | 2026-10-07 | Studio, contrats, exploitation, preuves |
| [0348c](0348-trois-pilotes-comparatifs-reproductibles.md) | Trois pilotes comparatifs reproductibles | Accepté | 2026-10-07 | Évaluation, modèles, mémoire et preuves |
| [0349](0349-manifeste-experimental-gvx-et-provenance-p1.md) | Manifeste expérimental GVX et provenance P1 | Accepté | 2026-10-07 | Expérimentation, contrats et provenance |
| [0350a](0350-cycle-immuable-des-claims-scientifiques.md) | Cycle immuable des claims scientifiques | Accepté | 2026-10-07 | Expérimentation, contrats et provenance |
| [0350b](0350-studio-parite-et-navigation-versionnee.md) | Studio : parité et navigation versionnée | Accepté. | 2026-10-07. | Studio, sessions, contrats et qualification. |
| [0351](0351-provenance-runtime-des-missions-et-references-gvx.md) | Provenance runtime des missions et références GVX | Accepté | 2026-10-07 | Expérimentation, contrats et provenance |
| [0352a](0352-enveloppe-immuable-et-revalidation-de-lautorite-runtime.md) | Enveloppe immuable et revalidation de l'autorité runtime | Accepté | 2026-10-07 | Autorité, missions, permissions, révocation, P1 L02 |
| [0352b](0352-studio-composition-et-inspecteurs-de-preuves.md) | Studio : composition et inspecteurs de preuves | Accepté. | 2026-10-07. | Studio, ergonomie et composants d’observation. |
| [0353](0353-delegation-worker-bornee-et-admission-runtime.md) | Délégation worker bornée et admission runtime | Accepté | 2026-10-07 | Autorité, délégation, budgets, P1 L02 |
| [0354](0354-oracle-semantique-natif-et-sujet-runtime-scelle.md) | Oracle sémantique natif et sujet runtime scellé | Accepté | 2026-10-07 | Oracles, postconditions, AEIS, P1 L03 |
| [0355](0355-cloture-native-par-oracles-budgetes-et-nonces-lies.md) | Clôture native par oracles budgétés et nonces liés | Accepté | 2026-10-07 | P1 L01, L02, L03 et L22, runtime, AEIS, promotion |
| [0356](0356-oracle-memoire-de-promotion-et-controle-de-lecture.md) | Oracle mémoire de promotion et contrôle de lecture | Accepté | 2026-10-07 | P1 L01, L03 et L22, mémoire, AEIS |
| [0357](0357-retraction-des-assemblees-et-memoires-derivees.md) | Rétraction des assemblées et mémoires dérivées | Accepté, qualification partielle de L01, L03 et L22. | -- | -- |
| [0358](0358-verification-memoire-native-sous-budget-durable.md) | Vérification mémoire native sous budget durable | Accepté, extension partielle L02/L03/L22. | -- | -- |
| [0359](0359-couts-durables-des-oracles-refuses-et-interrompus.md) | Coûts durables des oracles refusés et interrompus | Accepté, extension partielle L02/L03/L22, 2026-10-07. | -- | -- |
| [0360a](0360-oracle-code-borne-sur-artefact-scelle.md) | Oracle code borné sur artefact scellé | Accepté, extension partielle L02/L03/L22. | -- | -- |
| [0360b](0360-studio-cible-unifiee-et-zones-de-livraison.md) | Studio : cible unifiée et zones de livraison | Accepté pour le contrat de cible ; implémentation incrémentale à venir. | 2026-10-07. | Studio, architecture produit, couverture et qualification. |
| [0361a](0361-rejeu-apparie-avec-aleas-adresses.md) | Rejeu apparié avec aléas adressés | Accepté, extension partielle L01/L02/L04. | -- | -- |
| [0361b](0361-studio-socle-requetes-actions-et-brouillons.md) | Studio : socle des requêtes, actions et brouillons | Accepté ; livraison par points B01–B03, qualification bornée. | 2026-10-07. | Studio, transport, contexte, erreurs et conservation des entrées. |
| [0362a](0362-point-entree-du-pont-orchestration-mcp.md) | Exécuter le pont d’orchestration MCP et préserver ses échecs | accepté. | 2026-10-07. | -- |
| [0362b](0362-studio-parcours-pilote-borne-et-dependances.md) | Studio : parcours pilote borné et dépendances | Accepté ; qualification du pilote distincte de celle des missions générales. | 2026-10-07. | Studio, intégration HTTP, workspace, preuves et revue. |
| [0363a](0363-identite-des-messages-organisation-mcp.md) | Lier les messages d’organisation à l’identité runtime | accepté. | 2026-10-07. | -- |
| [0363b](0363-studio-parcours-genos-structurants.md) | Studio : parcours GenOS structurants | Accepté ; tranches livrées séparément, sans certification globale P04–P07. | 2026-10-07. | Studio, mondes, mémoire, AgentDNA et récupération. |
| [0364a](0364-autorite-budgetaire-dispatch-trinity-autonome.md) | Autorité budgétaire des dispatches Trinity autonomes | Accepté et implémenté. | 2026-10-14. | Dispatch Trinity et réservations de budget modèle. |
| [0364b](0364-selection-explicite-des-strategies-mcp.md) | Relier la stratégie demandée au sélecteur sous preuve | accepté. | 2026-10-07. | -- |
| [0364c](0364-studio-mecanismes-specialises.md) | Studio : mécanismes spécialisés et analyses bornées | Accepté ; qualification par tranche, pas des domaines complets. | 2026-10-07. | -- |
| [0365](0365-studio-boucle-production-locale.md) | Studio : boucle de production locale | Voir le fichier | -- | -- |
| [0366](0366-manifeste-snapshot-organisme.md) | Manifeste vérifiable de snapshot d'organisme | Accepté, portée backend partielle | 2026-10-10 | Snapshots, cohérence, intégrité |
| [0367](0367-sections-durables-snapshot-organisme.md) | Sections durables des snapshots d'organisme | Voir le fichier | -- | -- |
| [0368](0368-reprise-curseur-mission-et-frontieres-runtime.md) | Reprise du curseur de mission et frontières runtime | Accepté | 2026-10-10 | Snapshots, missions Rust |
| [0369](0369-racines-gqwf-et-vues-durables.md) | Racines de fichiers GQWF et vues durables | Accepté, portée noyau backend | 2026-10-10 | Workspaces, snapshots, isolation |
| [0370](0370-checkpoint-logique-local-et-continuite-llm-opaque.md) | Checkpoint logique local et continuité LLM opaque | Accepté, portée limitée | 2026-10-10 | Snapshots, runtime local, modèles |
| [0371](0371-raccordement-gqwf-aux-capsules-workers.md) | Raccorder les capsules workers aux vues GQWF | Accepté, activation explicite | 2026-10-10 | Workspaces, workers, snapshots |
| [0372](0372-fondation-garages-hierarchiques-et-plafond-projet.md) | Fondation des garages hiérarchiques et plafond projet | Accepté pour la tranche de sûreté ; hiérarchie non implémentée | 2026-10-10 | Garage Fabric, capacité, sous-orchestration |
| [0373](0373-barriere-capture-runtime-local-actif.md) | Capture du runtime local actif et reprise de session Codex | Accepté, portée limitée | 2026-10-10 | Snapshots, supervision des processus |
| [0374](0374-registre-durable-des-domaines-garage.md) | Registre durable des domaines Garage | Accepté pour la tranche SQLite locale | 2026-10-10 | Garage Fabric, capacité, sous-orchestration |
| [0375](0375-portabilite-snapshots-memoire.md) | Portabilité des snapshots mémoire | Négociation acceptée ; backend VM proposé | 2026-10-10 | Snapshots, runtime, portabilité |
| [0376](0376-plafond-projet-sur-ascendance-garage.md) | Plafond projet sur l'ascendance Garage | Accepté pour la tranche locale | 2026-10-10 | Garage Fabric, capacité projet, sous-orchestration |
| [0377](0377-consolidation-scientifique-par-references-versionnees.md) | Consolider les résultats scientifiques par références versionnées | Proposé ; raccordement de bout en bout non implémenté. | 2026-10-10. | Communication, preuves, GQWF, G-CIR. |
| [0378a](0378-reference-gqwf-dans-snapshot-organisme.md) | Référencer une racine GQWF dans un snapshot d'organisme | Accepté, activation explicite | 2026-10-10 | Snapshots d'organisme, fichiers, GQWF |
| [0378b](0378-reprise-des-baux-gqwf.md) | Reprise de la libération des baux GQWF | Accepté pour la tranche SQLite locale | 2026-10-10 | GQWF, matérialisation, reprise après panne |
| [0379](0379-octroi-borne-delegation-sous-orchestrateur.md) | Octroi borné de délégation au sous-orchestrateur | Accepté pour la tranche locale | 2026-10-10 | Sous-orchestration, contrats workers, jetons modèle |
| [0380](0380-journal-reprise-snapshot-organisme.md) | Journal de reprise des restaurations d'organisme | Voir le fichier | -- | -- |
| [0381](0381-autorite-recus-scientifiques-rejouable.md) | Autorité des reçus scientifiques restaurable par rejeu Lean | Voir le fichier | -- | -- |
| [0382](0382-publication-scientifique-ciblee-par-producteur.md) | Production et abonnement scientifique ciblés | Voir le fichier | -- | -- |
| [0383a](0383-economie-tokens-conditionnee-aux-preuves.md) | Économie de tokens conditionnée aux preuves | Accepté pour la tranche locale ; contrôleur conjoint proposé. | 2026-10-10. | Continuations, mémoire cognitive, routage et mesure. |
| [0383b](0383-restauration-opt-in-racine-gqwf-organisme.md) | Restaurer les fichiers d'organisme depuis une racine GQWF | Accepté, activation explicite | 2026-10-10 | Snapshots d'organisme, GQWF, restauration |
| [0383c](0383-studio-construction-workflows-canoniques.md) | ADR 0383 Construction de workflows canoniques dans Studio | Accepté pour une tranche de construction de workflows. | 2026-10-10. | Studio, construction, versions, exécution et publication. |
| [0384](0384-livraison-ciblee-des-decisions-mcp.md) | Livraison ciblée des décisions MCP | accepté | 2026-10-10 | signaux MCP, décisions collectives |
| [0385](0385-contrat-snapshot-topologique.md) | Contrat de vérification des snapshots topologiques | Accepté | 2026-10-10 | Topologies, snapshots, reprise |
| [0386](0386-restauration-etat-agent-mcp.md) | Restauration d'état d'agent par l'entrée MCP temporelle | accepté pour l'entrée backend hors catalogue public | 2026-10-10 | MCP, snapshots d'agent, restauration |
| [0387](0387-pont-nursery-replay-et-projection-evaluateur.md) | Pont nursery/replay et projection de l’évaluateur | Accepté pour l’intégration bornée | 2026-10-10 | Expériences GVX, replay et évaluation |
| [0388a](0388-portee-memoire-negative-et-parite-stdio-reelle.md) | Portée de la mémoire négative et parité stdio réelle | Accepté pour la qualification bornée | 2026-10-10 | Mémoire négative, scopes et consommateurs MCP |
| [0388b](0388-studio-vues-centrees-sur-les-taches.md) | Studio organisé par tâches visibles | Accepté | 2026-10-10 | Studio, navigation, densité et accessibilité |
| [0389](0389-autorite-des-consommateurs-memoire-rest-et-grpc.md) | Autorité des consommateurs mémoire REST et gRPC | Accepté pour la qualification bornée | 2026-10-10 | Principals, scopes, révocation et mémoire |
| [0390a](0390-fork-agent-depuis-snapshot-scelle.md) | Fork d'agent depuis un snapshot scellé | expérimental, service backend direct | 2026-10-10 | snapshots, workspaces isolés, filiation et budget |
| [0390b](0390-studio-surfaces-dominantes-et-inspecteurs.md) | ADR 0390 Studio : surfaces dominantes et inspecteurs contextuels | Accepté. | 2026-10-10. | Studio, présentation, navigation et accessibilité. |
| [0391](0391-mutation-ponctuelle-agentdna-candidate.md) | Substitution ponctuelle dans un AgentDNA candidat | accepté pour la création d'un candidat isolé | 2026-10-10 | AgentDNA, mutation candidate et Studio |
| [0392](0392-archive-heritee-fork-agent.md) | Archive héritée vérifiable pour un agent forké | expérimental, lecture seule | 2026-10-10 | mémoire durable, snapshots d'organisme, filiation |
| [0393](0393-budget-delegue-sous-orchestrateur-natif.md) | Budget délégué du sous-orchestrateur natif | accepté | 2026-10-10 | workers, délégation bornée, budget de tokens |
| [0394](0394-preflight-restauration-organisme.md) | Préflight vérifiable de restauration d'organisme | accepté, portée limitée | 2026-10-10 | snapshots d'organisme, restauration same-agent |
| [0395a](0395-attention-workspace-et-preuves-par-worker.md) | Attention du workspace et preuve par méthode native | Voir le fichier | -- | -- |
| [0395b](0395-memoire-autobiographique-individuelle-et-resultats-verifies.md) | Mémoire autobiographique individuelle et résultats vérifiés | Voir le fichier | -- | -- |
| [0395c](0395-regulation-supervisee-workers-natifs.md) | Régulation supervisée des workers natifs par checkpoint vérifié | Accepté pour les workers natifs en environnement simulé | 2026-10-10 | Exécution native, régulation, persistance, récupération |
| [0395d](0395-workspaces-prives-pour-capsules-de-workers.md) | Workspaces privés pour les capsules de workers | accepté | 2026-10-10 | workspaces, délégation, snapshots |
| [0396a](0396-credit-externe-regulation-workers.md) | Crédit externe mesuré pour la régulation des workers | En cours | 2026-10-11 | Régulation, ressources, orchestration, preuves |
| [0396b](0396-frontiere-corporelle-agent-et-provenance.md) | Frontière corporelle et provenance du soi agentique | accepté, portée Node | 2026-10-10 | corps de l'orchestrator, action motrice, CoreSelf |
| [0396c](0396-observation-continue-des-workers-supervises.md) | Observer les workers supervisés pendant leur mission | Accepté pour le chemin des workers non natifs | 2026-10-10 | workers, supervision, perception continue |
| [0397a](0397-perception-des-workers-natifs-et-revision-locale.md) | Perception native et révision du prompt local | Accepté, promotion des résultats révisés bloquée | 2026-10-10 | workers, perception, exécution locale |
| [0397b](0397-recus-corporels-et-limites-de-provenance.md) | Reçus corporels et limites de provenance | accepté, portée Node et missions scellées | 2026-10-10 | modèle corporel, autorité de mission, MCP, provenance des claims |
| [0397c](0397-relecture-preuve-worker-termine.md) | Relecture bornée des preuves de workers terminés | accepté, implémenté | 2026-10-12 | Autorité, orchestration, preuves déléguées |
| [0398a](0398-capacite-mcp-et-ecritures-directes.md) | Capacité MCP et écritures directes | accepté, couverture conditionnelle | 2026-10-11 | identité d'agent, MCP Rust, fichiers, claims |
| [0398b](0398-oracle-subset-sum-procedural-direct.md) | Oracle de `subset_sum` pour le worker procédural direct | accepté | 2026-10-11 | workers natifs, preuve indépendante, promotion |
| [0399a](0399-commit-versionne-et-profil-morphologique.md) | Commit versionné et profil morphologique dans le graphe | Accepté | 2026-10-11 | Morphogenèse, transitions et profils de topologie |
| [0399b](0399-liaison-recu-promotion-gqwf.md) | Lier le reçu de promotion GQWF à la tête et aux octets | Accepté pour la frontière de publication du noyau backend. | 2026-10-11. | GQWF, preuves, promotion. |
| [0399c](0399-oracles-observation-workers-bornes.md) | Oracles bornés pour les workers d'observation | accepté | 2026-10-11 | workers natifs, observations, preuves et promotion |
| [0400a](0400-autorite-et-quiescence-des-sessions-biome.md) | Autorité et quiescence des sessions Biome | Accepté le 11 octobre 2026. | -- | -- |
| [0400b](0400-oracles-workers-deterministes-structures.md) | Oracles de workers déterministes à sorties structurées | accepté | 2026-10-11 | workers déterministes, preuves indépendantes et promotion |
| [0400c](0400-promotion-trinity-gqwf-opt-in.md) | Publier une racine GQWF depuis une promotion Trinity vérifiée | Accepté, activation explicite. | 2026-10-11. | Trinity, GQWF, promotion. |
| [0401a](0401-oracle-formel-lean-borné.md) | Oracle formel Lean borné pour le worker formel | accepté | 2026-10-11 | preuve formelle, workers et promotion |
| [0401b](0401-preuve-arret-mission-holobionte.md) | Preuve de clôture des missions Holobionte | accepté, portée limitée | 2026-10-11 | verdict métier, cycle de vie Holobionte, snapshot topologique |
| [0402a](0402-execution-publique-explicite-biocenose.md) | Exécution publique explicite de Biocénose | accepté | 2026-10-11 | Biocénose, MCP, délibération persistante |
| [0402b](0402-oracles-workers-recuperation-et-passation.md) | Oracles bornés de récupération et de passation | accepté | 2026-10-11 | workers, récupération et coordination |
| [0403a](0403-frontiere-quiescente-metapopulation.md) | Frontière quiescente des snapshots Métapopulation | Voir le fichier | -- | -- |
| [0403b](0403-oracles-workers-structures-bornes.md) | Oracles pour les workers structurés bornés | accepté | 2026-10-11 | workers natifs, exécution et preuve |
| [0404](0404-liaison-mission-et-snapshot-rhizome.md) | Liaison de mission et frontière de snapshot Rhizome | Accepté | 2026-10-11 | Rhizome, identité de mission, reprise |
| [0405](0405-materialisation-syncytium-preuve-de-cloture.md) | Matérialisation Syncytium avant preuve de clôture | Accepté | 2026-10-11 | Syncytium, MCP, clôture de mission |
| [0406](0406-frontieres-preuves-variants-trinity.md) | Frontières de preuve des variants Trinity | Accepté, avec qualification de mission réelle encore ouverte. | -- | -- |
| [0407](0407-frontiere-post-mission-morphogenese.md) | Frontière de la morphogenèse après mission | accepté | 2026-10-11 | orchestrateur public, morphogenèse, autorité |
| [0408](0408-frontiere-preuve-multiteam-a-team.md) | Frontière de preuve des sous-runs A-Team multiteam | accepté | 2026-10-11 | A-Team, multiteam, autorité et preuves |
| [0410](0410-reprise-publique-liee-a-la-communaute-biocenose.md) | Reprise publique liée à la communauté Biocénose | accepté | 2026-10-11 | Biocénose, MCP, identité de session |
| [0411](0411-appelant-lie-session-syncytium.md) | Appelant lié à la session Syncytium | Accepté | 2026-10-11 | Syncytium, identité MCP, frontières de session |
| [0412](0412-pont-rust-morphogenese-lecture-seule.md) | Pont Rust de décision morphogénétique en lecture seule | accepté | 2026-10-11 | orchestrateur public, noyau Rust, gouvernance |
| [0413](0413-preparation-durable-sous-runs-a-team.md) | Préparation durable des sous-runs A-Team | accepté | 2026-10-11 | A-Team multiteam, autorité orchestrateur, budget |
| [0414](0414-approbation-liee-a-laction-human-ai-syncytium.md) | Approbation liée à l'action Human–AI Syncytium | Accepté | 2026-10-11 | Syncytium, Human–AI, autorité humaine |
| [0415](0415-qualification-nominale-trinity-sur-traces-durables.md) | Qualification nominale Trinity sur traces durables | Accepté, qualification des douze variants en attente de missions post-correctifs | -- | -- |
| [0416](0416-propositions-rust-liees-snapshot-morphologie.md) | Propositions Rust liées au snapshot de morphologie | accepté | 2026-10-11 | morphogenèse après mission, persistance, noyau Rust |
| [0417](0417-liaison-recus-hybrid-oracle-biocenose.md) | Liaison des reçus Hybrid Oracle à leur périmètre | accepté | 2026-10-11 | Biocénose, Hybrid Oracle Community, preuves factuelles |
| [0418](0418-fermeture-commit-morphologie-et-recu-rust.md) | Fermer le commit morphologique déclaratif et conserver le refus Rust | accepté | 2026-10-11 | morphogenèse, graphe versionné, décision Rust |
| [0419](0419-capacite-reelle-du-travail-compute-biome.md) | Capacité du fournisseur liée au travail Compute de Biome | Accepté le 11 octobre 2026. | -- | -- |
| [0420a](0420-contrat-issue-mission.md) | Contrat explicite d'issue de mission | Voir le fichier | -- | -- |
| [0420b](0420-frontiere-contrat-outil-holobionte.md) | Contrat persistant avant invocation d'un outil Holobionte | Accepté. | -- | -- |
| [0421](0421-transitions-de-variant-liees-a-la-session-rhizome.md) | Transitions de variant liées à la session Rhizome | Accepté | 2026-10-11 | Rhizome, variants, persistance et confidentialité |
| [0422](0422-liaison-des-resultats-solveur-metapopulation.md) | Lier le résultat du solveur à son îlot et à sa preuve | Accepté le 11 octobre 2026. | -- | -- |
| [0423](0423-fermeture-mode-commit-v2-morphogenese.md) | Fermer le mode commit injectable de Morphogenèse V2 | accepté | 2026-10-11 | morphogenèse, autorité, transition de production |
| [0424](0424-promotion-conditionnelle-des-sous-runs-a-team.md) | Observation des sous-runs A-Team sans promotion | Accepté le 11 octobre 2026. | -- | -- |
| [0425](0425-liaison-campagne-nominale-trinity-aux-scellages.md) | Lier la campagne nominale Trinity aux scellages durables | Accepté. | -- | -- |
| [0426](0426-consentement-explicite-human-ai-syncytium.md) | Consentement explicite avant l'action Human–AI Syncytium | Accepté | 2026-10-11 | Syncytium, Human–AI, autorité humaine |
| [0427](0427-recus-signes-hybrid-oracle-biocenose.md) | Reçu signé lié au claim pour Hybrid Oracle | accepté | 2026-10-11 | Biocénose, Hybrid Oracle Community, promotion factuelle |
| [0428a](0428-chaine-de-transferts-relay-team-a-team.md) | Chaîne de transferts Relay Team A-Team | Accepté le 11 octobre 2026. | -- | -- |
| [0428b](0428-journal-des-tentatives-modele.md) | Journal des tentatives modèle | Voir le fichier | -- | -- |
| [0428c](0428-oracle-subset-pour-executeur-procedural.md) | Oracle subset_sum pour l'exécuteur procédural | accepté | 2026-10-11 | workers, preuve indépendante, promotion native |
| [0429a](0429-gates-trinity-lies-au-journal-de-comparaison.md) | Lier les gates Trinity au journal de comparaison | Accepté. | -- | -- |
| [0429b](0429-reutilisation-procedurale-validee.md) | Réutilisation procédurale validée avant le routage modèle | Voir le fichier | -- | -- |
| [0430a](0430-devis-prudent-des-couts-d-action.md) | Devis prudent des coûts d'action | Accepté pour le module de devis ; intégration au contrôleur à qualifier. | 2026-10-11. | Décision, budget et économie de tokens. |
| [0430b](0430-fermeture-transition-collective-sans-snapshot-restaurable.md) | Refuser la transition collective sans snapshot restaurable | accepté | 2026-10-11 | morphogenèse, transition collective, autorité |
| [0431a](0431-horloge-runtime-baux-syncytium.md) | Horloge du runtime pour les baux Syncytium | Accepté | 2026-10-11 | Syncytium, Hard, Human–AI, baux |
| [0431b](0431-reservation-atomique-des-budgets-modele.md) | Réservation atomique des budgets de modèle | accepté pour la route de modèle Node | 2026-10-11 | budget de mission, appels concurrents et reprise |
| [0432a](0432-execution-explicite-des-cycles-de-communication.md) | Exécution explicite des cycles de communication | Accepté pour le pilote de communication ; transport et économies globales à qualifier. | 2026-10-11. | Communication, grounding et comptabilité des tokens. |
| [0432b](0432-preuve-par-candidat-et-promotion-unique-open-ended-biome.md) | Preuve par candidat et promotion unique dans Open-Ended Biome | Accepté le 11 octobre 2026. | -- | -- |
| [0433](0433-apprentissage-routeur-sur-verdicts-aeis.md) | Apprentissage du routeur sur verdicts AEIS persistés | Accepté pour le raccord local ; qualification de production ouverte. | 2026-10-11. | Routage de modèles, apprentissage, canary et mesure. |
| [0434a](0434-deadline-des-reprises-de-route-rhizome.md) | Conserver la deadline lors d'une réparation Rhizome | Accepté. | -- | -- |
| [0434b](0434-qualification-independante-des-missions-workers.md) | Qualification indépendante des résultats de mission workers | Accepté pour un contrôle autonome ; intégration au parcours de campagne ouverte. | 2026-10-11. | preuves, qualification des workers. |
| [0435](0435-identite-du-daemon-planifie-metapopulation.md) | Lier le daemon résident au plan Métapopulation | accepté | 2026-10-11 | Métapopulation, variant `persistent`, vérification |
| [0436a](0436-controleur-commun-decision-shadow.md) | Contrôleur commun de décision en mode shadow | Accepté pour le module de décision déterministe ; activation de production non qualifiée. | 2026-10-11. | Décision, preuve et économie de tokens. |
| [0436b](0436-reconciliation-actions-ecologiques-biocenose.md) | Réconcilier les actions écologiques incertaines de Biocénose | Accepté | 2026-10-11 | Biocénose, actions externes, reprise |
| [0437](0437-immutabilite-sources-recu-morphogenese.md) | Rendre append-only les sources du reçu Morphogenèse | accepté | 2026-10-11 | morphogenèse, graphe préparé, décision consultative |
| [0438](0438-statut-planifie-runtime-isole-multiteam-a-team.md) | Statut planifié du runtime isolé Multiteam A-Team | Accepté | 2026-10-11 | A-Team, variant `multiteam`, exécution |
| [0439](0439-rapports-initiaux-durables-pour-qualification-trinity.md) | Rapports initiaux durables pour qualifier Trinity | Accepté | 2026-10-11 | Trinity, campagne nominale, journaux durables |
| [0440](0440-bail-outil-immuable-holobionte.md) | Rendre le bail d'outil immuable jusqu'à l'invocation Holobionte | Accepté | 2026-10-11 | Holobionte, variant `tool`, autorité d'invocation |
| [0441a](0441-atomicite-recu-consultatif-morphogenese.md) | Atomicité du reçu consultatif Morphogenèse | Accepté | 2026-10-12 | morphogenèse, persistance des preuves, SQLite |
| [0441b](0441-dossier-identite-universel-agent.md) | Dossier d'identité commun aux agents | Accepté | 2026-10-14 | Identité, agents, runtime |
| [0441c](0441-oracle-borne-issue-mission.md) | Oracle borné dans le contrat d'issue de mission | Voir le fichier | -- | -- |
| [0442](0442-preuve-route-actuelle-rhizome.md) | Lier la complétion Rhizome au chemin actuellement autorisé | Accepté | 2026-10-12 | Rhizome, variants, preuves de route |
| [0443](0443-preuve-revision-branche-speculative-syncytium.md) | Lier la validation spéculative à la révision de branche | Accepté | 2026-10-12 | Syncytium, variant Speculative, promotion |
| [0444a](0444-enfants-depuis-elites-admises-biome.md) | Produire les enfants Quality-Diversity depuis les élites admises | Accepté | 2026-10-12 | Biome, Quality-Diversity, archive des élites |
| [0444b](0444-execution-attestee-du-controleur-de-mission.md) | Exécution attestée du contrôleur de mission | Accepté pour une activation pilote explicite. | 2026-10-12. | Décision économique, provenance et exécution de mission. |
| [0445a](0445-pont-preuve-mission-vers-apprentissage-routeur.md) | Lier l'apprentissage du routeur à une mission vérifiée | Voir le fichier | -- | -- |
| [0445b](0445-refus-des-champs-non-scelles-snapshot-topologique.md) | Refuser les champs non scellés du snapshot topologique | accepté | 2026-10-12 | snapshots topologiques, intégrité, frontière Morphogenèse |
| [0446a](0446-refus-des-affectations-orphelines-en-quiescence-metapopulation.md) | Refus des affectations orphelines en quiescence Métapopulation | Accepté | 2026-10-12 | Métapopulation, snapshots, quiescence |
| [0446b](0446-selection-contexte-obligations-ouvertes.md) | Sélection du contexte selon les obligations ouvertes | Accepté pour le raccord de démarrage ; mesure en production ouverte. | 2026-10-12. | Mémoire cognitive, contrat d'issue et budget de contexte. |
| [0447a](0447-lier-resolution-et-score-forecasting-biocenose.md) | Lier résolution et score du variant Forecasting Crowd | Accepté | 2026-10-12 | Biocénose, Forecasting Crowd, preuve de calibration |
| [0447b](0447-portee-budget-modele-parent-et-workers.md) | Portée de budget modèle commune au parent et aux workers | accepté pour le worker local en processus | 2026-10-12 | budget de mission et délégation |
| [0448a](0448-liaison-monde-promu-candidat-trinity.md) | Lier le monde promu au candidat Trinity | Accepté | 2026-10-12 | Trinity, qualification nominale, provenance du candidat |
| [0448b](0448-observation-couts-modele-dans-recu-worker.md) | Observer le coût modèle dans le reçu worker | Accepté pour la liaison comptable ; apprentissage bout en bout différé. | 2026-10-12. | -- |
| [0449](0449-raccord-checkpoint-communication-et-couts-par-agent.md) | Raccord du checkpoint de communication et coûts par agent | Accepté pour le canal `SIGNAL` des checkpoints ; économies globales à mesurer. | 2026-10-12. | Communication d'équipe, grounding et comptabilité des tokens. |
| [0450](0450-liaison-sortie-modele-oracle-independant.md) | Lier la sortie du modèle au résultat de l'oracle | Accepté pour le refus fermé ; domaine modèle encore absent. | 2026-10-12. | -- |
| [0451](0451-portee-budget-modele-runtime-local-sous-processus.md) | Portée de budget modèle dans le runtime local en sous-processus | accepté pour le runtime `local-codex-runtime.cjs` | 2026-10-12 | budget de mission et exécution déléguée |
| [0452](0452-execution-procedure-mission.md) | Exécution de procédures promues dans une mission | Voir le fichier | -- | -- |
| [0453](0453-budget-partage-des-runtimes-modeles-externes.md) | Budget partagé des runtimes modèles externes | Voir le fichier | -- | -- |
| [0454](0454-oracle-natif-pour-reponse-modele-mesuree.md) | Oracle natif pour une réponse modèle mesurée | Accepté pour le parcours borné `model_subset_sum`. | -- | -- |
| [0455](0455-refus-budget-partage-codex-cli-sans-recu-usd.md) | Refuser le budget partagé de Codex CLI sans reçu USD | Voir le fichier | -- | -- |
| [0456](0456-transport-natif-et-comparaison-cycles-communication.md) | Transport natif et comparaison des cycles de communication | Accepté pour le canal `SIGNAL` ; gain net non démontré. | 2026-10-12. | Communication d'équipe et mesure des tokens. |
| [0457](0457-ingestion-routeur-cloture-worker-verifiee.md) | Ingestion du routeur à la clôture worker vérifiée | Accepté pour les missions worker dont la tentative modèle et la preuve native so | -- | -- |
| [0460](0460-quorum-lie-aux-membres-expert-committee.md) | Quorum lié aux membres d'Expert Committee | Accepté | 2026-10-12 | A-Team, variant `expert_committee`, consensus |
| [0461](0461-verificateurs-independants-holobionte.md) | Exclure l'hôte et l'acteur des vérificateurs de mission Holobionte | Accepté | 2026-10-12 | Holobionte, douze variants, autorité des preuves |
| [0462](0462-lier-recu-route-session-rhizome.md) | Lier les reçus de route Rhizome à leur session | Accepté | 2026-10-12 | Rhizome, preuves, isolation des missions |
| [0463](0463-lier-workers-au-graphe-prepare-morphogenese.md) | Lier les workers au graphe préparé Morphogenèse | Accepté | 2026-10-12 | morphogenèse, preuve consultative, graphe préparé |
| [0464](0464-generation-locale-de-propositions-de-code-worker.md) | Génération locale bornée des propositions de code worker | Accepté, qualification C2/C3 vérifiée sur Windows; checkout exploratoire | 2026-10-12 | Workers locaux, code, budgets, autorité, preuve |
| [0465](0465-preuve-des-reevaluations-open-ended-biome.md) | Preuve des réévaluations Open-Ended du Biome | Accepté le 12 octobre 2026. | -- | -- |
| [0466](0466-preuve-de-reserve-fondatrice-metapopulation.md) | Preuve de réserve fondatrice Métapopulation | Voir le fichier | -- | -- |
| [0467](0467-lier-identite-interne-graphe-prepare-morphogenese.md) | Lier l'identité interne du graphe préparé Morphogenèse | Accepté | 2026-10-12 | morphogenèse, snapshot préparé, intégrité des références |
| [0468](0468-scellement-panel-representatif-biocenose.md) | Lier la distribution Biocénose au panel représentatif scellé | Accepté | 2026-10-12 | Biocénose, Representative Community, preuve de promotion |
| [0469](0469-identite-causale-et-reconnaissance-des-agents.md) | Identité causale et reconnaissance des agents | Accepté | 2026-10-14 | Identité, continuité, mémoire, relations |
| [0470](0470-budgets-de-generation-locale-trinity.md) | Budgets d’inférence locale pour Trinity | Accepté et implémenté. | 2026-10-14. | Temps d’exécution des workers Trinity avec modèles locaux. |
| [0471](0471-lier-les-dispatches-autonomes-au-workspace.md) | Lier les dispatches autonomes au workspace déclaré | Accepté et implémenté. | 2026-10-14. | Identité tenant des dispatches d’orchestration directs. |
| [0472](0472-separer-execution-worker-et-promotion.md) | Séparer l’exécution worker de la promotion | Accepté et implémenté | 2026-10-14 | Supervision des missions Trinity et promotion des preuves. |
| [0473](0473-preflight-partage-des-missions.md) | Préflight partagé des missions Ontogenesis | Accepté et implémenté | 2026-10-14 | Admission et audit des capacités génériques et canoniques. |
| [0474](0474-contrats-homeostasie-recus-rust-division.md) | Invariants d’homéostasie liés aux reçus Rust de division | Accepté et implémenté | 2026-10-14 | Vérification structurale d’une division Rust précise, indépendante des reçus worker. |
| [0475](0475-invalider-preferences-apres-transition-organisation.md) | Invalidation des préférences après transition d'organisation | Accepté et implémenté | 2026-10-14 | Purge post-commit du classement de survivants de l'ancienne topologie. |
| [0476](0476-preflight-et-gates-des-axes-trinity.md) | Préflight des variantes et gates d’évidence Trinity | Accepté et implémenté | 2026-10-14 | Compatibilité des axes, confiance des reçus, gates fail-closed et limites contrefactuelles. |
| [0477](0477-refuser-dispatch-preflight-non-verifie.md) | Refuser le dispatch si le préflight d’exécution est non vérifié | Accepté et implémenté | 2026-10-14 | Ontogenesis, admission des missions et contrat d’exécution. |
| [0478](0478-lier-idempotence-http-au-corps-de-requete.md) | Lier l’idempotence HTTP au corps de requête | Accepté et implémenté | 2026-10-14 | Rejeu de réponse borné au corps reçu, avec réservation incertaine conservée. |
| [0479](0479-refuser-la-preemption-garage-des-sessions-topologiques.md) | Refuser la préemption Garage des sessions topologiques | Accepté et implémenté | 2026-10-14 | Garage Fabric, capsules et cohérence des topologies. |
| [0480](0480-refuser-la-promotion-sans-rejeu-execution-lie.md) | Refuser la promotion sans rejeu d’exécution lié au run | Accepté et implémenté pour le refus ; producteur de reçu à réaliser. | 2026-10-14 | Exécution de stratégie, rejeu déterministe et promotion. |
| [0481](0481-autorite-et-recu-des-overrides-production.md) | Autorité et reçu pour les overrides de promotion en production | Accepté et implémenté. | 2026-10-14 | Releases, autorité de production et audit des décisions. |
| [0482](0482-atomicite-mesures-et-decision-rollout.md) | Atomicité entre mesures et décision de rollout | Accepté et implémenté. | 2026-10-14 | Rollouts, métriques et gate de promotion de release. |
| [0483](0483-promotion-rollout-fondee-sur-le-candidat.md) | Fonder la promotion du rollout sur le candidat | Accepté et implémenté. | 2026-10-14 | Rollouts A/B et promotion de release. |
| [0484](0484-identifier-explicitement-le-candidat-du-rollout.md) | Identifier explicitement le candidat du rollout | Accepté et implémenté. | 2026-10-14 | Rollouts canary/A/B et promotion de release. |
| [0485](0485-atomicite-creation-rollout-et-variantes.md) | Atomicité de création du rollout et de ses variantes | Accepté et implémenté. | 2026-10-14 | Persistance des rollouts et agrégats de métriques. |
| [0486](0486-frontiere-de-confiance-du-transfert-hgt.md) | Frontière de confiance du transfert HGT | Proposé | 2026-10-14 | Transfert horizontal de plasmides, autorité et reçus. |
| [0487a](0487-recus-communication-inter-agents.md) | Reçus de communication inter-agents | Accepté | 2026-10-14 | Messagerie multi-agent, destinataires effectifs, lecture et acquittement. |
| [0487b](0487-votes-electrocytaires-signes-et-rejouables.md) | Votes électrocytaires signés et rejouables | Décidé pour le contrat Rust v1; le provisionnement de confiance et les transports restent ouverts. | 2026-10-15 | Quorum électrocytaire, identité des votants et reçus durables. |
| [0488](0488-borner-les-recherches-de-provenance.md) | Borner les recherches de provenance MCP | Accepté et implémenté. | 2026-10-14 | `genos_blame`, `genos_lineage` et extraction d'évidence. |
| [0489](0489-scoper-les-recherches-de-provenance-au-workspace.md) | Scoper les recherches de provenance au workspace | Accepté et implémenté. | 2026-10-14 | Autorisation MCP, provenance et isolation des workspaces. |
| [0490a](0490-borner-le-pruning-synaptique-au-workspace.md) | Borner le pruning synaptique au workspace authentifié | Accepté et implémenté. | 2026-10-14 | Autorité MCP et mutations du graphe mémoire. |
| [0490b](0490-flux-neuro-glial-de-mission-au-cli-experimental.md) | Flux neuro-glial de mission au CLI expérimental | Accepté pour le contrat CLI local expérimental | 2026-10-15 | Neurobiologie, glie, journal de mission |
| [0491](0491-scoper-les-inhibitions-synaptiques-au-projet.md) | Scoper les inhibitions synaptiques au projet | Accepté et implémenté. | 2026-10-15 | Recherche mémoire et isolation des projets. |
| [0492](0492-refuser-la-promotion-des-resultats-provisoires.md) | Refuser la promotion des résultats provisoires | Accepté, transition de champion implémentée. | 2026-10-15 | Mémoire de requête, statut et champion courant. |
| [0493a](0493-exiger-le-snapshot-complet-des-dependances.md) | Exiger le snapshot complet des dépendances | Accepté et implémenté pour la réutilisation mémoire. | 2026-10-15 | Réutilisation des résultats et invalidation. |
| [0493b](0493-route-backend-registre-metabolique.md) | Route backend du registre métabolique expérimental | Accepté pour le parcours local expérimental | 2026-10-15 | `MetabolicPool`, autorisation de mission, pont backend/Rust |
| [0494](0494-scoper-la-memoire-de-requete-au-workspace.md) | Scoper la mémoire de requête au workspace | Accepté et implémenté pour `bestKnownResultService`. | 2026-10-15 | Cache de résultats et isolation des workspaces. |
| [0495](0495-rendre-atomiques-les-promotions-de-resultats.md) | Rendre atomiques les promotions de résultats | Accepté et implémenté pour `bestKnownResultService`. | 2026-10-15 | Cohérence des champions et écritures SQLite. |
| [0496](0496-exiger-un-recu-de-verification-lie-au-resultat.md) | Exiger un reçu de vérification lié au résultat | Accepté et implémenté pour la mémoire de requête. | 2026-10-15 | Preuve avant promotion du cache de résultats. |
| [0497](0497-scoper-la-refutation-et-effacer-le-champion.md) | Scoper la réfutation et effacer le champion | Accepté et implémenté pour la mémoire de requête. | 2026-10-15 | Scope, reçu de contre-exemple et cohérence après réfutation. |
| [0499](0499-scoper-linvalidation-des-resultats.md) | Scoper l’invalidation des résultats | Accepté et implémenté pour la mémoire de requête. | 2026-10-15 | Isolation workspace du passage à l’état STALE. |
| [0500](0500-revalider-la-preuve-avant-reutilisation.md) | Revalider la preuve avant réutilisation | Accepté et implémenté pour la mémoire de requête. | 2026-10-15 | Intégrité des champions en cache. |
| [0501](0501-lier-le-pointeur-champion-a-son-probleme.md) | Lier le pointeur champion à son problème | Accepté et implémenté pour la mémoire de requête. | 2026-10-15 | Prévention d'une lecture croisée entre workspaces. |
| [0502](0502-propager-les-erreurs-de-lecture-du-cache.md) | Propager les erreurs de lecture du cache | Accepté et implémenté pour la mémoire de requête. | 2026-10-15 | Cohérence des lectures et du versionnement. |
| [0503](0503-memoriser-la-migration-de-la-memoire-par-connexion.md) | Mémoriser la migration mémoire par connexion | Accepté et implémenté pour la mémoire de requête. | 2026-10-15 | Latence d'accès et concurrence à l'initialisation. |
| [0504](0504-exiger-le-snapshot-courant-meme-vide.md) | Exiger le snapshot courant, même vide | Accepté et implémenté pour la réutilisation mémoire. | 2026-10-15 | Distinction entre snapshot vide et absent. |
| [0505](0505-scoper-les-lectures-de-probleme.md) | Scoper les lectures de problème | Accepté et implémenté pour la mémoire de requête. | 2026-10-15 | Éviter l'accès aux entrées historiques non scoppées. |
| [0506](0506-rapporter-le-statut-apres-invalidation.md) | Rapporter le statut après invalidation | Accepté et implémenté pour la mémoire de requête. | 2026-10-15 | Cohérence du verdict de cache et du statut persistant. |
| [0507](0507-echouer-si-la-phase-diff-replay-nest-pas-applicable.md) | Échouer si la phase diff/replay n'est pas applicable | Accepté et implémenté pour la phase stratégie. | 2026-10-15 | Un contexte absent ne valide plus silencieusement le replay. |
| [0508](0508-refuser-une-intersection-vide-de-lease.md) | Refuser une intersection vide de lease | Accepté et implémenté pour les contraintes de focus. | 2026-10-15 | Une contrainte incompatible ne restaure pas les outils du lease initial. |
| [0509](0509-borner-la-lease-mcp-par-le-budget-de-mission.md) | Borner la lease MCP par le budget de mission | Accepté et implémenté pour le runtime Codex. | 2026-10-15 | Propagation de l'échéance jusqu'au serveur MCP. |
| [0510](0510-borner-les-budgets-du-runtime-codex.md) | Borner les budgets des runtimes d'agents | Accepté et implémenté pour les gardes Node Codex, local et Solar. | 2026-10-15 | Plafonds finis par défaut et arrêt sur valeur explicite invalide. |
| [0511](0511-rejouer-le-crossover-sans-avancer-le-tick.md) | Rejouer un crossover sans avancer le tick | Accepté et implémenté pour les commandes CLI crossover isolées. | 2026-10-15 | Les retries ne mutent pas une mission avant de restaurer son reçu. |
| [0512](0512-appliquer-le-budget-cpu-au-runtime-worker-node.md) | Appliquer le budget CPU au runtime worker Node | Accepté et implémenté pour le PID du runtime Node sur Windows et Linux. | 2026-10-15 | Supervision de worker et budgets d'exécution. |
| [0513](0513-refuser-un-rejeu-de-strategie-sans-recu-lie-au-run.md) | Refuser un rejeu de stratégie sans reçu lié au run | Accepté et implémenté pour le garde de phase; producteur de rejeu complet à réaliser. | 2026-10-15 | Exécution de stratégie et promotion. |
| [0514](0514-route-backend-cellule-de-garde-experimentale.md) | Route backend pour la cellule de garde expérimentale | Accepté pour le parcours local expérimental | 2026-10-15 | Cellule de garde, backpressure et pont backend/Rust |
| [0517](0517-lier-les-recus-metaboliques-aux-identites-de-commande.md) | Lier les reçus métaboliques aux identités de commande | Accepté | 2026-10-15 | Cellules biologiques, reçus durables, pont backend/Rust |
| [0520](0520-recevoir-la-verification-avant-la-completion-ontogenesis.md) | Produire la preuve indépendante avant la completion Ontogenesis | Accepté | 2026-10-15 | Ontogenesis, preuves d'exécution, promotion |
| [0523](0523-lier-la-calibration-brier-a-un-recu-de-resolution.md) | Lier la calibration Brier à un reçu de résolution | Accepté | 2026-10-15 | Biocénose, calibration, autorité des outcomes |

> **Identifiants numériques partagés** : certains numéros sont portés par
> plusieurs fichiers, en plus de `003x` (format historique gelé). Les
> fichiers sont conservés tels quels (renommage interdit sans migration
> de provenance, ADR 0005) ; l'index les distingue par suffixe (`0063a`,
> `0063b`, …). Vérifié par `python scripts/ci/check_adr_index.py`.
## Cycle de vie d'un ADR

- **Proposé** — rédigé, en revue.
- **Accepté** — décision appliquée.
- **Remplacé** — obsolète, remplacé par un ADR plus récent (référence croisée obligatoire).
- **Rejeté** — option écartée, conservée pour la traçabilité.

## Ajouter un ADR

1. Créer `docs/adr/NNNN-slug.md` (numérotation à 4 chiffres, jamais réutilisée ;
   `003x` est un format historique gelé, ne pas l'imiter).
2. Reprendre l'en-tête : `Statut`, `Date`, `Domaine`, `Décideurs`, `Lié à`.
3. Structurer : `Contexte`, `Décision`, `Conséquences` (Positives / Négatives), `Alternatives`.
4. Mettre à jour l'index : `python scripts/ci/check_adr_index.py --update`
   (couvre tous les fichiers, désambiguïse les numéros partagés par suffixe
   `a`/`b` sans renommer les fichiers — chemins scellés, ADR 0005),
   puis la section ADR de [../README.md](../README.md).

## Voir aussi

- [../CONVENTIONS.md](../CONVENTIONS.md) — conventions de rédaction et de nommage.
- [../GENOME_EPIGENETIQUE.md](../01-concepts/genome-et-epigenetique.md), [../INSTINCT.md](../01-concepts/instinct.md), [../FOSSILISATION.md](../01-concepts/fossilisation.md), [../AGENT_DNA_RUNTIME.md](../01-concepts/agent-dna-runtime.md) — documents concernés par les ADR ci-dessus.

- [0324-biologie-execution-et-autorite-durable.md](0324-biologie-execution-et-autorite-durable.md) — reçus des workers et autorité durable d’homéostasie.

- [0344 — Refactorings de qualité et frontières de contrôle](0344-refactorings-qualite-et-frontieres-de-controle.md).
