# Référence expérimentale GenOS

Ce répertoire définit le protocole commun pour comparer un modèle seul à ce même
modèle assisté par GenOS. Les anciens benchmarks restent utilisables pour leurs
questions propres, mais leurs résultats ne constituent pas une comparaison
`alone` contre `genos` tant que les contrôles de cette référence ne sont pas
respectés.

## État initial

La référence `baselines/genos-v3.json` épingle la révision candidate et son état
de propreté. Elle reste `blocked` tant que la révision n'est pas un checkout
propre et qu'aucune paire de runs confirmatoires n'a été produite. Aucun score
simulé ou résultat antérieur non comparable n'est présenté comme baseline.

## Protocole apparié

Chaque tâche est exécutée dans les deux modes avec le même modèle et la même
version, le même harness, les mêmes paramètres, le même état initial, les mêmes
outils autorisés et le même budget. Seul `mode` varie (`alone` ou `genos`).
Randomiser l'ordre au sein de chaque paire et conserver les deux enregistrements,
y compris en cas d'échec. Les résultats bruts et reçus de vérification sont
conservés avec les métriques; une mesure absente reste `null`, jamais zéro.

Un run respecte `schemas/benchmark-run.schema.json`. Une paire confirmatoire
nécessite au moins trois répétitions appariées par tâche; les tâches et suites
restent exclues des comparaisons tant qu'elles n'ont pas d'oracle approprié à
leur résultat.

## Suites

Les manifestes sous `suites/` réservent les familles de la feuille de route et
pointent vers les actifs existants. `planned` signifie qu'aucun protocole
confirmatoire commun n'est encore prêt; il ne signifie pas qu'un résultat est nul.

Le pilote local d'analyse de dépôts se trouve dans
[`suites/repository_analysis/v1/`](suites/repository_analysis/v1/). Il prépare
un snapshot GenOS immuable, quatre questions françaises et un oracle vérifiant
les faits structurés et les citations. Il s'exécute sans Docker. Son smoke test
qualifie uniquement le snapshot et l'oracle; aucune comparaison `alone`/`genos`
ni évaluation humaine aveugle n'est encore produite.

Le [pilote Inspect AI](inspect-ai/README.md) expose quatre tâches à oracle
déterministe et trois bras (`model-alone`, topologie imposée, morphogenèse) à
un évaluateur externe. Il vérifie l'identité du modèle, les budgets déclarés et
les scores indépendants, mais attend un runner réel pour produire une comparaison.
