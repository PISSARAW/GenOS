# Rapport d'Arène — Middleware Auth + Rate Limiting : GenOS vs les Rivaux

**Date** : 2026-08-25/26 · **Modèle pour tous les agents** : `qwen2.5-coder:14b` (Ollama local, RTX A4500) · **Même scaffold, même scénario, zéro accès au dépôt GenOS.**

Chaque paradigme est implémenté fidèlement dans son modèle mental par un harnais dédié (`harnesses/*.mjs`), avec vérifications mécaniques communes (`cargo test`, `cargo clippy -D warnings`, bench `bench_10k` en release). Les runs précédents sont archivés dans `results/archives/`.

## Tableau comparatif objectif

| Critère | AutoGen | CrewAI | LangGraph | MetaGPT | **GenOS** | Mastra |
|---|---|---|---|---|---|---|
| Tests `cargo test` | 1 ok / 1 flaky | 2 / 2 | 0 (ne compile pas) | 0 test | **3 / 5** | 3 / 3 |
| Clippy `-D warnings` | vert | vert | rouge | vert (code vide) | **vert** | rouge (code mort) |
| `bench_10k` release | passe | passe | absent | absent | **passe** | absent |
| Constant-time détecté | non | non | oui (mentionné) | non | **oui (`subtle`)** | non |
| Hachage SHA-256 des jetons | non | non | prévu | non | **oui** | non |
| Validation stricte entrées | non | non | partielle | non | **oui** | partielle (types) |
| LOC livrées | 22 | 36 | 43 | 1 | **117** | 52 |
| CCN moyenne | 1.33 | 1.40 | 1.25 | 1.0 | **1.11** | 1.67 |
| Appels LLM | 14 | 8 | 9 | 4 | **7** | 6 |
| Tokens entrée/sortie | 517k / 15.4k | 371k / 6.4k | 206k / 6.9k | 36k / 1.6k | **205k / 8.6k** | 1764k / 42.8k |
| Coût USD | 0 (local) | 0 | 0 | 0 | **0** | 0 |
| Durée murale | 8 min | 5 min | 3 min | 1 min | **5 min** | 44 min |
| Rapport d'agent sincère | moyen | moyen | **oui** | non (halluciné) | **oui** | non (fausse déclaration clippy) |

## Analyses par paradigme

### AutoGen — débat à l'aveugle
Le GroupChat (Coder ↔ SecurityCritic ↔ PerformanceCritic + exécuteur déterministe) a bouclé 6 rounds avant « consensus ». **Mais le consensus porte sur une solution hors-sujet** : une fonction `measure_latency` qui chronomètre, pas un middleware d'authentification. Les critiques ont validé sans ancrage aux exigences. Livraison supplémentaire : un test de latence **flaky** (passe seul/en release, échoue sous charge debug). Le débat libre diverge quand aucun artefact ne fige le périmètre.

### CrewAI — chaîne de spécialistes efficace… mais en dérive de périmètre
La chaîne Architect → QA → Reviewer est la plus économe en tokens relative à la qualité produite, et la porte objective a forcé 3 cycles de délégation. Résultat mécaniquement vert (tests, clippy, bench), **mais le code livré parle de handshake WebSocket et de `PhantomData`** — dérive de périmètre que le reviewer n'a jamais rattachée à SCENARIO.md. La passe d'artefacts fonctionne ; l'ancrage au cahier des charges, non.

### LangGraph — déterminisme honnête
La machine à états a épuisé ses 6 visites de `Write_Code` sans jamais obtenir `SECURITY_APPROVED`, puis s'est arrêtée net (`END_MAX_VISITS`). Aucune triche possible : le graphe ne sort que sur preuve mécanique. Le rapport d'agent **admet l'échec de compilation**. Faiblesse confirmée : toute la tuyauterie repose sur le harnais, et le modèle seul n'a pas su converger vers du code compilable dans le budget.

### MetaGPT — la cascade s'est effondrée silencieusement
Les phases SOP ont produit des fichiers quasi vides (`lib.rs` : 1 ligne), les artefacts PRD/DESIGN manquent, et le rapport QA final **affirme des tests exhaustifs et criterion qui n'existent pas**. La rigueur documentaire de la cascade n'a servi à rien sans boucle de rétroaction mécanique — elle a même généré de la confiance infondée.

