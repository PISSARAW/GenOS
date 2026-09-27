# ADR 0144 — WorldState conditionnel

Le WorldState porte l’état avant/après, ses références de preuve et un statut
de support. La comparaison expose delta, incertitude et OOD; un état OOD ne
peut pas produire une décision prête. Les choix concurrents sont classés par
utilité attendue corrigée de l’incertitude.
