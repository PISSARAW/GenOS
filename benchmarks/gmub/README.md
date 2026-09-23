# GMUB — GenOS Model Uplift Benchmark

Protocole longitudinal (ADR 0035) : `solo` vs `genos` vs `compute_control`,
paires appariées même cas, bootstrap 95%, ladder émergente, HMB.

## Règle de victoire

`LCB95(D) > margin` => battu, sinon **inconclusif**. Jamais `73.2 > 72.8`.

## Exécution

```bash
node benchmarks/gmub/run-gmub.cjs --input benchmarks/gmub/example-runs.json --out /tmp/gmub-report.json
```

`example-runs.json` : `{ suite, model, stats, cost, runs: [{suite, case_id, model, mode, score}] }`.
Export reproductible : commit, topologie, `declared/activated/observed_capabilities`,
seed, tokens, coût, latence persistés en `uplift_runs` (migration `049`)
et réexportés en JSON.

## GCAB

Ablations `full vs -memory / -epistemics / -biomimicry / -evolution /
-recovery / -topology` : `Contribution = S(G) - S(G-cap)`, même harness,
`mode: ablation`.
