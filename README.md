# GenOS Agent Runtime — Reproducible Multi-Agent Orchestration

**GenOS is an open-source AI agent runtime for reproducible, evidence-driven execution.** It provides versioned workspace state, counterfactual branches, deterministic replay, evidence gates, supervised multi-agent orchestration, and an MCP interface.

En français : GenOS est un runtime open source pour agents IA, centré sur l'état versionné, les branches contrefactuelles et l'exécution vérifiable. Le nom canonique du projet est **GenOS Agent Runtime** afin de le distinguer des autres projets appelés GenOS.

🌐 **Site public** : https://genos.work
🧬 **Code source** : https://github.com/PISSARAW/GenOS
📖 **Documentation** : [index des docs](docs/README.md)
🔌 **Serveur MCP** : [serveur MCP GenOS](mcp/README.md) · [métadonnées pour le MCP Registry](server.json)

---

## Runtime d'orchestration destiné à survivre à l'hype

GenOS est un runtime pour agents autonomes où **une exécution réussie n'est pas une preuve, et une erreur n'est pas fatale**.

- 8 topologies câblées au runtime : Trinity, A-Team, Biocénose, Holobionte, Syncytium, Biome, Rhizome et Métapopulation. Leurs services et capacités diffèrent selon le mode.
- Snapshots, forks contrefactuels, diffs, replay et gates de promotion fondées sur des preuves.
- Runtime d'agents supervisés : processus, workspaces isolés, budgets, mémoire et rapports d'évidence.
- [Physique computationnelle Rust](docs/01-concepts/physique-computationnelle.md) : mesures sourcées du workspace, coûts de planification et calibration persistante par mission ; indices de contrôle heuristiques.
- Contrôles de sécurité : autorisations, isolation de workspace, VFS sandboxé et gates de promotion.

Ce n'est pas un framework d'agents. C'est un runtime qui essaie de rendre l'agentic computation moins fertile pour les hallucinations de chaîne.

📊 **Inventaire vérifiable** : [comptages techniques](docs/03-reference/inventaire-technique.md), régénérés par `npm run docs:inventory` et contrôlables par `npm run docs:inventory:check`.
🏁 **Démo** : `examples/safe-debugging-demo` (zéro token, exécutable)

---

## What distinguishes GenOS from conventional agent runtimes

La différence principale : l'état est versionné par défaut.

Les orchestrateurs classiques avancent sur une timeline mutable. GenOS versionne l'état pour pouvoir comparer et rejouer des trajectoires.

| Ce que vous faites | Sortie normale | Sortie GenOS |
| --- | --- | --- |
| Un agent échoue pendant une mission | L'état est difficile à reprendre | Snapshots, workspaces isolés et processus survivants supervisés |
| Vous voulez comparer deux approches | Lancement séquentiel et contexte séparé | Forks contrefactuels, diff et replay ; l'évaluation dépend du scénario |
| Un modèle propose une décision critique | La sortie du modèle est traitée comme résultat | Les gates peuvent exiger des preuves avant promotion |

En gros : GenOS est conçu pour ce qui arrive quand l'agent se trompe, pas seulement quand il réussit.

---

## Huit topologies d'orchestration

- **Trinity** — baseline comparative à trois mondes et douze variants à runners dédiés, avec gates de preuve ; les résultats incomplets escaladent (R3 pré-correctifs : 12/12 escalades, 0 merge ; qualification post-correctifs en attente).
- **A-Team** — workers spécialisés, DAG à progression indépendante, handoffs versionnés et clôture sur preuve ; conformité globale partielle, évaluations de variantes distinctes. Voir [le contrat runtime](docs/03-reference/runtime-a-team.md).
- **Biocénose** — consensus pondéré, quorum, métriques d'essaim et barrière d'évidence.
- **Holobionte** — missions hôte-symbiotes contractuelles : admission, preuve indépendante, veto immunitaire, quotas, mémoire atomique et hôtes persistants. [Contrat et exemple](docs/03-reference/runtime-holobionte.md).
- **Syncytium** — état partagé CRDT causal, 13 variants Node et clôture de mission soumise aux preuves des workers et de l’état partagé ([contrat runtime](docs/03-reference/runtime-syncytium.md)).
- **Biome** — allocation de ressources et algorithmes d'exploration inspirés du foraging.
- **Rhizome** — missions par capacités avec résultats signés, croissance et budgets atomiques, routage borné, reprise persistante et télémétrie du graphe réel. Voir le [contrat runtime](docs/03-reference/runtime-rhizome.md).
- **Métapopulation** — runtime régional persistant : migrations revues par le receveur, extinction à preuves, recolonisation multi-lignage et reprise des cycles ; moteurs externes configurés par adaptateurs. Voir le [contrat runtime](docs/03-reference/runtime-metapopulation.md).

