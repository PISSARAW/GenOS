# GenOS V3 — runtime biomimétique pour agents responsables

**GenOS est un runtime open source pour exécuter, comparer, reprendre et faire évoluer des agents IA sous contraintes de preuve.**

Il ne cherche plus seulement à orchestrer une mission. GenOS V3 conserve une responsabilité dans le temps : observer un projet, décider s’il faut agir, apprendre ou ne rien changer, déléguer dans un environnement isolé, vérifier séparément le résultat, puis réviser sa mémoire et son mandat.

La règle centrale reste simple : **un transport réussi n’est pas une décision valide, un test vert n’est pas un effet réel et une mémoire n’est pas une vérité**.

> **État du projet : alpha.** L’architecture est intégrée et de nombreux composants sont testés localement. La boucle longitudinale complète n’est pas encore qualifiée sur plusieurs projets réels.

- Site : [genos.work](https://genos.work)
- Documentation : [docs/README.md](docs/README.md)
- Code source : [github.com/PISSARAW/GenOS](https://github.com/PISSARAW/GenOS)
- Serveur MCP : [mcp/README.md](mcp/README.md)
- Licence : [Apache 2.0](LICENSE)

---

## Ce qu’est GenOS maintenant

GenOS est un **plan de contrôle pour l’autonomie agentique durable**. Il relie cinq responsabilités qui restent généralement séparées :

1. **Établir un mandat** — portée, propriétaire, objectif, budget, autorité et conditions d’arrêt.
2. **Observer avec provenance** — fraîcheur, incertitude, consentement et possibilité de révocation.
3. **Arbitrer** — choisir explicitement entre `ACT`, `OBSERVE`, `LEARN` et `NO_CHANGE`.
4. **Exécuter sans confondre sortie et preuve** — workers supervisés, workspaces isolés, budgets, leases, checkpoints et reprise.
5. **Vérifier et apprendre** — distinguer effet projet, apprentissage agent, simulation, acceptation et promotion.

```text
responsabilité versionnée
        ↓
observation sourcée ──→ incertitude / fraîcheur
        ↓
ACT | OBSERVE | LEARN | NO_CHANGE
        ↓
capsule ou workspace isolé
        ↓
vérification indépendante
        ↓
effet projet + apprentissage agent + décision de maintien/rollback
```

Cette boucle est appelée **ontogenèse dirigée par responsabilité**. Elle compose les surfaces SHEV, Ontogenèse, GVX, modèle du monde, Morphogenèse et Studio ; elle n’accorde jamais à l’une d’elles une autorité universelle. Voir [le concept](docs/01-concepts/ontogenese-dirigee-par-responsabilite.md), [les contrats V3](docs/03-reference/contrats-stewardship-v3.md) et [la matrice de qualification](docs/06-qualite-preuves/matrice-qualification-stewardship-v3-2026-10-20.md).

---

## Ce qui est implémenté

### Exécution et reprise

- runtime d’agents supervisés avec processus, budgets, événements, résultats et preuves persistés ;
- snapshots d’agent et de workspace, forks, diffs, replay et checkpoints logiques ;
- [GQWF v2](docs/02-orchestration/gqwf-v2.md) : vues privées durables, stockage adressé par contenu, baux et matérialisation portable ;
- [Garage Fabric](docs/02-orchestration/topologies/garage-fabric.md) : admission, file SQLite, dépendances, préemption consentie et reprise de workers ;
- routage vers OpenAI, Anthropic, Gemini, Mistral, Groq, DeepSeek, Together, OpenRouter, Ollama, LM Studio, vLLM et endpoints compatibles OpenAI.

Un snapshot restaure les états durables couverts par son manifeste. Il ne restaure ni la RAM arbitraire d’un processus ni l’état caché d’un fournisseur de modèles.

### Organisation multi-agent

Huit topologies sont câblées, avec des niveaux de maturité différents :

| Topologie | Rôle principal |
| --- | --- |
| **Trinity** | comparer plusieurs mondes sous gates de preuve |
| **A-Team** | coordonner des spécialistes avec handoffs et critères globaux |
| **Biocénose** | agréger quorum, consensus pondéré et métriques communautaires |
| **Holobionte** | organiser un hôte et des symbiotes sous admission et veto immunitaire |
| **Syncytium** | partager un état CRDT causal et vérifier sa matérialisation |
| **Biome** | allouer les ressources et exécuter une boucle de foraging bornée |
| **Rhizome** | router par capacités dans un graphe persistant et reprenable |
| **Métapopulation** | coordonner des régions, migrations, extinctions et recolonisations |

La **Morphogenèse** peut composer ces topologies avec `NEST`, `PARALLEL`, `SEQUENCE`, `GATE`, `COMPETE`, `WRAP`, `BRIDGE` et `FEDERATE`. La présence d’une topologie ou d’une capacité dans un registre ne prouve toutefois ni son activation dans une installation, ni la réussite d’une mission. Voir [topologies et capacités](docs/02-orchestration/topologies-et-capacites.md).

### Preuve, mémoire et évolution

- clôture commune des missions fondée sur les reçus des workers, leurs invariants et un oracle indépendant ;
- [AEIS](docs/01-concepts/adaptive-epistemic-immune-system.md), système immunitaire épistémique qui peut refuser une promotion malgré une exécution réussie ;
- mémoire épisodique, graphe, recherche hybride, provenance, contradictions et mémoire négative ;
- [rappel mémoire situationnel](docs/01-concepts/rappel-memoire-situationnel.md) dans les prompts Node.js : sélection en deux étapes, caractéristiques structurelles et classement selon la phase, inspirés des recherches de Doris Tsao ; gains sur missions réelles à qualifier ;
- [Natural Search Control Plane](docs/01-concepts/natural-search-control-plane.md) : pression de recherche, hypothèses, checkpoints atomiques et transmission culturelle sous preuve ;
- cycle [GVX standard AGOW](docs/02-orchestration/profil-execution-gvx.md) : évaluation, autorisation, application, suivi, rollback et crédit idempotent ;
- [ETT v1](docs/01-concepts/endogenous-thought-test.md) : détection, question falsifiable, admission, exécution reprenable, vérification et apprentissage borné ;
- évolution contrefactuelle de compétences et de scaffolds, sans promotion automatique.

ETT démontre aujourd’hui une chaîne de contrôle durable et falsifiable, pas une cognition générale. GVX démontre un protocole d’évolution gouvernée, pas qu’un modèle s’améliore dans tous les contextes.

### Surfaces opérateur

- backend Node.js : API REST Express, services gRPC, SQLite en mode WAL et runtime exécutable des workers (dispatch, lancement, supervision et barrière de preuves) ;
- cœur Rust : store, cellule, biologie, orchestration, CLI et serveur MCP ; `genos-worker` y fournit des contrats, presets, dossiers et un automate de cycle, mais n'est pas raccordé au dispatch worker actif ;
- deux serveurs MCP stdio, Node et Rust, fermés par défaut sans lease explicite ;
- [GenOS Studio](integrations/studio/README.md) pour inspecter missions, agents, fichiers, preuves et opérations ;
- intégrations Codex, VS Code, OpenTelemetry, Temporal et moteurs spécialisés.

L’[inventaire technique](docs/03-reference/inventaire-technique.md) fournit des comptages reproductibles. Ces comptages décrivent le dépôt ; ils ne constituent pas des mesures de maturité.

---

## Ce que GenOS ne prétend pas encore

- aucune campagne publique ne démontre encore une amélioration durable sur plusieurs projets réels ;
- les campagnes locales et les fixtures ne remplacent pas une validation externe ou longitudinale ;
- plusieurs politiques restent déterministes ou configurées plutôt qu’apprises empiriquement ;
- les primitives web, de fovéation et de computer use ne forment pas encore une boucle générale unique perception–action–vérification ;
- toutes les topologies ne disposent pas du même niveau de qualification de bout en bout ;
- les métaphores biologiques ne prouvent ni conscience, ni intention, ni sûreté biologique.

La formulation honnête est : **architecture intégrée, composants testés, qualification longitudinale en cours**. Une première [campagne terrain SHEV](docs/06-qualite-preuves/protocole-campagne-terrain-shev.md) est scellée et en exécution ; elle ne doit pas être présentée comme concluante avant son verdict final.

---

## Pourquoi biomimétique ?

Les noms biologiques décrivent des invariants logiciels, pas une simulation du vivant :

- **cellule, génome, épigénétique** → identité, spécialisation et contraintes ;
- **métabolisme, homéostasie** → budgets, pression, arrêt et récupération ;
- **immunité** → admission, détection de preuves incompatibles et refus ;
- **plasticité, mémoire** → apprentissage borné, rétention et oubli ;
- **écologie, morphogenèse** → organisation dynamique de collectifs ;
- **apoptose, cryptobiose** → interruption, isolement, snapshot et reprise.

Cette terminologie n’autorise pas à transformer une analogie en fonctionnalité. Chaque claim doit revenir à un contrat, un état persistant et une preuve exécutable.

---

## Architecture du dépôt

```text
Studio / CLI / clients MCP
            │
   REST + gRPC + MCP stdio
            │
backend/ — contrôle, orchestration, preuves, mémoire, SQLite
            │
crates/  — runtime Rust, store, biologie, CLI, MCP
            │
workspaces isolés / GQWF / runtimes modèles / workers
```

- `crates/` — workspace Rust du runtime ;
- `backend/` — plan de contrôle Node.js ;
- `mcp/` — pont MCP stdio Node.js ;
- `agents/` — définitions AgentDNA ;
- `docs/` — concepts, contrats, exploitation, sécurité et preuves ;
- `examples/`, `benchmarks/`, `integrations/`, `shared/`, `spec/` — démonstrations, protocoles et contrats partagés.

---

## Démarrage local

Prérequis : Rust 1.88+, Node.js 20.19+ ou 22.12+, Python 3 et les outils C/C++ nécessaires aux dépendances SQLite natives.

```bash
git clone https://github.com/PISSARAW/GenOS.git
cd GenOS
npm ci
npm ci --prefix backend
npm ci --prefix mcp
cargo build --workspace
cp .env.example .env
```

Puis, dans des terminaux séparés :

```bash
npm --prefix backend start
cargo run -p genos-cli -- --help
node mcp/index.js
```

Le backend écoute par défaut sur `http://localhost:4000` et gRPC sur `127.0.0.1:50051`. Les probes sont `/healthz`, `/readyz` et `/livez`.

Pour une mission :

```bash
node backend/bin/genos-orchestrate.cjs '{"mission":"...","background":true}'
```

La configuration d’exemple sélectionne Ollama. Une mission avec inférence exige un modèle réellement disponible, local ou distant, et les identifiants correspondants. La démo de débogage parallèle ne requiert pas de clé API :

```bash
node examples/safe-debugging-demo/run-demo.mjs target/debug/genos
```

Le fichier `.mcp.json` est un exemple de client avec lease de développement ; il ne configure pas Codex à lui seul. Voir [l’intégration Codex](integrations/codex/README.md).

---

## Vérification du dépôt

```bash
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Commandes ciblées utiles :

```bash
npm --prefix backend run test:validation
npm --prefix backend run test:mcp
npm --prefix backend run test:grpc
npm --prefix backend run test:quality
npm run docs:inventory:check
```

Un test vert prouve seulement ce que son oracle mesure. Les rapports de qualification sous `docs/06-qualite-preuves/` décrivent la portée et les preuves manquantes.

---

## Lire ensuite

- [Vue d’ensemble de la documentation](docs/README.md)
- [Runtime agentique](docs/01-concepts/runtime-agentique.md)
- [Épistémologie et évidence](docs/01-concepts/epistemologie-et-evidence.md)
- [Ontogenèse dirigée par responsabilité](docs/01-concepts/ontogenese-dirigee-par-responsabilite.md)
- [Workspaces contrefactuels et snapshots](docs/02-orchestration/workspaces-contrefactuel.md)
- [Référence des outils MCP](docs/03-reference/outils-mcp.md)
- [Contribuer](CONTRIBUTING.md)

Les changements architecturaux nécessitent un ADR et une preuve exécutable. Les fichiers `.env`, secrets, bases locales et artefacts générés ne doivent jamais être versionnés.

---

*GenOS Agent Runtime — la continuité d’une trajectoire compte davantage que le succès apparent d’un seul run.*
