# Contrat des adaptateurs

Chaque adaptateur externe lit uniquement `dataset/public/inputs/<E>.jsonl` et écrit le schéma `schemas/result.schema.json`. L'adaptateur reçoit `scenario_id`, `experiment_id`, `seed` et `input`; il ne reçoit jamais l'oracle. Les permissions, versions, paramètres du modèle, budget et matériel doivent être consignés dans un manifeste d'exécution.

Familles prévues : MLIR (représentation/validation), Temporal (durabilité/replay), LangGraph (graphe/checkpoint), A2A (délégation), MCP (invocation typée), OPA (décision de politique) et JSON Schema + exécuteur Python. Aucun adaptateur concurrent n'est livré ni qualifié dans cette version.

`gcir_optimized.cjs` est une qualification partielle de C : elle valide chaque enveloppe avec le validateur d'interopérabilité G-CIR, compile/exécute le graphe Omega et applique une fusion des additions adjacentes à E04. Hors E03 (validation G-CIR), les handlers de travail de A sont réutilisés; E04 est le seul cas qui applique la passe de fusion. Ce passage ne mesure donc pas une optimisation générale ou un gain face à A.

Avant de comparer une famille, spécifier l'adaptateur fonctionnellement équivalent, sa version exacte et ses capacités applicables. Marquer `N/A` les métriques hors contrat. Ne pas remplacer les fonctionnalités absentes par des échecs artificiels ni accorder à une condition des outils ou budgets différents.
