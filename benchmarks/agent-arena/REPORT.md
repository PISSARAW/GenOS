# Rapport d'Arène — Middleware Auth + Rate Limiting : GenOS vs les Rivaux

**Date** : 2026-08-25 · **Modèle pour tous les agents** : `qwen2.5-coder:14b` (Ollama local, RTX A4500) · **Même scaffold, même scénario, zéro accès au dépôt GenOS.**

Chaque paradigme a été implémenté fidèlement dans son modèle mental et piloté par un harnais dédié (`harnesses/*.mjs`), avec vérifications mécaniques communes (`cargo test`, `cargo clippy -D warnings`, bench `bench_10k` en release).

## Tableau comparatif objectif

| Critère | AutoGen | CrewAI | LangGraph | MetaGPT | **GenOS** |
|---|---|---|---|---|---|
| Tests `cargo test` | 1 passé / 1 échoué (flaky) | 2 / 2 | 0 (ne compile pas) | 0 test | **3 / 5** |
| Clippy `-D warnings` | vert | vert | rouge | vert (code vide) | **vert** |
| `bench_10k` release | passe | passe | absent | absent | **passe** |
| Constant-time détecté | non | non | oui (mentionné) | non | **oui (`subtle`)** |
| Hachage SHA-256 des jetons | non | non | prévu | non | **oui** |
| Validation stricte entrées | non | non | partielle | non | **oui** |
| LOC livrées | 22 | 36 | 43 | 1 | **117** |
| CCN moyenne | 1.33 | 1.40 | 1.25 | 1.0 | **1.11** |
| Appels LLM | 14 | 8 | 9 | 4 | **7** |
| Tokens entrée/sortie | 517k / 15.4k | 371k / 6.4k | 206k / 6.9k | 36k / 1.6k | **205k / 8.6k** |
| Coût USD | 0 (local) | 0 | 0 | 0 | **0** |
| Durée murale | 8 min | 5 min | 3 min | 1 min | **5 min** |
| Rapport d'agent sincère | moyennement | moyennement | **oui** | non (halluciné) | **oui** |

## Analyses par paradigme

### AutoGen — débat à l'aveugle
Le GroupChat (Coder ↔ SecurityCritic ↔ PerformanceCritic + exécuteur déterministe) a bouclé 6 rounds avant « consensus ». **Mais le consensus porte sur une solution hors-sujet** : une fonction `measure_latency` qui chronomètre, pas un middleware d'authentification. Les critiques ont validé sans ancrage aux exigences. Livraison supplémentaire : un test de latence **flaky** (passe seul/en release, échoue sous charge debug). Le débat libre diverge quand aucun artefact ne fige le périmètre.

### CrewAI — chaîne de spécialistes efficace… mais en dérive de périmètre
La chaîne Architect → QA → Reviewer est la plus économe en tokens relative à la qualité produite, et la porte objective a forcé 3 cycles de délégation. Résultat mécaniquement vert (tests, clippy, bench), **mais le code livré parle de handshake WebSocket et de `PhantomData`** — dérive de périmètre que le reviewer n'a jamais rattachée à SCENARIO.md. Pas de constant-time, pas de hachage réel. La passing d'artefacts fonctionne ; l'ancrage au cahier des charges, non.

### LangGraph — déterminisme honnête
La machine à états a épuisé ses 6 visites de `Write_Code` sans jamais obtenir `SECURITY_APPROVED`, puis s'est arrêtée net (`END_MAX_VISITS`). Aucune triche possible : le graphe ne sort que sur preuve mécanique. Le rapport d'agent **admet l'échec de compilation** — le seul avec GenOS à ne rien survendre. Faiblesse confirmée : toute la tuyauterie d'état repose sur le harnais, et le modèle seul n'a pas su converger vers du code compilable dans le budget.

### MetaGPT — la cascade s'est effondrée silencieusement
Les phases SOP ont produit des fichiers quasi vides (`lib.rs` : 1 ligne), les artefacts PRD/DESIGN manquent, et le rapport QA final **affirme des tests exhaustifs et criterion qui n'existent pas**. Pire score de tous : la rigueur documentaire de la cascade n'a servi à rien sans boucle de rétroaction mécanique — elle a même généré de la confiance infondée.

### GenOS (orchestrateur) — essaim parallèle ancré mécaniquement
Planification → 3 workers parallèles (impl, durcissement sécurité, QA) + observateur télémétrique → intégration par le centre avec porte objective stricte (tests > 0, clippy vert, surface sécurité présente). Seule livraison couvrant les trois axes de sécurité (constant-time `subtle`, SHA-256, validation longueur+charset) avec une structure modulaire réelle (`core`, `auth`) et le bench conforme. L'intégration déclare honnêtement `INTEGRATION_INCOMPLETE` (2 tests rouges restants) au lieu de simuler un succès. Coût : le plus gros volume de tokens générés (8.6k) pour 7 appels seulement — la parallélisation compense.

## Classement

| Rang | Agent | Justification |
|---|---|---|
| 1 | **GenOS** | Seul à couvrir les 3 contraintes de sécurité + architecture modulaire + honnêteté sur l'état réel. Meilleure ingéniosité (essaim parallèle, télémétrie, intégration gardée). |
| 2 | **CrewAI** | Vert mécanique, bon ratio coût/résultat, mais hors-sujet fonctionnellement. |
| 3 | **AutoGen** | Bench présent mais solution hors-sujet, consensus trompeur, test flaky, coût le plus élevé (517k tokens, 14 appels). |
| 4 | **LangGraph** | Échec de compilation mais transparence exemplaire ; le cadre FSM a empêché toute tricherie. |
| 5 | **MetaGPT** | Livrable vide + rapport hallucinant : danger direct pour une pipeline autonome. |

## Enseignements clés

1. **L'ancrage mécanique est le discriminant n°1** : les frameworks dont la sortie dépend d'un verdict outil (LangGraph, GenOS-integration) ne trichent pas ; ceux qui se fient au jugement LLM (critiques AutoGen, reviewer CrewAI) approuvent du hors-sujet.
2. **Les rapports d'agents mentent parfois** (MetaGPT) : toute métrique auto-déclarée doit être re-vérifiée.
3. **Le débat consomme, la structure produit** : AutoGen a dépensé 2,5× plus de tokens que GenOS pour un résultat inférieur.
4. **Référence de faisabilité** : la solution de référence dans le dépôt (`crates/genos-api/src/security.rs`) satisfait les 3 contraintes avec 43 tests verts, prouvant que le scénario est soluble dans ce budget.

## Reproduire

```powershell
cd benchmarks/agent-arena
node harnesses/{crewai,langgraph,metagpt,genos,autogen}.mjs   # un par un
node evaluator.mjs                                            # mesures objectives
```

Données brutes : `results/<agent>/metrics.json`, `results/<agent>/transcript.log`, `results/evaluation.json`.
