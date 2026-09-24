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
| [0003](0003-fossilization-stratigraphic-archive.md) | Fossilisation stratigraphique | Proposé | 2026-09-14 | Persistance, mémoire, orchestration, preuve |
| [0004](0004-instinct-innate-circuits.md) | Instinct : circuits innés et PAF | Proposé | 2026-09-14 | Biomimétique, génome, neurobiologie, sûreté |
| [0005](0005-reorganisation-arborescence-documentaire.md) | Réorganisation de l'arborescence documentaire | Accepté | 2026-09-14 | Documentation, provenance, distribution |
| [0012](0012-volition-autonome-et-preservation.md) | Volition autonome et préservation | Accepté | 2026-09-15 | Orchestration, survie, autonomie |
| [0013](0013-survival-model-control-plane.md) | Modèle de survie dans le control plane | Accepté | 2026-09-16 | Orchestration, budgets, sûreté, biomimétisme |
| [0014](0014-theorie-du-soi-operationnelle.md) | Théorie du soi opérationnelle de l'orchestrator | Accepté | 2026-09-16 | Orchestration, apprentissage, persistance, sûreté |
| [0015](0015-convergence-organisme-cognitif-composite.md) | Convergence d'un organisme cognitif composite | Accepté | 2026-09-16 | Orchestration, contrôle, preuve, sûreté |
| [0016](0016-effets-runtime-philosophiques-controles.md) | Effets runtime philosophiques contrôlés | Accepté | 2026-09-17 | Philosophie, runtime, sûreté |
| [0017](0017-philosophie-politique-et-gouvernance.md) | Philosophie politique et gouvernance contrôlée | Accepté | 2026-09-17 | Philosophie, gouvernance, preuve, sûreté |
| [0018](0018-gouvernance-registre-philosophique.md) | Gouvernance du registre philosophique | Accepté | 2026-09-17 | Philosophie, registre, relations, preuve |
| [0018b](0018-execution-cognitive-via-client-mcp.md) | Exécution cognitive via le client MCP (`caller_mcp`) | Proposé | 2026-09-17 | Runtime, MCP, harness, preuve |
| [0019](0019-socle-epistemique-du-savoir.md) | Socle épistémique du savoir | Accepté | 2026-09-17 | Philosophie, épistémologie, preuves, inférence |
| [0020a](0020-moteurs-logiques-bornes-et-semantique.md) | Moteurs logiques bornés et sémantiques explicites | Accepté | 2026-09-17 | Philosophie, inférence, épistémologie |
| [0020b](0020-persistance-analyses-philosophiques.md) | Persistance explicite des analyses philosophiques | Accepté | 2026-09-17 | Philosophie, analyses, provenance, persistance |
| [0021](0021-promotion-epistemique-des-decisions.md) | Promotion épistémique des décisions | Accepté | 2026-09-17 | Épistémologie, contrats, gates, mémoire |
| [0021b](0021-ontologie-operationnelle.md) | Ontologie opérationnelle | Acceptée (implémentation en cours) | 2026-09-17 | Philosophie, ontologie, runtime |
| [0022](0022-resultats-operationnels-et-preuve.md) | Résultats opérationnels et preuve | Accepté | 2026-09-18 | Runtime, MCP, validation, preuves |
| [0022b](0022-promotions-de-maturite-des-strategies.md) | Promotions de maturité des stratégies | Accepté | 2026-09-18 | Stratégies, maturité, registres |
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
| [0035](0035-model-uplift-benchmark.md) | GMUB / GCAB — Model Uplift longitudinal et ablations | Proposé | 2026-09-23 | Évaluation, preuve, ladder, ablations |
| [0036](0036-harness-compatibility-layer.md) | Harness Compatibility Layer — rendre le harness remplaçable | Proposé | 2026-09-23 | Orchestration, runtime, exécution, preuve |
| [0037](0037-ecosysteme-agentique-11-15.md) | Écosystème agentique 11-15 : environnement, substrat, physiologie, gouvernance, interoception | Accepté | 2026-09-23 | Environnement, cognition, collectif, gouvernance, santé |
| [003x](003x-communication-ecology.md) | Communication Ecology Invariants (verbal = ressource rare, Signal Plane zero-text) | Propositionnel | 2026-09-23 | Communication, cognition, distribution |
| [0039](0039-systemes-vitaux-agents-6-10.md) | Systèmes vitaux des agents 6-10 : sensorium, métabolisme, résilience, développement, symbiontes | Accepté | 2026-09-23 | Perception, métabolisme, résilience, développement, procédures |