Les capacités disponibles et les limites opérationnelles varient par topologie ; voir [Topologies et contrat de capacités](docs/02-orchestration/topologies-et-capacites.md).

Le [système immunitaire épistémique AEIS](docs/01-concepts/adaptive-epistemic-immune-system.md)
relie la promotion à des preuves de commande exécutées indépendamment. Il inclut
mémoire et autorité persistantes, recrutement de niches, ré-arbitration
homéostatique et revues provider en processus séparés. La fiche précise les
limites et la matrice de qualification ; les réponses provider locales contrôlées
ne constituent pas une mesure de modèles externes.

---

## Ce qui est réel en ce moment

Fonctionnalités implémentées :

- **Snapshots, forks, diffs et replay** pour versionner et comparer l'état d'un workspace.
- **Démo de débogage parallèle sûr** : `examples/safe-debugging-demo`, exécutable sans clé API.
- **GenOS Studio** et backend Node.js : plan de contrôle, API REST, services gRPC et persistance SQLite WAL.
- **CLI Rust** et serveur MCP stdio pour les opérations locales et les intégrations.
- **Natural Search Control Plane** : contrôle de pression et de progrès, ledger d'hypothèses et reprise atomique SQLite des états des phases 6–12 ; transmission culturelle sous preuve. Voir le [contrat et ses limites](docs/01-concepts/natural-search-control-plane.md).
- **Runtime agentique supervisé** : lance des runtimes configurés, collecte leurs événements, applique des budgets et conserve les résultats et preuves.
- **[Garage Fabric](docs/02-orchestration/topologies/garage-fabric.md)** : douze politiques de circulation des workers, file SQLite durable, réservation transactionnelle, baux clôturés et préemption consentie avec snapshot vérifié. La reprise restaure les fichiers et le budget restant, pas la mémoire du processus ; ce service transversal n'est pas une neuvième topologie.
- **Routage de modèles implémenté** : modèles distants via OpenAI, Anthropic, Gemini, Mistral, Groq, DeepSeek, Together et OpenRouter ; modèles locaux via Ollama, LM Studio et vLLM ; endpoints compatibles OpenAI configurables.
- **Politiques de routage** configurables par agent, tenant ou environnement, avec ordre de fallback ; le mode parallèle est disponible avec une limite de coût explicite.
- **Huit topologies d'orchestration** avec services de coordination et contrats de capacités. La présence d'un mode ne signifie pas que chaque capacité du profil est complète ou activée dans chaque installation.

Le **cycle GVX standard AGOW** fournit mesures signées par un service séparé, application autorisée, suivi longitudinal, rollback, reprise et crédit idempotent pour des politiques déclaratives configurées. Voir le [profil d’exécution](docs/02-orchestration/profil-execution-gvx.md) et les [résultats fonctionnels](docs/06-qualite-preuves/validation-cycle-standard-gvx.md). Les autres lots GVX et la qualification empirique restent partiels.

Les routes de modèles sont conditionnelles à votre environnement :

- une route distante demande le réseau, un modèle déclaré et la clé du fournisseur correspondante ;
- une route locale demande un serveur d'inférence actif et un modèle de conversation disponible ;
- `openai-compatible://` demande l'URL d'endpoint compatible configurée ;
- la configuration d'exemple sélectionne Ollama. Les intégrations ne téléchargent pas elles-mêmes les modèles.

Les primitives de perception web et de fovéation restent isolées et ne forment pas encore une boucle complète capture-observation-action-vérification. Certaines fonctions d'orchestration et d'évaluation restent expérimentales ; consultez les limites décrites dans la documentation avant de dépendre d'une capacité particulière.

