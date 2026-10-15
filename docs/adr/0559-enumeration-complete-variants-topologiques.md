# ADR 0559 — Énumérer toutes les variantes topologiques

- **Statut** : accepté ; génération exhaustive et classement complet implémentés
- **Date** : 2026-10-16
- **Domaine** : orchestration, morphogenèse, sélection topologique
- **Remplace** : ADR 0536 pour le plafond appliqué aux candidats atomiques

## Contexte

Le générateur appliquait un plafond global de 10 candidats, configurable jusqu’à 32,
et un plafond de quatre exclusions faute de capacités. Le classement tronquait aussi
son entrée à 100 recettes. Ces limites pouvaient retirer des variantes inscrites au
registre avant qu’elles soient comparées. Un budget de recherche sur les compositions
ne doit pas masquer les variantes atomiques disponibles.

## Décision

À chaque compilation de portefeuille, énumérer toutes les topologies et toutes leurs
variantes inscrites, sans plafond de candidats atomiques. Inclure aussi les variantes
qui échouent aux validations ou aux préconditions de capacité et marquer clairement
leur rejet. Faire parvenir l’ensemble au classement ; son résumé peut rester limité
aux meilleurs résultats, mais la décision doit considérer tous les candidats reçus.

Conserver `NO_CHANGE` dans le portefeuille. Le classement exhaustif ne vaut pas
autorisation d’exécution : maturité, capacités, budget, calibration exacte, preuve et
admission restent des portes indépendantes. Les variantes conceptuelles, de maturité
inconnue ou autrement non admissibles demeurent visibles, mais ne sont pas proposées
à l’exécution.

Les compositions `NEST` restent distinctes des variantes atomiques et conservent un
plafond de 128 paires examinées. Le reçu de génération expose leur troncature. Cette
décision n’ajoute pas l’exécution de chaque variante comme essai parallèle : une
mission peut appliquer une transition admise à la barrière, et les résultats doivent
être calibrés sur l’identifiant exact de la recette.

## Conséquences et vérification

La génération est exhaustive pour les variantes atomiques visibles au registre, y
compris celles qui sont rejetées ; les compositions restent bornées. Les tests
vérifient que toutes les variantes du registre sont retournées, que les préconditions
manquantes produisent un rejet explicite et que le classement prend en compte plus de
100 candidats. Cette couverture ne démontre pas que toutes les variantes ont été
exécutées ni qu’une variante surpasse une autre.