| [0038](0038-boucle-controle-cognitif-morphogenese.md) | Boucle de controle cognitif de la morphogenese | Accepte | 2026-09-23 | Orchestration, epistemologie, memoire, cognition, strategie, regulation |
| [0040](0040-morphogenese-git-contrefactuel.md) | Morphogenèse versionnée Git et contrefactuelle | Proposé | 2026-09-23 | Orchestration, morphogenèse, Git agentique, contrefactuel, substrat |
| [0041](0041-medecine-immunite-graduee.md) | Médecine graduée et immunité proportionnée | Proposé | 2026-09-23 | Santé agentique, immunité, thérapies, quarantaine, iatrogénie |
| [0042](0042-qpu-organe-specialise.md) | QPU comme organe spécialisé et sélection quantum-inspired | Proposé | 2026-09-23 | Substrat de calcul, quantum-inspired, QPU, GPU, VFS |
| [0043](0043-runtime-worker-phenotypes.md) | Runtime worker commun et phenotypes composables | Accepté | 2026-09-24 | Workers, phenotypes, autorité, cycle de vie |
| [0044](0044-matrice-autorite-gates-double-runtime.md) | Matrice d'autorité unifiée, gates de provenance et d'observabilité, double runtime | Proposé | 2026-09-24 | Autorité, gouvernance, provenance, observabilité, runtime |
| [0045](0045-noyau-controle-morphogenetique.md) | Noyau de contrôle morphogénétique de l'orchestrateur Rust | Proposé | 2026-09-24 | Orchestration, morphogenèse, gouvernance, incarnation, santé |
| [0046](0046-routage-minimal-memoire-resultats.md) | Routage minimal suffisant et mémoire des meilleurs résultats | Accepté | 2026-09-24 | Orchestration, routage, mémoire, preuve, persistance |
| [0052](0052-contrat-symbiotique-holobionte.md) | Contrat symbiotique Holobionte | Accepté | 2026-09-24 | Holobionte, autorité, capacités, confidentialité, persistance |
| [0053](0053-admission-sandbox-symbiontes-holobionte.md) | Admission sandbox des symbiontes Holobionte | Accepté | 2026-09-24 | Holobionte, admission, sandbox, permissions, preuves |
| [0054](0054-classement-partenaires-holobionte.md) | Classement des partenaires Holobionte | Accepté | 2026-09-24 | Holobionte, sélection, capacités, risques, dépendance |
| [0051](0051-morphology-graph-and-topology-contracts.md) | Graphe morphologique et contrats typés de topologie | Proposé | 2026-09-24 | Orchestration, morphogenèse, topologies, preuves, budget |

## Cycle de vie d'un ADR

- **Proposé** — rédigé, en revue.
- **Accepté** — décision appliquée.
- **Remplacé** — obsolète, remplacé par un ADR plus récent (référence croisée obligatoire).
- **Rejeté** — option écartée, conservée pour la traçabilité.

## Ajouter un ADR

1. Créer `docs/adr/NNNN-slug.md` (numérotation à 4 chiffres, jamais réutilisée).
2. Reprendre l'en-tête : `Statut`, `Date`, `Domaine`, `Décideurs`, `Lié à`.
3. Structurer : `Contexte`, `Décision`, `Conséquences` (Positives / Négatives), `Alternatives`.
4. Mettre à jour ce tableau et la section ADR de [../README.md](../README.md).

## Voir aussi

- [../CONVENTIONS.md](../CONVENTIONS.md) — conventions de rédaction et de nommage.
- [../GENOME_EPIGENETIQUE.md](../01-concepts/genome-et-epigenetique.md), [../INSTINCT.md](../01-concepts/instinct.md), [../FOSSILISATION.md](../01-concepts/fossilisation.md), [../AGENT_DNA_RUNTIME.md](../01-concepts/agent-dna-runtime.md) — documents concernés par les ADR ci-dessus.
