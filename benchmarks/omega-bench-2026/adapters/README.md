# Contrat des adaptateurs

Chaque adaptateur externe lit uniquement `dataset/public/inputs/<E>.jsonl` et écrit le schéma `schemas/result.schema.json`. L'adaptateur reçoit `scenario_id`, `experiment_id`, `seed` et `input`; il ne reçoit jamais l'oracle. Les permissions, versions, paramètres du modèle, budget et matériel doivent être consignés dans un manifeste d'exécution.

Familles prévues : MLIR (représentation/validation), Temporal (durabilité/replay), LangGraph (graphe/checkpoint), A2A (délégation), MCP (invocation typée), OPA (décision de politique) et JSON Schema + exécuteur Python. Ces noms indiquent les familles à adapter; aucun adaptateur concurrent n'est livré ni qualifié dans cette version.

Avant de comparer une famille, spécifier l'adaptateur fonctionnellement équivalent, sa version exacte et ses capacités applicables. Marquer `N/A` les métriques hors contrat. Ne pas remplacer les fonctionnalités absentes par des échecs artificiels ni accorder à une condition des outils ou budgets différents.
