# ADR 0546 — Réévaluer méthode, preuve et ressources aux barrières morphogénétiques

- **Statut** : accepté pour l’intégration des décisions de prochaine époque
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, ressources, preuve
- **Lié à** : ADR 0430, 0536, 0538, 0541, 0543, 0544

## Contexte

Une boucle répétée ne suffit pas si elle ne réexamine que les scores des mêmes
workers. Elle doit pouvoir changer l’objet de raisonnement, tester la stratégie et
rediriger l’attention et le budget entre groupes. Ces décisions doivent toutefois
respecter les preuves, le budget réservé et les frontières d’autorité déjà présentes.

## Décision

À chaque barrière, le planificateur compile une politique conditionnelle depuis les
signaux de l’époque : représentation du problème, portefeuille typé de topologies et
variants, méthodes/workers observables, obligations probatoires, budget et arrêts.
Cette politique n’autorise pas par elle-même une recette non calibrée.

Lorsque des workers fournissent une stratégie explicite, un falsificateur et des
références, le service de critique regroupe les déclarations par provenance. Plusieurs
rapports de même source ou lignée ne valent qu’un support; un défi falsifiable peut
être financé dans la tranche de l’époque et envoyé sur une branche concurrente. Les
rapports de défi restent diagnostiques et ne ferment pas la mission.

Les demandes mesurables des groupes sont classées par gain marginal pondéré par
confiance et coût. Une demande sans référence de preuve est exclue. Le contrôleur
redirige le budget de continuation vers les groupes financés; un groupe sans tranche
minimale est mis en sommeil. Les transferts de workers, créations de workers et
changements de gouvernance demeurent des propositions tant que les gardes d’autorité
et d’admission n’ont pas été appelés.

L’application se produit à la barrière, une fois la flotte précédente quiescente.
Les workers en cours d’inférence ne sont jamais mutés. Trinity garde son chemin
scellé distinct.

## Conséquences et limites

- La représentation, le défi et l’arbitrage de budget sont recalculés par époque et
  leurs décisions sont incluses dans la trace de transition.
- La boucle générale réutilise encore les identités des survivants; le recrutement
  libre d’une nouvelle cohorte est une étape d’intégration séparée.
- L’état du contrôleur est toujours en mémoire; la reprise après redémarrage reste
  requise pour prétendre à une orchestration récurrente durable.
- Les estimations worker de valeur et de confiance demeurent déclaratives. Elles
  orientent seulement une tranche bornée et ne valent ni preuve ni autorité.
- Aucun gain comparatif n’est revendiqué sans benchmark non stationnaire et oracle
  indépendant.

## Vérification

Les tests couvrent la politique conditionnelle/réévaluable, le rejet d’un consensus
corrélé, l’exigence d’une observation indépendante vérifiée, les budgets de défi,
l’arbitrage marginal, le sommeil/réveil avec preuve et l’exécution de plusieurs
époques. Les scénarios de recrutement d’une nouvelle cohorte et de reprise du
contrôleur sont traités par les tranches suivantes.
