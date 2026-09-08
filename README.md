# GenOS V3

GenOS est un système d’exploitation contre-factuel et biomimétique pour agents multi-agents, conçu pour gérer l’exécution, la mémoire, la validation, la reprise et la promotion de décisions d’IA dans un cadre explicite, traçable et contrôlé.

Il ne prétend pas à une IA générale ni à une simulation biologique scientifique. Il met en œuvre une architecture de runtime dans laquelle les agents sont pensés comme des cellules d’exécution avec:

- identité et génome définis ;
- budget cognitif et contraintes de ressources ;
- mémoire, synapses, liaisons de provenance ;
- branches d’état isolées ;
- mécanismes de preuve avant promotion ;
- mécanismes de reprise et de sélection de survivants.

---

## Ce que fait GenOS

### 1. Une runtime d’agentic computation
GenOS transforme des workflows d’agent en un système de contrôle avec branches, snapshots, preuve, validation et isolation. L’objectif est de rendre l’exécution agentique plus reproductible et moins vulnérable aux hallucinations de chaîne ou à la propagation d’un état corrompu.

### 2. Un modèle biologique orienté runtime
Les notions de cellule, génome, épigénétique, synapse, phéromone, apoptose, chaperone, cryptobiose, etc., servent à modéliser les invariants fonctionnels du système. Elles permettent de structurer :

- la spécialisation des agents ;
- la gestion de budgets ;
- la sélection, la conservation ou la suppression de branches ;
- la protection contre la dérive de décision ou la propagation de mauvaises preuves.

### 3. Un système de preuve avant décision
Le cœur de la plateforme est l’arbitre de réalité et les gates de promotion. Une action n’est pas supposée correcte simplement parce que l’outil a répondu sans erreur. Elle doit être compatible avec la provenance, les tests, la sécurité, le contexte et le modèle d’évaluation.

### 4. Une architecture de travail et de contre-factuel
GenOS manipule des états de workspace, des snapshots, des forks, des bisections et des restorations. Cela permet d’exécuter plusieurs hypothèses sans polluer le flux principal et d’évaluer les effets d’une mutation ou d’une réécriture avant de la promouvoir.

---

## Ce que GenOS n’est pas

GenOS n’est pas :

- un système de pensée générale autonome ;
- une promesse d’équivalence biologique parfaite ;
- une garantie de sécurité absolue par l’usage de mots biologiques ;
- un runtime où “success: true” suffit à prouver la vérité métier ;
- un moteur de calcul déterministe sur des dépendances externes non capturées.

Sa vraie valeur est surtout technique et opératoire : offrir un cadre solide pour exécuter, comparer, sauvegarder, valider et reprendre un travail d’agents complexes.

---

## Piliers du système

### 1. Génome et épigénétique
Les agents et les workflows portent des états internes structurés, des contraintes et des capacités spécialisées, avec différenciation et partage de responsabilités. Voir :

- [docs/GENOME_EPIGENETIQUE.md](docs/GENOME_EPIGENETIQUE.md)
- [docs/BIOLOGIE_COMPUTATIONNELLE.md](docs/BIOLOGIE_COMPUTATIONNELLE.md)

### 2. Mémoire, synapses et apprentissage
Le système dispose d’un moteur de mémoire hybride, de connectome synaptique, de plasticité, de consolidation et de gestion de l’oubli. Voir :

- [docs/MEMOIRE_APPRENTISSAGE.md](docs/MEMOIRE_APPRENTISSAGE.md)
- [docs/NEUROBIOLOGIE_PLASTICITE.md](docs/NEUROBIOLOGIE_PLASTICITE.md)
- [docs/SWARM_INTELLIGENCE.md](docs/SWARM_INTELLIGENCE.md)

### 3. Orchestration et primitives exécutables
Les agents ne sont pas exécutés “à l’aveugle” ; ils passent par des plans, des budgets, des fires, des sélections de survivants et des barrières de preuve. Voir :

