# Documentation GenOS

Ce dossier centralise la documentation technique, fonctionnelle et de gouvernance de GenOS.
L'objectif est d'offrir une lecture homogène du système, du concept jusqu'à l'exploitation,
sans jamais présenter une métaphore biologique comme une fonctionnalité prouvée.

> Règle de fond : les termes biologiques servent à organiser des invariants, pas à masquer
> une absence de preuve. Un transport réussi n'est pas une décision valide.

---

## Comment lire cette documentation

La documentation est organisée selon quatre usages (inspirés de Diátaxis). Choisissez
votre porte d'entrée, puis suivez la famille correspondante.

| Usage | Vous voulez… | Où commencer |
| --- | --- | --- |
| **Tutoriel** | apprendre le système pas à pas | [Parcours « comprendre en une heure »](#pour-comprendre-le-système-en-une-heure) |
| **Concept / explication** | comprendre *pourquoi* et *comment* | [Familles 1 à 3](#1-concepts-et-fondations) |
| **Référence** | consulter un contrat, un schéma, un catalogue | [Famille 5](#5-référence-technique) |
| **Guide / exploitation** | exécuter une tâche (opérer, déployer, réparer) | [Famille 6](#6-exploitation-et-opérations) |

Les conventions de rédaction, de nommage et de liens sont décrites dans
[CONVENTIONS.md](CONVENTIONS.md). Les décisions d'architecture sont indexées dans
[adr/README.md](adr/README.md).

---

## Modèle de rédaction des fiches de concepts

Les fiches de **concepts** (familles 1 à 3) suivent un canevas commun, avec des variantes
selon le domaine :

1. Définition du domaine
2. Modèle mathématique ou logique
3. Analogies biologiques et limites réelles
4. Cas d'usage et objectifs métier
5. Exemples concrets
6. Schéma ou diagramme
7. Architecture technique
8. Processus d'exécution ou de validation
9. Comparaison avec le marché
10. Limites, garde-fous, non-objectifs

Ce canevas n'est **pas** imposé aux documents de référence, d'exploitation ou d'ADR, qui
suivent leur propre structure. Chaque fiche doit distinguer explicitement ce qui est
implémenté, ce qui est partiel et ce qui relève du cadre conceptuel.

---

## Cartographie par familles

### 1. Concepts et fondations

Index : [01-concepts/README.md](01-concepts/README.md)

Fondations conceptuelles, runtime, génome, mémoire et épistémologie.

- [biologie-computationnelle.md](01-concepts/biologie-computationnelle.md) — biomimétique, embryogenèse, HOX, budgets.
- [genome-et-epigenetique.md](01-concepts/genome-et-epigenetique.md) — génome, chromatine, mutation, stabilité.
- [runtime-agentique.md](01-concepts/runtime-agentique.md) — runtime agentique, états, garde-fous.
- [epistemologie-et-evidence.md](01-concepts/epistemologie-et-evidence.md) — preuves, croyance, succès ≠ vérité.
- [instinct.md](01-concepts/instinct.md) — circuits innés, Patrons d'Action Fixes, modulation hormonale.
- [agent-dna-runtime.md](01-concepts/agent-dna-runtime.md) — format binaire AgentDNA et opérations.
- [neurobiologie-et-plasticite.md](01-concepts/neurobiologie-et-plasticite.md) — plasticité synaptique, dendrites, dissonance.
- [memoire-et-apprentissage.md](01-concepts/memoire-et-apprentissage.md) — mémoire épisodique/sémantique, vector search, STDP.
- [intelligence-de-nuee.md](01-concepts/intelligence-de-nuee.md) — phéromones, consensus, quorum, stigmergie.
- [fossilisation.md](01-concepts/fossilisation.md) — archive stratigraphique terminale des lignées.

### 2. Biomimétisme spécialisé

Index : [01-concepts/biomimetisme/README.md](01-concepts/biomimetisme/README.md)

- [web-foraging.md](01-concepts/biomimetisme/web-foraging.md) — foraging de Charnov, fovéation, navigation active (GAIA).
- [cellulaire-specialise.md](01-concepts/biomimetisme/cellulaire-specialise.md) — spécialisations balistiques, électriques, osmotiques, acaryotes.
- [sens-animaux.md](01-concepts/biomimetisme/sens-animaux.md) — les 5 super-sens animaux.
- [primitives-controle-animal.md](01-concepts/biomimetisme/primitives-controle-animal.md) — comportements animaux compilés en primitives de controle vérifiables.

### 3. Nosologie computationnelle

Index : [01-concepts/nosologie/README.md](01-concepts/nosologie/README.md)

- [vue-ensemble.md](01-concepts/nosologie/vue-ensemble.md) — synthèse des 9 familles, pharmacopée, feuille de route.
- [pathologie-et-medecine.md](01-concepts/nosologie/pathologie-et-medecine.md) — nosologie, statut clinique, nosocomiales, iatrogènes.
- [01-auto-immunes.md](01-concepts/nosologie/01-auto-immunes.md) · [02-degeneratives.md](01-concepts/nosologie/02-degeneratives.md) · [03-infectieuses.md](01-concepts/nosologie/03-infectieuses.md) · [04-genetiques.md](01-concepts/nosologie/04-genetiques.md) · [05-cancers.md](01-concepts/nosologie/05-cancers.md) · [06-metaboliques.md](01-concepts/nosologie/06-metaboliques.md) · [07-cardiovasculaires.md](01-concepts/nosologie/07-cardiovasculaires.md) · [08-psychiatriques.md](01-concepts/nosologie/08-psychiatriques.md) · [09-environnementales.md](01-concepts/nosologie/09-environnementales.md)

### 4. Orchestration et topologies

Index : [02-orchestration/README.md](02-orchestration/README.md)

**Exécution**

- [orchestration.md](02-orchestration/orchestration.md) — branches, preuve avant validation, survivants, fan-out.
- [architecture-survie.md](02-orchestration/architecture-survie.md) — état de survie mesurable et politiques de continuité bornées.
- [regulation-multi-boucles.md](02-orchestration/regulation-multi-boucles.md) — régulation multi-boucles, signaux et arbitrage.
- [theorie-du-soi-orchestrator.md](02-orchestration/theorie-du-soi-orchestrator.md) — modèle de soi calculé, calibration et garde-fous décisionnels.
- [topologies-et-capacites.md](02-orchestration/topologies-et-capacites.md) — contrat de capacités (8 modes + 19 organisations), leases effectifs.
- [primitives-executables.md](02-orchestration/primitives-executables.md) — primitives formelles, contrats, budgets, promotion.
- [workflows-et-jobs.md](02-orchestration/workflows-et-jobs.md) — workflows, jobs, graphes d'états, transitions.
- [workspaces-contrefactuel.md](02-orchestration/workspaces-contrefactuel.md) — snapshots, bisection, restore, blast radius.
- [git-agents.md](02-orchestration/git-agents.md) — transposition de Git aux états d'agents.
- [reproduction-et-replication.md](02-orchestration/reproduction-et-replication.md) — mitose, budding, méiose, clonage.

**Modes de composition (topologies)** — index : [02-orchestration/topologies/README.md](02-orchestration/topologies/README.md)

- [trinity.md](02-orchestration/topologies/trinity.md) — orchestration comparée en trois mondes.
- [a-team.md](02-orchestration/topologies/a-team.md) — équipe multidisciplinaire d'agents.
- [biome.md](02-orchestration/topologies/biome.md) — orchestration par environnement et populations.
- [biocenose.md](02-orchestration/topologies/biocenose.md) — orchestration communautaire.
- [holobionte.md](02-orchestration/topologies/holobionte.md) — orchestration hôte-symbionte.
- [syncytium.md](02-orchestration/topologies/syncytium.md) — état partagé et synchronisation continue.
- [rhizome.md](02-orchestration/topologies/rhizome.md) — ramification décentralisée de capacités.
- [metapopulation.md](02-orchestration/topologies/metapopulation.md) — populations semi-indépendantes.

### 5. Référence technique

Index : [03-reference/README.md](03-reference/README.md)

- [api-et-contrats.md](03-reference/api-et-contrats.md) — REST, gRPC, MCP, CLI, compatibilité, erreurs.
- [outils-mcp.md](03-reference/outils-mcp.md) — catalogue d'outils, leases, gating, permissions.
- [persistance-et-donnees.md](03-reference/persistance-et-donnees.md) — SQLite, tables, intégrité, stockage.
- [modeles-et-providers.md](03-reference/modeles-et-providers.md) — providers, routing, coûts, local/remote.
- [integrations-ide.md](03-reference/integrations-ide.md) — contrat IDE `genos.ide/v1`.
- Spécifications normatives : [`../spec/AGENT_DNA_SPEC.md`](../spec/AGENT_DNA_SPEC.md), [`../spec/GENOME_SPEC.md`](../spec/GENOME_SPEC.md).

### 6. Exploitation et opérations

Index : [04-exploitation/README.md](04-exploitation/README.md)

- [deploiement.md](04-exploitation/deploiement.md) — modèles de déploiement, Docker, Windows.
- [cli-et-experience-operateur.md](04-exploitation/cli-et-experience-operateur.md) — CLI, TUI, parcours opérateur.
- [observabilite.md](04-exploitation/observabilite.md) — traces, diagnostics, logs, métriques, audit.
- [resilience-et-reprise.md](04-exploitation/resilience-et-reprise.md) — reprise sur crash, cohérence, reconstitution.
- [runbook-recovery.md](04-exploitation/runbook-recovery.md) — runbook d'exploitation et reprise (EN).

### 7. Sécurité et gouvernance

Index : [05-securite-gouvernance/README.md](05-securite-gouvernance/README.md)

- [securite.md](05-securite-gouvernance/securite.md) — authentification, réseau, secrets, CORS, endpoints, audit.
- [identite-et-autorite.md](05-securite-gouvernance/identite-et-autorite.md) — identités, autorité, scopes tenants, rôles.
- [conformite-et-gouvernance.md](05-securite-gouvernance/conformite-et-gouvernance.md) — gouvernance, conformité, supervision.
- [sandbox-execution-code.md](05-securite-gouvernance/sandbox-execution-code.md) — sandbox, isolation, limites.
- [gestion-projet-multi-tenant.md](05-securite-gouvernance/gestion-projet-multi-tenant.md) — gestion de projet et multi-tenant.

### 8. Qualité, preuves et positionnement

Index : [06-qualite-preuves/README.md](06-qualite-preuves/README.md) · [07-positionnement/README.md](07-positionnement/README.md)

- [evaluation-qualite.md](06-qualite-preuves/evaluation-qualite.md) — évaluation, qualité, tests générés et exécutés.
- [tests-et-validation.md](06-qualite-preuves/tests-et-validation.md) — validation du dépôt et suites de test.
- [locomo.md](06-qualite-preuves/benchmarks/locomo.md) — résultats officiels LoCoMo.
- [swe-bench-lite.md](06-qualite-preuves/benchmarks/swe-bench-lite.md) — résultats officiels SWE-bench Lite.
- [panorama-concurrentiel.md](07-positionnement/panorama-concurrentiel.md) — comparaison avec le marché.
- [economie-et-scalabilite.md](07-positionnement/economie-et-scalabilite.md) — analyse économique et scalabilité.

### 9. Décisions d'architecture (ADR)

Index : [adr/README.md](adr/README.md)

- [0001-agent-dna-binary-format.md](adr/0001-agent-dna-binary-format.md) — format héréditaire binaire `AgentDNA`.
- [0002-agentdna-innovation-loop.md](adr/0002-agentdna-innovation-loop.md) — boucle d'innovation et promotion sous gate.
- [0003-fossilization-stratigraphic-archive.md](adr/0003-fossilization-stratigraphic-archive.md) — fossilisation stratigraphique.
- [0004-instinct-innate-circuits.md](adr/0004-instinct-innate-circuits.md) — instinct, circuits innés et hérédité verrouillée.
- [0005-reorganisation-arborescence-documentaire.md](adr/0005-reorganisation-arborescence-documentaire.md) — réorganisation de l'arborescence documentaire.
- [0014-theorie-du-soi-operationnelle.md](adr/0014-theorie-du-soi-operationnelle.md) — modèle de soi calculé et contraintes de décision.

---

## Parcours de lecture recommandés

### Pour comprendre le système en une heure

1. [biologie-computationnelle.md](01-concepts/biologie-computationnelle.md)
2. [orchestration.md](02-orchestration/orchestration.md)
3. [topologies-et-capacites.md](02-orchestration/topologies-et-capacites.md)
4. [workspaces-contrefactuel.md](02-orchestration/workspaces-contrefactuel.md)
5. [epistemologie-et-evidence.md](01-concepts/epistemologie-et-evidence.md)
6. [securite.md](05-securite-gouvernance/securite.md)

### Pour opérer le runtime

1. [deploiement.md](04-exploitation/deploiement.md)
2. [cli-et-experience-operateur.md](04-exploitation/cli-et-experience-operateur.md)
3. [observabilite.md](04-exploitation/observabilite.md)
4. [runbook-recovery.md](04-exploitation/runbook-recovery.md)
5. [resilience-et-reprise.md](04-exploitation/resilience-et-reprise.md)

### Pour développer ou intégrer

1. [api-et-contrats.md](03-reference/api-et-contrats.md)
2. [outils-mcp.md](03-reference/outils-mcp.md)
3. [integrations-ide.md](03-reference/integrations-ide.md)
4. [git-agents.md](02-orchestration/git-agents.md)
5. [modeles-et-providers.md](03-reference/modeles-et-providers.md)
6. [persistance-et-donnees.md](03-reference/persistance-et-donnees.md)

### Pour évaluer la sûreté et la preuve

1. [epistemologie-et-evidence.md](01-concepts/epistemologie-et-evidence.md)
2. [securite.md](05-securite-gouvernance/securite.md)
3. [sandbox-execution-code.md](05-securite-gouvernance/sandbox-execution-code.md)
4. [conformite-et-gouvernance.md](05-securite-gouvernance/conformite-et-gouvernance.md)
5. [evaluation-qualite.md](06-qualite-preuves/evaluation-qualite.md)

---

## Schémas directeurs

### Architecture globale des domaines GenOS

```mermaid
flowchart TB
    subgraph UI_Operateur["1. Opérateur & Expérience"]
        CLI["CLI Experience & TUI"]
        IDE["Intégrations IDE (VSCode / JetBrains)"]
        OBS["Observabilité & Télémétrie"]
    end

    subgraph Core_Concepts["2. Fondations & Modèles"]
        BIO["Biologie Computationnelle & Cellule"]
        NOSO["Nosologie & Pathologies (1 à 9)"]
        GEN["Génome & Épigénétique"]
        EPIST["Épistémologie & Preuves"]
    end

    subgraph Collective_Intel["3. Mémoire & Collectif"]
        MEM["Mémoire (STDP, Vector, Episodic)"]
        SWARM["Intelligence de Nuée & Stigmergie"]
        NEURO["Neurobiologie & Plasticité"]
    end

    subgraph Orchestration_Layer["4. Orchestration & Exécution"]
        ORCH["Orchestration de Branches"]
        TRINITY["Trinity (Architect / Worker / Judge)"]
        WORKFLOWS["Workflows & DAG Jobs"]
        GIT["Git Agents & Worktrees"]
        WORKSPACE["Workspaces Contrefactuels"]
    end

    subgraph Infrastructure_Sec["5. Données, Outils & Sécurité"]
        STORE["Persistance (SQLite / EventLog)"]
        MCP["Outils MCP & Sandboxing"]
        AUTH["Sécurité, Identité & RBAC"]
        PROVIDERS["Modèles & Providers Routing"]
    end

    UI_Operateur --> Orchestration_Layer
    Core_Concepts --> Collective_Intel
    Collective_Intel --> Orchestration_Layer
    Orchestration_Layer --> Infrastructure_Sec
```

### Cycle de vie et boucle de gouvernance de mission

```mermaid
sequenceDiagram
    autonumber
    actor OP as Opérateur
    participant ORCH as Orchestrateur GenOS
    participant AGT as Agent Cellulaire
    participant MCP as Sandbox MCP
    participant EPIST as Moteur de Preuve
    participant STORE as Stockage / Git

    OP->>ORCH: Soumission de l'objectif de mission
    ORCH->>AGT: Différenciation cellulaire & Attribution de budget
    activate AGT
    AGT->>MCP: Exécution de primitives en sandbox
    MCP-->>AGT: Résultats & traces d'exécution
    AGT->>EPIST: Émission d'une claim avec preuves
    deactivate AGT

    activate EPIST
    EPIST->>EPIST: Test de falsifiabilité & contre-exemples
    alt Preuve validée
        EPIST-->>ORCH: Promotion autorisée (Gate PASS)
        ORCH->>STORE: Commit atomique & persistance d'état
        ORCH-->>OP: Mission accomplie avec certificat
    else Dissonance ou échec de preuve
        EPIST-->>ORCH: Rejet (Gate FAIL) & Dissonance incrémentée
        ORCH->>AGT: Apoptose / Rollback contrefactuel
        ORCH-->>OP: Alerte nosologique & rapport d'audit
    end
    deactivate EPIST
```

### Matrice des états d'un agent dans l'écosystème

```mermaid
stateDiagram-v2
    [*] --> Zygote : Spawn initial
    Zygote --> Differencie : Activation HOX & Rôle
    Differencie --> Actif : Budget alloué

    state Actif {
        [*] --> Execution
        Execution --> Eureka : Dissonance résolue
        Eureka --> Execution : Budget restauré (+50)
        Execution --> DissonanceElevee : Erreur / Incohérence
        DissonanceElevee --> Execution : Feedback correctif
    }

    Actif --> Cryptobiose : Mise en veille (Hibernation)
    Cryptobiose --> Actif : Réactivation par signal

    Actif --> Apoptose : Budget <= 0 ou Dissonance >= Max
    Actif --> TermineSucces : Tâche validée par Preuve

    Apoptose --> Recycle : Nettoyage Glial
    TermineSucces --> [*]
    Recycle --> [*]
```

---

## Positionnement de la documentation

La documentation GenOS cherche à faire la différence entre :

- ce qui est un cadre conceptuel de modélisation ;
- ce qui est réellement implémenté dans le dépôt ;
- ce qui est seulement une approximation ou métaphore biologique ;
- ce qui relève d'un opérateur, d'un intégrateur, ou d'un évaluateur de sécurité.

Depuis l'[ADR 0005](adr/0005-reorganisation-arborescence-documentaire.md), les documents
sont rangés par familles et nommés en `kebab-case`. Les chemins restent des identifiants
de provenance (`source_doc`) : tout déplacement futur doit être traité comme une
migration, selon [CONVENTIONS.md](CONVENTIONS.md).

---

## Fichiers clés du dépôt

- [../README.md](../README.md) — vue d'ensemble du projet et point d'entrée principal.
- [../Cargo.toml](../Cargo.toml) — configuration du workspace Rust.
- [../backend/README.md](../backend/README.md) — backend Node.js et API de contrôle.
- [../strategies.md](../strategies.md) — catalogue des stratégies et de leurs familles.
- [../arch_snapshot.json](../arch_snapshot.json) et [../arch_agent.json](../arch_agent.json) — snapshots architecturaux.

---

## À retenir

La documentation du dépôt est pensée comme un système cohérent :

- architecture technique ;
- preuve et vérité ;
- mémoire et évolution ;
- sécurité et autorité ;
- opérabilité et reprise ;
- intégration avec les outils et l'IDE.

Tout l'édifice est conçu pour éviter le faux « succès », où un transport ou un état
technique positif masquerait une absence d'évidence réelle.
