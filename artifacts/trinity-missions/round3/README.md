# Round 3 — 12 variants, 12 missions discriminantes (03/10/2026, 18:36–19:39)

36 agents GenOS réels (`ollama://qwen2.5-coder:7b` sauf V2 : 3 modèles assignés qwen/llama/deepseek — **non propagés à l'exécution**, voir R3-V2). Briefs : `missionV1.txt`…`missionV12.txt`. Lancement : `launch_round3.cjs V1..V12` (+ `trinity_jury` pour V7). Statut : `status_round3.cjs Vn`. Mécanismes : `round3_checks.cjs`, `check_nested.cjs`.

Contexte : le repo a évolué en parallèle (commits 89bc3e04, 67de7023, d79eb9e3, df953288, 6d7d0293, 620fbc0c) — cross-examination exécutée, receipts indépendants, gate diversité, profils Pareto, contrats de mission. La campagne tourne sur ce code.

## Verdicts

| # | Variant | Mécanisme sous pression | Verdict |
|---|---|---|---|
| V1 | controlled | 3 erreurs différentes sur tâche vérifiable (7/19/68 stables) | ÉCHEC (zéro convergence) |
| V2 | heterogeneous | gate refusé puis passé (0.135→0.415 assigné) ; paradigmes réels W1/W3 mais exécution mono-modèle | PARTIEL |
| V3 | adversarial | W1 affirme le faux ; W3 rejette sans contre-exemple ; pas de phase 2 visible | ÉCHEC |
| V4 | counterfactual | baseline/interventions/deltas déclarés, désaccord réel W3, rien mesuré | PARTIEL (meilleur R3) |
| V5 | factorial | évasion + revendications + 2 cellules nommées ; pas d'ANOVA/interactions | ÉCHEC |
| V6 | pareto | 3 propositions isolées, pas de dominance, pas de front | ÉCHEC |
| V7 | jury | préconditions OK, **zéro délibération exécutée**, mondes affirment le contraire | ÉCHEC |
| V8 | recursive | intention déclarée, **zéro Trinity imbriquée** (vérifié DB) | ÉCHEC |
| V9 | adaptive | auto-citations, victoire déclarée, confusion équitable/égal ; allocation restée uniforme | ÉCHEC |
| V10 | temporal | inversion court/long articulée + rejet motivé, non chiffrée | PARTIEL (2e) |
| V11 | oracular | distribution affirmée sans contenu : l'échec prédit par le test lui-même | ÉCHEC |
| V12 | exploratory | évasion + niches revendiquées sans contenu, convergence sur la consigne | ÉCHEC |

**12/12 comparaisons : ESCALATE, 0 merge.** Aucune fuite inter-missions détectée (règle ADR 0280 active par défaut).

## Schéma de communication (toutes missions)

```
[Brief Vn + variant] --dispatch_trinity--> [Orch MCP] --3 membres scellés--> [3× local-codex-runtime + ollama]
  --> [EVIDENCE_REPORT ×3] --> [Comparateur (poids résolvables + matrice expliquée)]
  --> [Superviseur] --ESCALATE + publish--> [Journal organisation]
```

## Budget global

- 36 runs ollama (~10–40 s chacun, par vagues de 3), ~63 min de 18:36 à 19:39 (dont mes délais de sondage).
- 0 $ ; tokens non comptés en local ; artefacts sous `artifacts/trinity-missions/` (git-ignorés sauf `.md` committés sur demande).

## Lecture

Les mécanismes existent en prompts + services unitaires ; manquent à l'exécution : phase 2 adversarial nourrie, ANOVA/interactions, délibération jury, récursion déclenchée, réallocation mesurée, calibration oracle, niches QD, propagation `localModel`/`variantIndex` (trou transport connu). Les missions discriminantes font exactement leur travail : **un LLM qui simule verbalement le nom du variant se fait repérer partout.**