- [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md)
- [docs/PRIMITIVES_EXECUTABLES.md](docs/PRIMITIVES_EXECUTABLES.md)
- [docs/WORKFLOWS_JOBS.md](docs/WORKFLOWS_JOBS.md)

### 4. Workspaces, snapshots et contre-factuel
Le dépôt met en place une logique de workspace isolation, de fork, de diff, de bisection et de restore. Voir :

- [docs/WORKSPACES_ETAT_CONTRE_FACTUEL.md](docs/WORKSPACES_ETAT_CONTRE_FACTUEL.md)
- [docs/GIT_AGENTS.md](docs/GIT_AGENTS.md) — transposition de Git aux états d’agents et séparation avec les worktrees de fichiers.
- [docs/REPRODUCTION_REPLICATION.md](docs/REPRODUCTION_REPLICATION.md)

### 5. Sécurité, identité, confiance et preuves
La plateforme construit ses garde-fous sur l’authentification, les permissions, le Zero Trust, la sandbox, les circuits breakers, les journaux et la vérification d’évidence. Voir :

- [docs/SECURITE.md](docs/SECURITE.md)
- [docs/IDENTITY_AUTHORITY.md](docs/IDENTITY_AUTHORITY.md)
- [docs/EPISTEMOLOGIE_EVIDENCE.md](docs/EPISTEMOLOGIE_EVIDENCE.md)

### 6. Contrats, intégration et exploitation
GenOS expose plusieurs surfaces : REST, gRPC, MCP, CLI et intégrations IDE. Voir :

- [docs/API_CONTRATS.md](docs/API_CONTRATS.md)
- [docs/OUTILS_MCP.md](docs/OUTILS_MCP.md)
- [docs/INTEGRATIONS_IDE.md](docs/INTEGRATIONS_IDE.md)
- [docs/DEPLOIEMENT_EXPLOITATION.md](docs/DEPLOIEMENT_EXPLOITATION.md)
- [docs/CLI_EXPERIENCE_OPERATEUR.md](docs/CLI_EXPERIENCE_OPERATEUR.md)
- [docs/PANORAMA_CONCURRENTIEL.md](docs/PANORAMA_CONCURRENTIEL.md) — comparaison transversale avec les principales alternatives du marché
---

## Vue d’architecture

```text
+-----------------------------------------------------------------------------------+
|                                UTILISATEURS / CLIENTS                              |
|  IDE / UI / CLI / scripts / agents / intégrateurs / opérateurs                   |
+---------------------------------------------+-------------------------------------+
                                              |
                                              v
+---------------------------------------------+-------------------------------------+
|                         GENOS CONTROL PLANE                                     |
|  REST / gRPC / MCP / CLI / orchestration / policies / evidence gates            |
+---------------------------------------------+-------------------------------------+
                                              |
                    +-------------------------+-------------------------+
                    |                                               |
                    v                                               v
+-------------------------------+                 +--------------------------------+
| Runtime agentique             |                 | Persistance & workspace state   |
| - workers / plans / budgets   |                 | - SQLite / snapshots / history  |
| - retry / selection           |                 | - branches / restore / diff     |
| - provenance / gates          |                 | - capsules / worktrees          |
+-------------------------------+                 +--------------------------------+
                    |                                               |
                    v                                               v
+-------------------------------+                 +--------------------------------+
| Mémoire & intelligence        |                 | Sécurité & gouvernance         |
| - embeddings / vector search  |                 | - auth / RBAC / zero trust     |
| - synapses / pheromones       |                 | - circuit breaker / sandbox   |
| - swarm / STDP / rewards      |                 | - audit / approvals / sealing  |
+-------------------------------+                 +--------------------------------+
                    |
                    v
+---------------------------------------------+
| Rust core / crates biologiques / moteurs    |
| - genos-cell / genos-biology / genos-store  |
| - genos-reproduction / genos-immune / etc. |
+---------------------------------------------+
```

---

## Documentation officielle du dépôt

