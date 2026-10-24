# Protocole de comparaison AgentGit

Ce répertoire définit un format commun pour comparer GenOS à Letta, GitAgent,
GCC, LangGraph et DGM. Le scoreur ne lance pas ces produits et ne fabrique pas
de résultats : chaque adaptateur doit produire un reçu JSON par scénario et
joindre une preuve à chaque résultat `pass` ou `fail`.

Les métriques sont descriptives : intégrité des snapshots, isolement des
branches, conservation des contradictions, sûreté des permissions et replay.
Les scénarios ne sont comparés que lorsque tous les systèmes ont fourni le
même identifiant de tâche. Les résultats `unsupported` et `not_run` restent
visibles et ne deviennent pas des échecs ou des réussites implicites.

Le format est `genos.agentgit-benchmark/v1`. Les reçus doivent renseigner le
système, sa version, l’adaptateur, la date de collecte et les mesures par tâche.
`score.cjs` valide ces reçus et produit un rapport sans classement automatique.
Le benchmark n’est pas considéré comme publié tant que des runs réels et leurs
preuves ne sont pas fournis pour les systèmes comparés.

Validation locale du scoreur : `node benchmarks/agentgit-competitors/test.cjs`.

`run.cjs` lance des adaptateurs installés par l'opérateur, une fois par tâche,
avec la même entrée JSON et un délai de deux minutes. Exemple de manifeste :

```json
{
  "schema": "genos.agentgit-benchmark-manifest/v1",
  "tasks": [{ "id": "integrity-tamper", "input": { "tamper": true } }],
  "systems": [{ "name": "GenOS", "version": "version-réelle", "adapter": "C:/chemin/node.exe", "args": ["adaptateurs/genos.cjs"] }]
}
```

Chaque adaptateur lit sur stdin `{schema, task, system}` et émet un unique JSON
`{taskId, system, version, metrics}`. Un résultat `pass` ou `fail` doit contenir
une preuve vérifiable dans `evidence`. La sortie contient un hash du reçu et
un hash commun des tâches. Lancez `node benchmarks/agentgit-competitors/run.cjs
manifest.json résultats.json` puis conservez le manifeste, les versions et les
artefacts cités par les preuves. `mock-adapter.cjs` ne sert qu'au test du runner ;
il ne mesure aucun produit. Validation : `node benchmarks/agentgit-competitors/run-test.cjs`.