---

## Nosologie computationnelle

Le runtime Rust couvre **28 conditions dans neuf familles et 48 opérateurs de marqueurs**. Les diagnostics et recommandations sont synchronisés; l’application passe par une autorisation signée et un reçu persistant avec statut `applied`, `no_target` ou `refused`. Le type et la cible de la CLI doivent correspondre à l’autorisation. Les noms médicaux désignent des abstractions logicielles.

Voir le [catalogue](docs/01-concepts/nosologie/catalogue-runtime.md), le [contrat API et CLI](docs/03-reference/api-et-contrats.md#autorisation-et-application-cliniques) et le [bilan daté](docs/06-qualite-preuves/validation-nosologie.md). Les mécanismes biologiques détaillés restent des propositions au-delà des contrats exécutables; les contrôles globaux du dépôt et le parcours HTTP → Rust complet ne sont pas déclarés validés.

## Pourquoi "biomimétique" et pas juste "biologique" ?

Parce que les mots comptent pour ce qu'ils modélisent, pas pour ce qu'ils vendent. GenOS utilise des notions biologiques comme **structuration fonctionnelle** :

- cellule, génome, épigénétique → spécialisation et contraintes d'agents
- synapse, plasticité → mémoire et apprentissage collectif
- apoptose, cryptobiosis → reprise, isolation, survie aux perturbations
- phéromones, stigmergie → coordination sans centralisation

Ce n'est pas une simulation biologique. C'est un runtime qui prend les invariants fonctionnels de ces systèmes comme modèle d'organisation.

---

## Comment l'utiliser sans devenir fou

```bash
git clone https://github.com/PISSARAW/GenOS.git
cd GenOS
npm ci
npm ci --prefix backend
npm ci --prefix mcp
cargo build --workspace
cp .env.example .env
npm --prefix backend start
cargo run -p genos-cli -- --help
node mcp/index.js
node backend/bin/genos-orchestrate.cjs '{"mission":"..." , "background":true}'
```

Prérequis de développement : Rust stable 1.88+, Node.js 20.19+ ou 22.12+, Git et outils de compilation C/C++ pour les dépendances natives SQLite. Python 3 est nécessaire pour lancer le contrôle qualité du dépôt. Après la copie de `.env.example`, `GENOS_DB_PATH` reste commenté par défaut : le backend réutilise `backend/genos.db` s'il existe, sinon le volume géré `.genos/data/operational/genos.db`. Décommentez-le (ex. `/data/genos.db`) pour figer un emplacement de déploiement.

Pour les missions avec inférence, configurez une route de modèle : le `.env.example` choisit Ollama (`llama3.1:8b`), qui doit être installé, démarré et disposer de ce modèle. Vous pouvez choisir un autre fournisseur avec `GENOS_DEFAULT_MODEL` et définir sa clé API dans l'environnement du backend. Pour les missions utilisant le runtime Codex, installez Codex CLI et rendez-le accessible via `PATH` ou `CODEX_EXECUTABLE`. L'installation et la démo sans token n'exigent pas de clé de fournisseur de modèles.

Démo sans token : `./examples/safe-debugging-demo/run-demo.sh` ou le fichier `.mjs` équivalent.

---

## Licence

Apache 2.0. Voir [LICENSE](LICENSE).

---

## Pourquoi ce README est laid la première fois

Parce que les readme trop polis cachent souvent ce qui est réel et ce qui est vendu. Ici, la limite est explicite : **alpha**, **preuve avant promotion**, **pas de succès = preuve de vérité**.

Si vous voulez contribuer, lisez [CONTRIBUTING.md](CONTRIBUTING.md) et la gouvernance dans [.genos.md](.genos.md). Les changements architecturaux demandent un ADR + une preuve exécutable.

Si vous voulez juste tester : lancez la démo, sniffez le repo, constatez que l'état est versionné même quand l'agent rate.

Si vous voulez juste copier l'idée : prenez la partie "state as versioned" + "proof before promotion" et oubliez le reste. Le reste, c'est la sauce.

---

*Made by PISSARAW — runtime d'orchestration qui essaie de survivre à l'hype du agentic.*
