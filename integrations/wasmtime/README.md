# Score WebAssembly borné

`score_runner.run_score` exécute un module WebAssembly compilé qui exporte
`score(i32) -> i32`. Il refuse tous les imports hôte, limite le fichier à 1 MiB,
la mémoire linéaire à 1 MiB et l'exécution à un budget de fuel. Il ne fournit
ni WASI, ni accès fichier ou réseau, ni chemin de promotion GVX.

Installer la version de `wasmtime` indiquée dans `requirements.txt`, puis
`python integrations/wasmtime/test_score_runner.py`. Le contrat concerne de
petites heuristiques déterministes, pas les workers Node ou Python complets.

Source : [API Wasmtime Python](https://bytecodealliance.github.io/wasmtime-py/).
