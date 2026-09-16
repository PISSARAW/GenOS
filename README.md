# GenOS — Runtime d'orchestration destiné à survivre à l' hype

GenOS est un runtime pour agents autonomes où **une exécution réussie n'est pas une preuve, et une erreur n'est pas fatale**.

- 8 modes d'orchestration (Trinity, A-Team, Biocénose, Holobionte, Syncytium, Biome, Rhizome, Métapopulation).
- Snapshots atomiques, forks contrefactuels, diffs, replay déterministe, promotion par preuve.
- Agents = cellules d'exécution : identité, génome, budget cognitif, mémoire, synapses.
- Sécurité en couches : sandbox atomique, gates de promotion, arbitre de réalité.

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
| Un agent plante à moitié | Vous perdez tout, vous repeignez | Snapshot existant, branche corrompue isolée, survivants préservés |
| Vous voulez comparer 2 approches | Lancement séquentiel, mémoire de contexte fragile | Fork contrefactuel, diff, replay, scoring Pareto |
| Un LLM doit faire une décision critique | Success: true = promoted (souvent) | Arbitre de réalité + gates + preuves avant promotion |

En gros : GenOS est conçu pour ce qui arrive quand l'agent se trompe, pas seulement quand il réussit.

---

## 8 modes d'orchestration (biomimétique, pas décoratif)

- **Trinity** — 3 mondes parallèles (thèse, antithese, synthèse), fusion des résultats robustes.
- **A-Team** — équipe plurisciplinaire instantanée, spécialisation + fusion.
- **Biocénose** — communauté coopérative, comportements émergents.
- **Holobionte** — sécurité intégrée à l'agent, pas ajoutée après coup.
- **Syncytium** — mémoire collective, cohérence sans centralisation rigide.
- **Biome** — populations spécialisées dans des niches distinctes, parallélisme à grande échelle.
- **Rhizome** — auto-organisation, réseau non hiérarchique, résilience des chemins.
- **Métapopulation** — plusieurs populations semi-indépendantes, diversité + échange.

Vous pouvez en combiner plusieurs. C'est biomimétique, pas une usine à gaz.

---

## Ce qui est réel en ce moment

Ce n'est pas du vaporware. Ce qui existe vraiment aujourd'hui :

- **Snapshots, forks, diffs, replay** sans appel LLM — parce que vous devez pouvoir reproduire un résultat avant de le croire.
- **Demo de débogage parallèle sûr** : `examples/safe-debugging-demo` — lancez-la sans clé API.
- **GenOS Studio** : plan de contrôle local (React + Express + SQLite).
- **CLI Rust** + **serveur MCP** pour les intégrations.
- **Backend Node.js** : API REST + gRPC, SQLite WAL, 360+ tests, 117 services, 41 contrôleurs.

Ce qui est encore expérimental :

- Évaluation Pareto multi-objectifs, croyances, mémoire, provenance, lignage.
- Orchestration de swarms biomimétiques avancés.
- Connecteurs modèles (GPT-4o, Claude 3.5, Ollama) — prévus v0.1.0.

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

Prérequis : Rust 1.88+, Node 20.19/22.12+, Python 3 (gate qualité), Git.

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
