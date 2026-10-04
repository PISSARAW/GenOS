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
| [0183b](0183-regeneration-axolotl-bornee.md) | Régénération Axolotl ciblée et fondée sur des preuves | Voir le fichier | -- | -- |
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
| [0194](0194-conformite-du-rendu-iridophore.md) | Conformité du rendu iridophore au runtime | Accepté | 2026-09-30 | Runtime, rendu, cellules spécialisées, preuve |
| [0195](0195-enforcement-metabolique-cellule-de-garde.md) | Enforcement métabolique par la cellule de garde | Accepté | 2026-09-30 | Runtime, métabolisme, flux, cellules spécialisées |
| [0196](0196-plan-runtime-tracheide-et-mesure-de-cout.md) | Plan runtime et mesure de coût de la trachéide | Accepté | 2026-09-30 | Runtime, compilation de plan, cellules spécialisées, mesure |
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
| [0294a](0294-cloture-de-continuite-de-mission.md) | Fermeture des transitions de continuité de mission | Accepté | 2026-10-04 | Orchestration et survie des missions |
| [0294b](0294-contrat-residuel-cognitif-signal-plane.md) | Contrat cognitif résiduel du Signal Plane | Accepté | 2026-10-04 | Signal Plane, cognition, preuve |
| [0294c](0294-executeurs-deterministes-workers.md) | Exécuteurs déterministes des workers | Accepté | 2026-10-04 | Workers, orchestration, preuve |
| [0296](0296-rejeu-causal-sous-bail.md) | Rejeu causal sous bail et journal chaîné | Accepté | 2026-10-04 | Causalité procédurale, persistance, concurrence |
| [0297](0297-g-cir-generation-hypotheses-trinity.md) | G-CIR pour la generation d'hypotheses Trinity | Accepte | 2026-10-04 | Trinity, cognition, preuve |
| [0298](0298-physiologie-relationnelle-executable.md) | Physiologie relationnelle exécutable | Proposé, avec noyau intégré et raccord ciblé | 2026-10-04 | Relations inter-agents, communication, autorité, preuves |
| [0299a](0299-admission-relationnelle-transactionnelle.md) | Admission transactionnelle des signaux relationnels | Proposé, implémentation ciblée | 2026-10-04 | Communication inter-agents, autorité, persistance |
| [0299b](0299-capacites-transversales-morphogenese.md) | Cinq capacités transversales de morphogenèse | Proposé, avec première implémentation opt-in | 2026-10-04 | Morphogenèse, preuves, mémoire, risque statistique |
| [0299c](0299-registre-obligations-g-cir.md) | Registre d'obligations et graphe G-CIR | Accepté | 2026-10-04 | cognition, orchestration, preuve |
| [0300a](0300-affectation-niches-et-contrats-hotes.md) | Niche du spécialiste et contrat du symbiote en topologie | Accepté | 2026-10-04 | Topologies, workers spécialistes, Holobionte |
| [0300b](0300-scellement-spores-biome.md) | Scellement des spores Biome | Accepté | 2026-10-04 | cryptobiose, confidentialité, restauration |
| [0301](0301-falsification-deterministe-red-worker.md) | Falsification déterministe du red worker | Accepté | 2026-10-04 | Workers, revue adversariale, preuve |
| [0302](0302-benchmark-rival-autogen-local.md) | Première mesure rivale locale avec AutoGen | Accepté | 2026-10-04 | Workers, benchmarks comparatifs, provenance |
| [0303](0303-mesure-bornee-experimental-worker.md) | Mesure bornée du worker expérimental | Accepté | 2026-10-04 | Workers, expérimentation, preuve |
| [0304](0304-synthese-structuree-des-desaccords.md) | Synthèse structurée des désaccords | Accepté | 2026-10-04 | Workers, synthèse, provenance |
| [0305](0305-fenetre-observation-resident-daemon.md) | Fenêtre d'observation du resident daemon | Accepté | 2026-10-04 | Workers, observation, anomalies |
| [0306](0306-reconstruction-causes-declarees-forensic-worker.md) | Reconstruction des causes déclarées du forensic worker | Accepté | 2026-10-04 | Workers, analyse d'incident, provenance |
| [0307](0307-observation-litterale-scout-cell.md) | Observation littérale du scout cell | Accepté | 2026-10-04 | Workers, observation, provenance |
| [0308](0308-transfert-subset-sum-teaching-worker.md) | Transfert contrôlé de subset_sum par le teaching worker | Accepté | 2026-10-04 | Workers, transmission, vérification |

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
