# Protocole de benchmark A-Team

`benchmarks/ateam/benchmarkRunner.cjs` exécute un même ensemble de scénarios sur cinq
bras : spécialiste solo, équipe parallèle sans graphe, A-Team sans handoffs, A-Team sans
réparation, et A-Team complète. L'ordre des bras varie de façon déterministe par scénario
et répétition. Les comparaisons sont appariées par scénario et répétition.

## Adaptateur d'exécution

`runBenchmark({ scenarios, repetitions, executeCase })` délègue chaque essai à un
adaptateur réel. Celui-ci reçoit le scénario, la définition du bras, la répétition et une
graine stable. Il retourne `succeeded`, `evidenceValid`, `elapsedMs` et `tokenCost`.
Une réussite n'est comptée que si le travail a réussi et que sa preuve est valide. Une
preuve invalide est rapportée séparément ; elle ne peut pas améliorer le taux de succès.

Le rapport contient les mesures par bras et les deltas appariés face au bras solo. Le
harnais ne fabrique ni résultats d'agents ni preuves et n'exécute aucun fournisseur lui-même.
Les résultats ne sont scientifiquement interprétables que si l'adaptateur lance les vrais
workers, applique les politiques annoncées, utilise les mêmes limites de budget et critères
sur chaque bras, et conserve les reçus bruts avec le rapport.

## Limites actuelles

Le dépôt fournit le protocole et son test contractuel, pas encore un adaptateur de campagne
connecté aux workers A-Team. Le test du harnais vérifie l'appariement et le gate de preuve ;
il ne constitue pas un résultat de performance. Toute comparaison publiée doit inclure
les données brutes, le nombre de scénarios/répétitions et les versions des modèles.
