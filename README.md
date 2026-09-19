# GenOS — Runtime d'orchestration destiné à survivre à l' hype

GenOS est un runtime pour agents autonomes où **une exécution réussie n'est pas une preuve, et une erreur n'est pas fatale**.

- 8 topologies câblées au runtime : Trinity, A-Team, Biocénose, Holobionte, Syncytium, Biome, Rhizome et Métapopulation. Leurs services et capacités diffèrent selon le mode.
- Snapshots, forks contrefactuels, diffs, replay et gates de promotion fondées sur des preuves.
- Runtime d'agents supervisés : processus, workspaces isolés, budgets, mémoire et rapports d'évidence.
- Contrôles de sécurité : autorisations, isolation de workspace, VFS sandboxé et gates de promotion.

Ce n'est pas un framework d'agents. C'est un runtime qui essaie de rendre l'agentic computation moins fertile pour les hallucinations de chaîne.

🌐 **Site public** : https://genoswork.vercel.app  
🧬 **Repo + code** : https://github.com/PISSARAW/GenOS  
📖 **Docs** : https://github.com/PISSARAW/GenOS/tree/main/docs  
🏁 **Démo** : `examples/safe-debugging-demo` (zéro token, exécutable)

---

## Le truc qui divergence GentOS des autres orchestrateurs

La plupart des orchestrateurs avancent sur une seule timeline mutable. GenOS fait l'inverse : **l'état est versionné par défaut**.

| Ce que vous faites | Sortie normale | Sortie GenOS |
| --- | --- | --- |
| Un agent échoue pendant une mission | L'état est difficile à reprendre | Snapshots, workspaces isolés et processus survivants supervisés |
| Vous voulez comparer deux approches | Lancement séquentiel et contexte séparé | Forks contrefactuels, diff et replay ; l'évaluation dépend du scénario |
| Un modèle propose une décision critique | La sortie du modèle est traitée comme résultat | Les gates peuvent exiger des preuves avant promotion |

En gros : GenOS est conçu pour ce qui arrive quand l'agent se trompe, pas seulement quand il réussit.

---

## Huit topologies d'orchestration

- **Trinity** — agents candidats comparés par dossiers d'évidence et barrière comparative.
- **A-Team** — workers spécialisés par domaine, handoffs et arbitrage d'intégration.
- **Biocénose** — consensus pondéré, quorum, métriques d'essaim et barrière d'évidence.
- **Holobionte** — hôte avec veto immunitaire et workers symbiotes en inférence locale.
- **Syncytium** — état partagé CRDT et vérification de cohérence des invariants.
- **Biome** — allocation de ressources et algorithmes d'exploration inspirés du foraging.
- **Rhizome** — sessions composées, routage par capacité entre membres et traces stigmergiques.
- **Métapopulation** — quorum pondéré, plasticité des connexions et plan de récupération par lignage.

Les capacités disponibles et les limites opérationnelles varient par topologie ; voir [Topologies et contrat de capacités](docs/02-orchestration/topologies-et-capacites.md).

---

## Ce qui est réel en ce moment

Fonctionnalités implémentées :

- **Snapshots, forks, diffs et replay** pour versionner et comparer l'état d'un workspace.
- **Démo de débogage parallèle sûr** : `examples/safe-debugging-demo`, exécutable sans clé API.
- **GenOS Studio** et backend Node.js : plan de contrôle, API REST, services gRPC et persistance SQLite WAL.
- **CLI Rust** et serveur MCP stdio pour les opérations locales et les intégrations.
- **Runtime agentique supervisé** : lance des runtimes configurés, collecte leurs événements, applique des budgets et conserve les résultats et preuves.
- **Routage de modèles implémenté** : modèles distants via OpenAI, Anthropic, Gemini, Mistral, Groq, DeepSeek, Together et OpenRouter ; modèles locaux via Ollama, LM Studio et vLLM ; endpoints compatibles OpenAI configurables.
- **Politiques de routage** configurables par agent, tenant ou environnement, avec ordre de fallback ; le mode parallèle est disponible avec une limite de coût explicite.
- **Huit topologies d'orchestration** avec services de coordination et contrats de capacités. La présence d'un mode ne signifie pas que chaque capacité du profil est complète ou activée dans chaque installation.

Les routes de modèles sont conditionnelles à votre environnement :

- une route distante demande le réseau, un modèle déclaré et la clé du fournisseur correspondante ;
- une route locale demande un serveur d'inférence actif et un modèle de conversation disponible ;
- `openai-compatible://` demande l'URL d'endpoint compatible configurée ;
- la configuration d'exemple sélectionne Ollama. Les intégrations ne téléchargent pas elles-mêmes les modèles.

Les primitives de perception web et de fovéation restent isolées et ne forment pas encore une boucle complète capture-observation-action-vérification. Certaines fonctions d'orchestration et d'évaluation restent expérimentales ; consultez les limites décrites dans la documentation avant de dépendre d'une capacité particulière.

---

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

Prérequis de développement : Rust stable 1.88+, Node.js 20.19+ ou 22.12+, Git et outils de compilation C/C++ pour les dépendances natives SQLite. Python 3 est nécessaire pour lancer le contrôle qualité du dépôt. Après la copie de `.env.example`, adaptez `GENOS_DB_PATH` à un emplacement accessible sur votre machine ; la valeur `/data/genos.db` de l'exemple correspond à un chemin de déploiement.

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
