# Campagne comparative des workers

Le jeu contient 20 cas couvrant les 19 types de workers. Onze cas disposent
d'un oracle automatique : LPT, `subset_sum`, une vérification indépendante
de reçu de procédure, une falsification adversariale du même type de reçu,
une mesure expérimentale du makespan, une synthèse structurée de désaccord,
une fenêtre de surveillance numérique, une reconstruction de liens déclarés,
une recherche littérale dans un texte fourni, un contrôle de transfert
de `subset_sum`
et un théorème arithmétique Lean.
Les autres cas définissent des tâches, mais n'ont pas encore d'oracle métier
indépendant. Leur résultat est toujours `unmeasured`, même si un adaptateur
retourne `executed`. Une référence de preuve fournie par un adaptateur ne
suffit pas à certifier une capacité.

Les cas `scout-source`, `forensic-chain` et `teaching-transfer` contrôlent
leurs invariants dans un module d'oracle séparé des exécuteurs. Les autres
cas spécialisés utilisent encore un recalcul par le même module GenOS ; leur
validation ne doit pas être présentée comme indépendante de l'implémentation.

Exécution locale actuelle :

```powershell
node benchmarks/workers/campaign.cjs benchmarks/workers/genos-adapter.cjs genos "$env:TEMP/genos-workers.json"
```

Pour inclure Lean, placer l'exécutable `lean` dans le `PATH` ou définir
`GENOS_LEAN_EXECUTABLE`, puis fournir la sortie exacte de `lean --version`
dans `GENOS_BENCHMARK_LEAN_VERSION`. Le
vérificateur du benchmark relance Lean indépendamment de l'adaptateur.
L'adaptateur et ce contrôle disposent chacun de 120 secondes pour absorber
un démarrage à froid ; la durée mesurée inclut ce démarrage.

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
locale mesure dix cas sans Lean et un onzième cas formel
quand Lean est configuré ; elle ne démontre aucune parité
avec un rival. Les sorties JSON sont des artefacts temporaires à conserver
hors du dépôt.

## Premier adaptateur rival : AutoGen local

L'adaptateur [AutoGen AgentChat](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/index.html)
emploie son [client Ollama](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/models.html#ollama-experimental).
Installer `autogen-agentchat` et `autogen-ext[ollama]` dans un environnement
Python isolé, puis définir `GENOS_RIVAL_PYTHON` vers son interpréteur et
`GENOS_RIVAL_OLLAMA_MODEL` vers un modèle déjà présent sur le serveur local.

```powershell
$env:GENOS_RIVAL_PYTHON = 'chemin/vers/venv/Scripts/python.exe'
$env:GENOS_RIVAL_OLLAMA_MODEL = 'qwen2.5-coder:7b'
node benchmarks/workers/campaign.cjs benchmarks/workers/autogen-adapter.cjs autogen-local "$env:TEMP/autogen-workers.json"
node benchmarks/workers/compare.cjs "$env:TEMP/genos-workers.json" "$env:TEMP/autogen-workers.json"
```

`lpt-schedule` et `subset-sum` sont raccordés. La réponse brute du modèle est
conservée dans le rapport ; le validateur recalcule les charges depuis les
travaux affectés et rejette les travaux manquants ou dupliqués. Pour
`subset-sum`, il exige des indices distincts et recalcule leur somme.
Le digest `agent://`
porte sur cette réponse brute et ne doit pas être interprété comme un reçu
de solveur. L'absence de Python, du paquet AutoGen ou du modèle local rend
le cas indisponible ou en échec selon l'étape atteinte. Pour comparer un
rapport GenOS qui contient une preuve Lean, Lean doit aussi être disponible
lors de la relecture du comparateur ; un rapport GenOS sans Lean permet de
comparer LPT sans cette dépendance.
