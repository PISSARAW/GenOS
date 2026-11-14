# Benchmarks

Protocoles et résultats de comparaison des topologies GenOS.

## Conservation des preuves brutes

Les sorties de benchmark sont générées et restent ignorées par défaut. Deux jeux
historiques sont néanmoins versionnés comme annexes de preuve, car leurs comptes
rendus les citent directement :

- `benchmarks/biological-reproduction/campaigns/2026-10-22/logs/`, référencé par
  le `README.md` et le `results.json` de cette campagne ;
- les journaux `*preflight*.log` et le dossier
  `evidence-runtime-llm-20261022/` sous
  `benchmarks/cognitive-key-ablation/results/`, référencés par les comptes rendus
  d'échec et de run LLM réel associés.

Ces exceptions sont figées dans `.gitignore`. Elles ne constituent pas une règle
générale autorisant les journaux ou codes de sortie de nouveaux runs. À la racine,
`arch_snapshot.json` reste versionné comme fixture documentaire référencée par
`docs/README.md`; les snapshots de session et requêtes de test ponctuelles doivent
être écrits dans les emplacements ignorés.

- [FP-AMB sur les services mémoire GenOS — campagne du 26 octobre 2026](fp-amb-genos-2026-10-26.md) — exécution complète du benchmark officiel, configuration, scores, catégories, preuves, limites et reproduction.

- [Comparaison locale entre un agent Codex et un worker GenOS](comparaison-agent-codex-worker-genos-2026-10-15.md) — même mission MCP, preuves, coûts observés, verdict `unresolved` et gate de promotion.
- [Campagnes empiriques AGOW, MBH-RNN et Lipson-like](campagnes-agow-mbh-lipson.md) — campagnes locales exécutées et limites des résultats.
- [Benchmark longitudinal Holobionte](benchmark-longitudinal-holobionte.md) — protocole apparié à douze bras ; campagne longitudinale non exécutée.
- [Protocole d'exécution Holobionte](protocole-execution-holobionte.md) — budgets, topologies, workers, nosologie, échanges, graphe d'agents et télémétrie.
- [Campagne causale bornée Holobionte](campagne-causale-holobionte.md) — bras isolés, oracle séparé, provenance SHA-256, verdict conjonctif et limites d'inférence.
- [Benchmark A-Team](benchmark-ateam.md) — protocole comparatif A-Team.
- [Missions de réflexion comparatives](missions-reflexion-comparatives.md) — pilote exécutable avec/sans GenOS sur branches, budget et porte de preuve, sans résultat préfabriqué.
- [Organisations qualité-diversité](qualite-diversite-organisations.md) — laboratoire Pyribs et ShinkaEvolve, validation tenue à l'écart.
- [Bancs AgentDojo et BrowserGym](../../integrations/agent_benchmarks/README.md) — sécurité et utilité de navigation évaluées séparément.
- [Protocole de benchmark Syncytium](benchmark-syncytium.md) — agrégateur, runner baseline/Syncytium et matrice de 53 cas ; campagne réelle non attestée.
