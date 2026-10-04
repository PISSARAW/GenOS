# Campagne comparative des workers

Le jeu contient 20 cas couvrant les 19 types de workers. Trois cas disposent
d'un oracle automatique : LPT, `subset_sum` et un théorème arithmétique Lean.
Les autres cas définissent des tâches, mais n'ont pas encore d'oracle métier
indépendant. Leur résultat est toujours `unmeasured`, même si un adaptateur
retourne `executed`. Une référence de preuve fournie par un adaptateur ne
suffit pas à certifier une capacité.

Exécution locale actuelle :

```powershell
node benchmarks/workers/campaign.cjs benchmarks/workers/genos-adapter.cjs genos "$env:TEMP/genos-workers.json"
```

Pour inclure Lean, placer l'exécutable `lean` dans le `PATH` ou définir
`GENOS_LEAN_EXECUTABLE`, puis fournir la sortie exacte de `lean --version`
dans `GENOS_BENCHMARK_LEAN_VERSION`. Le
vérificateur du benchmark relance Lean indépendamment de l'adaptateur.

Un adaptateur rival est un module CommonJS exportant
`async runCase(testCase)`. Il retourne `{ status: 'executed', result, receipt }`,
`{ status: 'unavailable', reason }` ou lève une erreur. Le même jeu de cas,
ses paramètres et ses oracles sont appliqués aux deux systèmes :

```powershell
node benchmarks/workers/campaign.cjs chemin/vers/rival-adapter.cjs rival "$env:TEMP/rival-workers.json"
node benchmarks/workers/compare.cjs "$env:TEMP/genos-workers.json" "$env:TEMP/rival-workers.json"
```

La comparaison refuse deux rapports du même système, des versions de jeu
différentes et les cas manquants ou dupliqués. Elle ne compare que les cas
munis d'un oracle et mesurés des deux côtés. Le temps mesuré comprend
l'exécution de l'adaptateur, pas la validation de l'oracle. La campagne
locale mesure deux cas procéduraux sans Lean et un troisième cas formel
quand Lean est configuré ; elle ne démontre aucune parité
avec un rival. Les sorties JSON sont des artefacts temporaires à conserver
hors du dépôt.