Le dépôt contient une documentation structurée selon un même niveau de formalisation : définition, mathématiques, biologie, cas d’usage, exemple, schéma, architecture, processus, et comparaison avec le marché.

Voir la carte documentaire complète dans [docs/README.md](docs/README.md).

### Catégories principales

#### Fondations conceptuelles
- [docs/BIOLOGIE_COMPUTATIONNELLE.md](docs/BIOLOGIE_COMPUTATIONNELLE.md)
- [docs/GENOME_EPIGENETIQUE.md](docs/GENOME_EPIGENETIQUE.md)
- [docs/RUNTIME_AGENTIQUE.md](docs/RUNTIME_AGENTIQUE.md)
- [docs/EPISTEMOLOGIE_EVIDENCE.md](docs/EPISTEMOLOGIE_EVIDENCE.md)

#### Mémoire, apprentissage et swarm
- [docs/MEMOIRE_APPRENTISSAGE.md](docs/MEMOIRE_APPRENTISSAGE.md)
- [docs/NEUROBIOLOGIE_PLASTICITE.md](docs/NEUROBIOLOGIE_PLASTICITE.md)
- [docs/SWARM_INTELLIGENCE.md](docs/SWARM_INTELLIGENCE.md)

#### Orchestration, jobs et workspaces
- [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md)
- [docs/GIT_AGENTS.md](docs/GIT_AGENTS.md)
- [docs/PRIMITIVES_EXECUTABLES.md](docs/PRIMITIVES_EXECUTABLES.md)
- [docs/WORKFLOWS_JOBS.md](docs/WORKFLOWS_JOBS.md)
- [docs/WORKSPACES_ETAT_CONTRE_FACTUEL.md](docs/WORKSPACES_ETAT_CONTRE_FACTUEL.md)

#### Sécurité et gouvernance
- [docs/SECURITE.md](docs/SECURITE.md)
- [docs/IDENTITY_AUTHORITY.md](docs/IDENTITY_AUTHORITY.md)
- [docs/COMPLIANCE_GOUVERNANCE.md](docs/COMPLIANCE_GOUVERNANCE.md)
- [docs/OBSERVABILITE.md](docs/OBSERVABILITE.md)
- [docs/RESILIENCE_REPRISE.md](docs/RESILIENCE_REPRISE.md)

#### API, intégration et exploitation
- [docs/API_CONTRATS.md](docs/API_CONTRATS.md)
- [docs/OUTILS_MCP.md](docs/OUTILS_MCP.md)
- [docs/MODELES_PROVIDERS.md](docs/MODELES_PROVIDERS.md)
- [docs/INTEGRATIONS_IDE.md](docs/INTEGRATIONS_IDE.md)
- [docs/DEPLOIEMENT_EXPLOITATION.md](docs/DEPLOIEMENT_EXPLOITATION.md)
- [docs/CLI_EXPERIENCE_OPERATEUR.md](docs/CLI_EXPERIENCE_OPERATEUR.md)

---

## Structure du dépôt

