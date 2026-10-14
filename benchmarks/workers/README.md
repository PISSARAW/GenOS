# Campagne comparative des workers

Le jeu contient 24 cas couvrant les 19 types de workers. Les 24 cas disposent
d'un oracle : LPT, procédure bornée, `subset_sum`, vérification et falsification
de reçu, vérification de code, arithmétique exacte et Lean, mesure expérimentale,
synthèse de désaccord, surveillance numérique, reconstruction de liens déclarés,
recherche littérale, transfert enseigné, adaptation LPT, niche et capacité hôte,
combinaison créative, revue éducative synthétique, restauration de checkpoint,
préparation de passation, délégation multi-enfant et correction de code bornée.
`bounded-code` lance une mission worker Ollama réelle; son oracle relit le reçu
biologique, l'acceptation du quorum natif, les tests exécutés et les deux
stratégies qui couvrent 264 cas chacune. Sans `GENOS_LOCAL_MODEL` pointant vers
un modèle Ollama, cette case reste `unmeasured`. Une référence fournie par un
adaptateur ne suffit pas à certifier une capacité.

Les cas `scout-source`, `forensic-chain`, `teaching-transfer`, `subset-sum` et
`lpt-schedule` contrôlent
leurs invariants dans un module d'oracle séparé des exécuteurs. Les huit cas
structurés ajoutés emploient aussi des parcours indépendants dans
`independent-structured-oracles.cjs`; `bounded-code` dispose de son oracle
`bounded-code-oracle.cjs`. Le code borné est contrôlé sur 264 entrées,
l'arithmétique exacte par un calcul indépendant et les deux méthodes formelles
par recompilation Lean. La délégation vérifie indépendamment les contrats, runs,
artefacts, références et reçu parent des deux enfants.

Le rapport de qualification du 2026-10-12 contient 24/24 cas passés et leurs
scores ont été recalculés depuis le rapport, avec Lean 4.34.0 configuré. Cette
mesure ne démontre pas la parité avec un rival.

Exécution locale actuelle :

```powershell
$env:GENOS_LEAN_EXECUTABLE = 'C:\Users\Shadow\.elan\bin\lean.exe'
$env:GENOS_BENCHMARK_LEAN_VERSION = (& $env:GENOS_LEAN_EXECUTABLE --version).Trim()
$env:GENOS_LOCAL_MODEL = 'ollama://qwen2.5-coder:32b'
node benchmarks/workers/campaign.cjs benchmarks/workers/genos-adapter.cjs genos-native "$env:TEMP/genos-workers.json"
```

Pour inclure Lean, placer l'exécutable `lean` dans le `PATH` ou définir
`GENOS_LEAN_EXECUTABLE`, puis fournir la sortie exacte de `lean --version`
dans `GENOS_BENCHMARK_LEAN_VERSION`. Le
vérificateur du benchmark relance Lean indépendamment de l'adaptateur.
La campagne mesure `bounded-code` si un modèle Ollama est défini; elle
exige une mission terminée avec son reçu biologique et son quorum persistant.
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
locale mesure les cas non formels disponibles, et les deux cas formels avec Lean configuré ;
avec Ollama et Lean configurés, les 24 cas sont mesurables. Elle ne démontre aucune parité
avec un rival. Les sorties JSON sont des artefacts temporaires à conserver
hors du dépôt.

Sur le digest courant du 2026-10-04, deux cas procéduraux sont communs
avec AutoGen local : GenOS passe les deux, AutoGen aucun dans ce tirage.
Les 18 autres cas de cet adaptateur restent non mesurés. Les essais
précédents ont varié ; ces deux résultats ne fondent aucun classement général.

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
