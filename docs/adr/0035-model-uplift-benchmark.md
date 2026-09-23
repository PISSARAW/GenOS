---
title: GenOS Model Uplift Benchmark et Capability Amplification Benchmark
date: 2026-09-23
status: proposed
authors: GenOS
decision-id: 0035
---

# ADR 0035 : GMUB / GCAB — Model Uplift longitudinal et ablations

## Contexte

La couche d'évaluation existante (`docs/06-qualite-preuves/evaluation-qualite.md`,
`backend/src/services/evaluationGraders.js`,
`backend/src/services/evaluationObservabilityService.js`,
`backend/src/controllers/experimentController.js`) sait scorer, persister,
tracer et biseauter. Elle ne sait pas répondre à la question centrale :

> De combien GenOS augmente-t-il la capacité effective d'un modèle,
> exprimée en niveaux de modèles autonomes dépassés ?

Il manque : comparaison appariée solo vs GenOS vs contrôle compute,
ladder de modèles émergente, Highest Model Beaten (HMB), tier uplift,
Weakest-Model Crossover (WMC), Architecture Intelligence Gain (AIG),
budgets tokens/$/temps, `activated_capabilities` vs déclaratives
(`docs/02-orchestration/topologies-et-capacites.md`), et ablations causales.

## Décision

Créer deux protocoles complémentaires prolongeant le framework existant,
sans second framework parallèle :

- **GMUB (GenOS Model Uplift Benchmark)** : protocole externe.
  Ladder solo émergente, paires appariées même cas, bootstrap 95%,
  HMB, tier uplift, WMC, efficiency matched, contrôle compute naïf.
- **GCAB (GenOS Capability Amplification Benchmark)** : protocole interne.
  Ablations `full vs -memory / -epistemics / -biomimicry / -evolution /
  -recovery / -topology`, contribution causale par capacité.

Modules :

- `backend/src/services/uplift/pairedStats.js` : différences appariées,
  bootstrap déterministe, `LCB95(D) > delta` pour déclarer battu.
- `backend/src/services/uplift/ladderService.js` : ladder triée,
  rang effectif, HMB, tier uplift.
- `backend/src/services/uplift/costAccounting.js` : quality/cost,
  quality/tokens, multiplicateurs.
- Migration `049-uplift-tables` : `uplift_runs`, `uplift_pairs`,
  `uplift_comparisons` + export JSON `benchmarks/gmub/`.
- `benchmarks/gmub/` : suite, runner, exports reproductibles.

Règles :

- Tiers émergents des scores solo, jamais décidés à la main.
- Victoire déclarée seulement si `LCB95 > delta` (défaut `delta=0`).
- Chaque run enregistre `genos_commit`, `topology`,
  `declared/activated/observed_capabilities`, `seed`,
  budgets tokens/coût/temps, `requestedModel/servedModel`.
- Une capacité n'est une amélioration que si elle augmente HMB/tier
  uplift ou améliore coût/robustesse sans dégrader les autres axes.

## Conséquences

### Positives

- Courbe d'évolution cognitive de GenOS par release et par domaine.
- Distinction amplification / compensation / crossover mesurable.
- Réponse à « plus de compute ? » via efficiency matched + contrôle naïf.
- Preuve empirique du biomimétisme (`bio > nonbio` sur exploration,
  recovery, diversité) au lieu d'affirmation doctrinale.
- Aligné avec la règle : transport réussi n'est pas décision valide ;
  `kind: metric`, `qualityGuarantee: false` conservés.

### Négatives

- Coût de runs répétés (solo + genos + contrôle + ablations).
- Nécessite discipline `activated vs observed` sinon attribution fausse.
- Petits N => intervalles larges => beaucoup d'inconclusifs (sain).

## Alternatives

- Score brut `S_genos - S_solo` seul : rejeté, illisible entre générations.
- Tiers manuels : rejeté, fragile scientifiquement.
- Nouveau framework séparé : rejeté, duplique jobs/checkpoints/provenance.
- `73.2 > 72.8 donc victoire` sans CI : rejeté, non crédible.