```text
GenOS/
├── README.md                       # Vue d’ensemble du projet
├── docs/                           # Documentation technique et fonctionnelle
│   ├── README.md                   # Index documentaire et niveaux de lecture
│   ├── API_CONTRATS.md             # REST / gRPC / MCP / CLI
│   ├── BIOLOGIE_COMPUTATIONNELLE.md
│   ├── CLI_EXPERIENCE_OPERATEUR.md
│   ├── COMPLIANCE_GOUVERNANCE.md
│   ├── DEPLOIEMENT_EXPLOITATION.md
│   ├── EPISTEMOLOGIE_EVIDENCE.md
│   ├── EVALUATION_QUALITE.md
│   ├── GIT_AGENTS.md
│   ├── GENOME_EPIGENETIQUE.md
│   ├── gestion-projet-multi-tenant.md
│   ├── IDENTITY_AUTHORITY.md
│   ├── INTEGRATIONS_IDE.md
│   ├── MEMOIRE_APPRENTISSAGE.md
│   ├── MODELES_PROVIDERS.md
│   ├── NEUROBIOLOGIE_PLASTICITE.md
│   ├── OBSERVABILITE.md
│   ├── OPERATIONS_RECOVERY.md
│   ├── ORCHESTRATION.md
│   ├── OUTILS_MCP.md
│   ├── PERSISTANCE_DONNEES.md
│   ├── PRIMITIVES_EXECUTABLES.md
│   ├── REPRODUCTION_REPLICATION.md
│   ├── RESILIENCE_REPRISE.md
│   ├── RUNTIME_AGENTIQUE.md
│   ├── SANDBOX_EXECUTION_CODE.md
│   ├── SECURITE.md
│   ├── SWARM_INTELLIGENCE.md
│   ├── TESTS_VALIDATION_DEPOT.md
│   ├── WORKFLOWS_JOBS.md
│   └── WORKSPACES_ETAT_CONTRE_FACTUEL.md
├── backend/                       # Contrôle applicatif Node.js et services
├── crates/                        # Core Rust du runtime biomimétique
├── examples/                      # Démonstrations et scénarios
├── integrations/                  # Contrats IDE et intégration
├── mcp/                           # Serveur MCP et ponts d’intégration
├── scripts/                       # Outils d’orchestration, fix, validation
├── assets/                        # Brand, visuels et supports
├── Cargo.toml                     # Workspace Rust
├── package.json                   # Dépendances racine et scripts
├── runtime_arbiter.js             # Arbitre de réalité / validation de preuve
├── strategies.md                  # Catalogues de stratégies
├── arch_snapshot.json              # Snapshot d’architecture
├── arch_agent.json                 # Description agentique du système
├── LICENSE                        # Licence Apache 2.0
└── .genos.md                      # Règles de gouvernance de génération de code
```

---

## Démarrage rapide

### Prérequis
- Rust 1.88+
- Node.js 20+
- Git

### 1. Cloner et construire

```bash
git clone https://github.com/PISSARAW/GenOS.git
cd GenOS
cargo build --workspace
```

### 2. Lancer le backend

```bash
cd backend
npm install
npm start
```

### 3. Vérifier les API et les endpoints

Le backend expose généralement les endpoints de santé et le control plane sur le port configuré, avec les routes d’API protégées par identités, permissions et règles de scope.

### 4. Utiliser la CLI

```bash
cargo run -p genos-cli -- --help
```

Le dépôt contient aussi une CLI simplifiée `g` pour les usages opérateurs. La distinction est explicitement documentée dans [docs/CLI_EXPERIENCE_OPERATEUR.md](docs/CLI_EXPERIENCE_OPERATEUR.md).

---

## Principes de gouvernance et de preuve

GenOS applique une logique de preuve et de responsabilité que l’on retrouve partout :

- un résultat ne vaut pas comme preuve de vérité ;
- le transport réussi n’est pas équivalent à une décision valide ;
- l’absence de preuve est un échec fonctionnel ;
- les risques, budgets et permissions doivent être explicités ;
- les actions sensibles demandent approbation, contrôle et journalisation.

Cela est central dans [docs/EPISTEMOLOGIE_EVIDENCE.md](docs/EPISTEMOLOGIE_EVIDENCE.md) et dans [docs/SECURITE.md](docs/SECURITE.md).

---

## Comparaison rapide avec l’écosystème du marché

| Domaine | GenOS | Systèmes du marché | Positionnement |
| --- | --- | --- | --- |
| Orchestration d’agents | Branches, budgets, preuves, contrôles de promotion | Orchestration linéaire ou pilotée par prompts | GenOS ajoute la validation de l’état et la reprise explicite |
| Counterfactual state | Snapshots, diff, fork, rollback, bisection | Outils de sandbox ou de GitOps souvent plus simples | GenOS suit l’historique causal et la blast radius |
| Mémoire agentique | Hybride vectoriel + lexical + synaptique + decay | Memory stores souvent centrés sur embedding simple | GenOS combine mémoire, contexte, résultat et preuve |
| Sécurité | Auth, RBAC, contrôles de tool, sandbox, circuit breaker | Labels ou tooling partiel | GenOS tente un contrôle en couches, vérifiable |
| Intégration IDE / MCP | Contrats explicites, leased tools, scopes, validation | Outils plus ad hoc ou trop permissives | GenOS impose un cadre de surface explicite |

