# GMUB — GenOS Model Uplift Benchmark

Protocole longitudinal (ADR 0035) : `solo` vs `genos` vs `compute_control`,
paires appariées même cas, bootstrap 95%, ladder émergente, HMB.

## Règle de victoire

`LCB95(D) > margin` => battu, sinon **inconclusif**. Jamais `73.2 > 72.8`.

## Exécution

```bash
node benchmarks/gmub/run-gmub.cjs --input benchmarks/gmub/example-runs.json --out /tmp/gmub-report.json
```

`example-runs.json` : `{ suite, model, stats, cost, wmc: {frontier, margin}, runs: [...] }`.
Export reproductible : commit, topologie, `declared/activated/observed_capabilities`,
seed, tokens, coût, latence persistés en `uplift_runs` (migration `049`)
et réexportés en JSON.

## Tranche 2 — contrôle compute et WMC

- `compute_control` : mêmes cas, même modèle, compute naïf
  (`independent_samples`, `self_consistency`, `retry`, `majority_vote`),
  sans architecture GenOS. Le rapport exige `C > B > A` avec IC95 sur les
  trois paires (`abc.fullOrdering`) ; `organizationBonus` = gain GenOS
  au-delà du compute naïf.
- `wmc` : plus petit modèle + GenOS dépassant un frontier solo donné ;
  `wmcCurve` suit son évolution par version GenOS.
- Efficiency-matched : comparer `Quality/Cost` à budgets plafonnés égaux
  (`summarizeCost`), pas seulement les scores bruts.

## GCAB

Ablations `full vs -memory / -epistemics / -biomimicry / -evolution /
-recovery / -topology` : `Contribution = S(G) - S(G-cap)`, même harness,
`mode: ablation`.
