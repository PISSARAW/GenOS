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
`evidence: {path, sha256}` vers un fichier sous le répertoire du manifeste ; le
lanceur vérifie le contenu et refuse un hash ou un chemin hors scope. La sortie contient un hash du reçu et
un hash commun des tâches. Lancez `node benchmarks/agentgit-competitors/run.cjs
manifest.json résultats.json` puis conservez le manifeste, les versions et les
artefacts cités par les preuves. `mock-adapter.cjs` ne sert qu'au test du runner ;
il ne mesure aucun produit. Validation : `node benchmarks/agentgit-competitors/run-test.cjs`.

## Campagne publique reproductible

`public-sources.json` fige les dépôts et versions publics examinés. Le dépôt
officiel de GCC cité dans l'article est indisponible au moment de la collecte ;
Contexa est une implémentation indépendante du format GCC, présentée sous son
propre nom. Letta Code et DGM sont épinglés, mais leurs trajectoires complètes
requièrent un service, des modèles, des clés et, pour DGM, un environnement
d'exécution isolé. Leurs reçus portent `not_run` ; aucun score ne leur est imputé.

Sur Windows, préparer les deux bibliothèques sans modèle et exécuter le scénario
commun d'isolement de branche :

```powershell
npm install --prefix D:\GenOS-agentgit-bench\deps --no-audit --no-fund @langchain/langgraph@1.5.2 contexa@1.1.2
$env:GENOS_AGENTGIT_BENCH_DEPS = 'D:\GenOS-agentgit-bench\deps'
$env:GENOS_AGENTGIT_BENCH_REPO = (Resolve-Path .).Path
node benchmarks/agentgit-competitors/prepare-public.cjs D:\GenOS-agentgit-bench\campaign
node benchmarks/agentgit-competitors/run.cjs D:\GenOS-agentgit-bench\campaign\manifest.public.json D:\GenOS-agentgit-bench\campaign\results.public.json
```

L'adaptateur appelle réellement AgentGit, Contexa et LangGraph. Il vérifie que
la branche ou le checkpoint candidat contient le changement et que le point de
départ conserve son état, puis écrit les observations dans des fichiers JSON
hachés. L'opération Contexa valide aussi la visibilité après fusion. Cette
campagne ne mesure ni performance sur une tâche cognitive, ni reprise complète
de runtime, ni fiabilité statistique. Les résultats publiés sont descriptifs,
sans classement et sans conclusion de supériorité.

La campagne du 24 octobre 2026 et ses trois traces sont conservées dans
`results/public-2026-10-24/`. Vérification indépendante des hashes, des reçus
et du rapport : `node benchmarks/agentgit-competitors/verify-campaign.cjs
benchmarks/agentgit-competitors/results/public-2026-10-24`. Le manifeste
archivé contient les chemins absolus du poste d'exécution ; pour relancer
ailleurs, régénérez-le avec `prepare-public.cjs`.
