# Analyse de dépôts — pilote version 1

Mini-suite française hors ligne, sans Docker. Les quatre questions portent sur
des faits vérifiables dans un snapshot Git GenOS figé. Les candidats ne reçoivent
que `public/`; l’oracle reste dans `oracle/` et ne doit jamais entrer dans le
contexte du modèle.

## Préparation et validation

Depuis la racine du dépôt :

```powershell
node benchmarks/suites/repository_analysis/v1/prepare-snapshot.cjs
node benchmarks/suites/repository_analysis/v1/oracle/smoke.cjs
node benchmarks/suites/repository_analysis/v1/run-alone.cjs qwen2.5-coder:7b
```

Le préparateur copie les fichiers demandés depuis le commit donné en argument
ou `HEAD`, puis crée `public/snapshot.lock.json` avec le commit, les blobs Git
et les SHA-256. Il n’accède pas au réseau.

Le runner `alone` appelle Ollama localement, n’expose que les fichiers retenus
pour chaque question et conserve les réponses, les métriques d’usage et le
digest du modèle dans `results/`. Le serveur Ollama doit déjà être disponible.

## Format des prédictions

Fournir un fichier JSONL avec une réponse par item :

```json
{"taskId":"runtime-entrypoints-fr-01","claims":{"backendCommand":"..."},"citations":[{"path":"README.md","startLine":108,"endLine":110,"quote":"..."}]}
```

Le score exact exige toutes les affirmations attendues et chaque ancre de preuve
citée depuis les lignes épinglées. Score par item : 50 % exactitude des faits,
30 % rappel des ancres de preuve et 20 % précision des citations. Le smoke test
vérifie le snapshot, un corrigé parfait et la baisse de score après altération.

## Limites

Le run exploratoire `alone` de Qwen2.5 Coder 7B obtient 0,28125 sur quatre
items; il échoue notamment à fournir des citations valides. Le premier bras
GenOS n’atteint pas l’inférence : son portfolio de stratégies n’a aucune phase
d’autonomie exécutable. Ces nombres ne sont pas une comparaison.

Les items couvrent l’architecture et le contrat documenté de GenOS, sans notes
humaines aveugles. Une campagne `alone`/`genos` devra cacher `oracle/`, randomiser
l’ordre des bras, épingler modèle et budget, corriger la porte d’exécution,
conserver les deux sorties et faire noter les citations par deux évaluateurs
indépendants avant qualification.
