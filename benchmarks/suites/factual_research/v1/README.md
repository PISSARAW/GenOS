# Recherche factuelle — pilote version 1

Quatre questions contrôlées en français sur des règles HTTP stables des RFC
9110 et 9111. Les fiches locales reformulent brièvement les faits des sections
référencées; les URL officielles et la version des RFC sont épinglées dans le
corpus. Le run ne demande aucun réseau après sa préparation, ni Docker.
La version 1.1 du corpus précise que `no-cache` règle la réutilisation sans
interdire le stockage. Chaque question ne reçoit que la fiche RFC indiquée par
son `sourceIds`, dans les deux modes d'exécution.

## Préparer et valider les sources

```powershell
node benchmarks/suites/factual_research/v1/prepare-sources.cjs
node benchmarks/suites/factual_research/v1/oracle/smoke.cjs
```

Le score exige les valeurs exactes et des citations dont le triplet
`sourceId`/`section`/`factId` se résout dans les fiches hachées. Les poids sont
50 % exactitude, 30 % rappel des citations et 20 % précision des citations.

## Run modèle seul

```powershell
node benchmarks/suites/factual_research/v1/run-alone.cjs qwen2.5-coder:7b
```

Le runner interroge Ollama local et conserve la réponse, l’usage, le digest du
modèle, les sources et le score sous `results/`. Le corrigé n’est pas inclus dans
le prompt.

## Limites du pilote

Un pilote GenOS sur une question peut être lancé sans Docker avec :

```powershell
node benchmarks/suites/factual_research/v1/run-genos-pilot.cjs qwen2.5-coder:7b http-safe-methods-fr-01
```

Le runner fournit les fiches figées dans le brief, garde la sortie brute et un
reçu séparé, puis applique l’oracle indépendant. Il marque toujours ce pilote
`comparisonEligible: false` : une réussite ponctuelle ne constitue pas une paire
confirmatoire. Un audit GenOS incomplet ou une prédiction absente donne un code
de sortie non nul.
Le reçu relève aussi les modèles réellement observés dans les preuves et refuse
un run dont l'identité diffère du modèle demandé.

Ce pilote mesure l’extraction factuelle à partir de quatre fiches ciblées. Il ne
teste pas la recherche libre sur le Web. Il ne devient pas une comparaison
`alone`/`genos` avant qu’un run GenOS comparable et une adjudication à l’aveugle
soient disponibles.
