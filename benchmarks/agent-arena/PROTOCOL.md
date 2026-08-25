# Protocole de l'Arène

## Règles communes

1. Chaque agent travaille dans son bac à sable isolé : `workspaces/<agent>/`.
2. Chaque bac à sable contient un scaffold Cargo identique (`Cargo.toml`, `src/lib.rs` vide, `SCENARIO.md`).
3. Aucun agent n'a accès au dépôt GenOS ni aux workspaces des autres.
4. Même modèle LLM, mêmes outils (Read/Write/Edit/Bash), même budget d'itérations.
5. Chaque agent produit `REPORT.md` en français dans son workspace.

## Métriques collectées objectivement

| Catégorie | Métrique | Source |
|---|---|---|
| Fonctionnel | tests passés / total | `cargo test` |
| Qualité | warnings clippy (-D warnings) | `cargo clippy` |
| Sécurité | comparaison constant-time présente / naïve détectée | scan statique |
| Performance | latence moyenne sur 10k requêtes | `bench_10k` + chrono externe |
| Complexité | CCN moyenne/max, LOC, nb fonctions | analyse statique |
| Coût IA | tokens entrée/sortie, coût USD, appels LLM, tours | JSON claude CLI |
| Temps | durée murale totale du run | horloge harnais |
| Ingéniosité | analyse qualitative du rapport | lecture humaine/LLM juge |

## Paradigmes en compétition

- `autogen` : conversation Coder ↔ SecurityCritic ↔ PerformanceCritic, exécuteur déterministe, boucle jusqu'à consensus.
- `crewai` : chaîne séquentielle Architect → QA → Reviewer avec une délégation de révision possible.
- `langgraph` : graphe d'états explicite (State JSON) avec arêtes conditionnelles et nœud évaluateur.
- `metagpt` : cascade SOP : PM (PRD) → Architect (design) → Engineer (code) → QA (tests), sans boucle.
- `genos` : orchestrateur qui planifie, recrute des workers parallèles spécialisés + observateur télémétrique, intègre et vérifie.
