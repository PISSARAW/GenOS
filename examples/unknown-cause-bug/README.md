# Resoudre un bug sans connaitre sa cause

Cette demonstration lance sept correctifs candidats dans sept workspaces
isoles. Chaque branche execute exactement les memes preuves falsifiables :
`test 18`, `trace 212` et la reproduction de production.

```powershell
cargo run -p genos-cli -- experiment bug-investigation examples/unknown-cause-bug/experiment.yaml --summary
```

La baseline reproduit d'abord le bug. Six hypotheses sont ensuite rejetees et
la configuration stale est la seule a survivre aux trois probes. Le rapport ne
conserve pas uniquement ce correctif : `explanation_space` contient le verdict
et les preuves de chaque possibilite eliminee. Les mondes rejetes, leurs diffs,
leurs sorties et leurs snapshots restent inspectables.

Le rapport complet est ecrit dans
`.genos/experiments/unknown-cause-pricing-bug/reports/unknown-cause-pricing-bug.json`.