Le détail complet est dans les sections “Comparaison avec le marché” des documents de chaque domaine.

---

## Licence

Le projet est distribué sous la licence [LICENSE](LICENSE) Apache 2.0.

---

## Points d’entrée recommandés

- Comprendre le produit : [docs/BIOLOGIE_COMPUTATIONNELLE.md](docs/BIOLOGIE_COMPUTATIONNELLE.md)
- Comprendre l’orchestration : [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md)
- Comprendre les workspaces : [docs/WORKSPACES_ETAT_CONTRE_FACTUEL.md](docs/WORKSPACES_ETAT_CONTRE_FACTUEL.md)
- Comprendre les API : [docs/API_CONTRATS.md](docs/API_CONTRATS.md)
- Comprendre la sécurité : [docs/SECURITE.md](docs/SECURITE.md)
- Déployer et exploiter : [docs/DEPLOIEMENT_EXPLOITATION.md](docs/DEPLOIEMENT_EXPLOITATION.md)

Si vous souhaitez un point d’entrée plus opérationnel, commencez par [docs/README.md](docs/README.md).bash
cd mcp
npm install
node index.js
```

Available tool types:
- **Strategy Tools:** `genos_strategy_*` (MCTS pruning, 3-way merge, causal rebase, PRM evaluation).
- **Biomimicry Tools:** `genos_biomimicry_*` (stigmergy pheromones, cryptobiosis stasis, chromatin tool locking).
- **CLI Wrappers:** `genos_*` (native rust execution transport).

### 4. Run an Autonomous Orchestration Mission

```bash
node backend/bin/genos-orchestrate.cjs '{"mission": "Refactor authorization layer with zero-downtime canary fork", "background": true}'
```

### 5. Run the Safe Parallel Debugging Demo (Zero Tokens)

```bash
# On Linux / macOS (Bash)
./examples/safe-debugging-demo/run-demo.sh

# On Windows / Cross-Platform (Node.js)
cargo build -p genos-cli
node examples/safe-debugging-demo/run-demo.mjs target/debug/genos
```

---

## Code Governance: The Evidence Arbiter & Promotion Gates

To ensure that autonomous agents do not produce unmaintainable code or collude in hallucinations, GenOS enforces rules checked by [`runtime_arbiter.js`](runtime_arbiter.js) and the backend security services:

1. **Low Cyclomatic Complexity:** Code must remain readable, direct, and testable.
2. **Strict Parameter Limits:** Maximum 3 parameters per function.
3. **SOLID Principles:** Rigid separation of concerns across cellular modules.
4. **Line Bounds:** Source files must not exceed 400 lines without an explicit exemption.
5. **No Architectural Deviations:** Any fundamental pattern change requires an Architecture Decision Record (ADR).
6. **Costly Signaling (Handicap de Zahavi):** Gated by actual runtime compute and token expenditure (minimum 500 tokens for critical evaluations in [`ecology.rs`](crates/genos-biology/src/ecology.rs)), strictly rejecting zero-cost collusion.
7. **Budget Coherence:** Validates mission envelopes and enforces a 60% worker / 40% orchestrator reserve split via [`budgetCoherenceService.js`](backend/src/services/budgetCoherenceService.js).
8. **Human Approval Promotion Gate:** Autonomous Codex deployments and high-impact mutations require explicit, authenticated human approval before branch promotion.

Any generated patch failing these conditions is rejected by the Evidence Arbiter and discarded by the runtime recovery path.

---

## License

GenOS is licensed under the [Apache License 2.0](LICENSE).