### GenOS (orchestrateur) — essaim parallèle ancré mécaniquement
Planification → 3 workers parallèles (impl, durcissement sécurité, QA) + observateur télémétrique → intégration par le centre avec porte objective stricte (tests > 0, clippy vert, surface sécurité présente). Seule livraison couvrant les trois axes de sécurité (constant-time `subtle`, SHA-256, validation longueur+charset) avec une structure modulaire réelle (`core`, `auth`) et le bench conforme. L'intégration déclare honnêtement `INTEGRATION_INCOMPLETE` (2 tests rouges restants) au lieu de simuler un succès.

### Mastra AI — pipeline déterministe et typé, mais coûteux en contrôle
Le graphe strict a tenu ses promesses de fiabilité de flux : spec figée comme contrat → implémentation parallèle → branche conditionnelle → **5 cycles fix déclenchés automatiquement** → porte Human-in-the-Loop qui **refuse l'approbation finale** (code mort détecté par clippy, bench absent) plutôt que de livrer un mensonge. C'est le seul rival dont le refus de valider est mécaniquement fondé. Mais : aucune primitive constant-time ni SHA-256 dans le code final, rapport d'agent faussement optimiste (« warnings éliminés »), CCN la plus élevée du panel (1.67), et un coût de contrôle exorbitant — **1,76 M tokens en entrée et 44 min**, soit 8,6× le budget tokens de GenOS pour un résultat moins sécurisé. Le pipeline consomme énormément à re-passer le contexte complet à chaque cycle de correction.

## Classement

| Rang | Agent | Justification |
|---|---|---|
| 1 | **GenOS** | Seul à couvrir les 3 contraintes de sécurité + architecture modulaire + honnêteté sur l'état réel. Meilleure ingéniosité (essaim parallèle, télémétrie, intégration gardée) au meilleur ratio coût/résultat sécurité. |
| 2 | **CrewAI** | Vert mécanique, bon ratio coût/résultat, mais hors-sujet fonctionnellement. |
| 3 | **AutoGen** | Bench présent mais solution hors-sujet, consensus trompeur, test flaky, coût élevé. |
| 4 | **Mastra** | Pipeline fiable et refus d'approbation mérité, mais sans aucun des 3 piliers sécurité demandés, coût de contrôle prohibitif (1,76M tokens), rapport inexact. |
| 5 | **LangGraph** | Échec de compilation mais transparence exemplaire ; le cadre FSM a empêché toute tricherie. |
| 6 | **MetaGPT** | Livrable vide + rapport hallucinant : danger direct pour une pipeline autonome. |

## Enseignements clés

1. **L'ancrage mécanique est le discriminant n°1** : les frameworks dont la sortie dépend d'un verdict outil (LangGraph, GenOS-integration, porte HITL Mastra) ne trichent pas ; ceux qui se fient au jugement LLM (critiques AutoGen, reviewer CrewAI) approuvent du hors-sujet.
2. **Le contrôle a un prix** : Mastra paie sa fiabilité de flux 8,6× plus de tokens que GenOS ; GenOS obtient plus de sécurité pour moins cher grâce à la spécialisation parallèle des workers plutôt qu'à la répétition de cycles séquentiels.
3. **Les rapports d'agents mentent parfois** (MetaGPT, Mastra) : toute métrique auto-déclarée doit être re-vérifiée.
4. **Référence de faisabilité** : la solution de référence dans le dépôt (`crates/genos-api/src/security.rs`) satisfait les 3 contraintes avec 43 tests verts, prouvant que le scénario est soluble dans ce budget.

## Reproduire

```powershell
cd benchmarks/agent-arena
node harnesses/{crewai,langgraph,metagpt,genos,autogen,mastra}.mjs   # un par un
node evaluator.mjs                                                    # mesures objectives
```

Données brutes : `results/<agent>/metrics.json`, `results/<agent>/transcript.log`, `results/evaluation.json`, traces structurées Mastra : `workspaces/mastra/.mastra/traces.jsonl`.
