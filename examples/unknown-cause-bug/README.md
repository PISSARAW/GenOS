# Resoudre un bug sans connaitre sa cause

Cette demonstration lance sept correctifs candidats dans sept workspaces
isoles. Chaque branche execute exactement les memes preuves falsifiables :
`test 18`, `trace 212` et la reproduction de production.

```powershell
cargo run -p genos-cli -- experiment bug-investigation examples/unknown-cause-bug/experiment.yaml --summary
```

Le meme espace d'hypotheses peut etre lance sur un repository passe directement :

```powershell
cargo run -p genos-cli -- experiment bug-investigation --repo examples/unknown-cause-bug/buggy-service --plan examples/unknown-cause-bug/experiment.yaml --summary
```

La baseline reproduit d'abord le bug. Six hypotheses sont ensuite rejetees et
la configuration stale est la seule a survivre aux trois probes. Le rapport ne
conserve pas uniquement ce correctif : `explanation_space` contient le verdict
et les preuves de chaque possibilite eliminee. Les mondes rejetes, leurs diffs,
leurs sorties et leurs snapshots restent inspectables.

Le rapport complet est ecrit dans
`.genos/experiments/unknown-cause-pricing-bug/reports/unknown-cause-pricing-bug.json`.

Le rapport audite `agent init → agent snapshot → agent fork → agent run → agent
diff → agent lineage`. `agent merge` est marque `deferred` : selectionner le
seul correctif survivant ne doit pas etre confondu avec une fusion cognitive.
