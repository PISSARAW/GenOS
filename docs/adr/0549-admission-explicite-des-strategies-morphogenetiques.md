# ADR 0549 — Admission explicite des stratégies morphogénétiques

- **Statut** : Implémenté dans la continuation morphogénétique
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, stratégies, autorité, quiescence
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0045, ADR 0543, ADR 0544, ADR 0546c

## Contexte

La politique morphogénétique conditionnelle et le classement des recettes sont
des recommandations. Leurs scores sont heuristiques et non calibrés ; ils ne
prouvent aucun gain de qualité vérifiée, de coût ou de latence. Une recette
recommandée ne devient donc pas une instruction d'exécution par simple
présence dans la politique.

Le service `morphogenesisStrategyAdmission` définit une frontière séparée entre
la proposition et son admission. Le chemin de continuation l'appelle avant de
muter le plan, puis le coordinator répète les gates après financement réel et
avant la persistance/la création de cohorte.

## Décision

Une recette de la voie calibrée ne peut être admise que si le classement l'a
explicitement proposée et qu'elle correspond exactement à la recette sélectionnée
par la politique. Cette voie n'admet que les topologies ou variantes simples
enregistrées et matures (`implemented` ou `stable`), avec validation de type
positive. La voie planner accepte un graphe composite seulement lorsque chaque
feuille, affectation, capability, budget, lease et preuve runtime passe les mêmes
gates.

L'admission exige aussi des preuves concrètes sur le plan destiné à l'exécution
:

- inventaire connu des capacités de topologie, couvrant les capacités requises ;
- affectations non vides de workers, kinds présents dans le catalogue runtime et
  capacités requises fournies par les slots affectés à chaque topology ;
- allocation entière non négative, inférieure ou égale au budget restant ;
- lease d'orchestrator réellement dérivé du plan, autorisant et demandant
  `genos_change_organization` pour une topologie ou `genos_change_strategy`
  pour une variante ;
- observation de quiescence fraîche (30 secondes au plus), avec zéro processus
  actif, worker actif en base ou lease d'exécution actif.

Un échec d'une seule condition refuse l'admission sans modifier le plan. Une
admission réussie retourne un plan lié à la recette, avec topology et variant
recopiés sur ses affectations. Elle n'élargit aucun lease et ne confère pas de
droit de promotion. Les limites de Trinity et les barrières entre exécutions
restent en vigueur.

Une seconde entrée, `admitPlannerTransition`, admet séparément le plan concret
choisi par `planMorphogenesis` à partir des signaux de politique. Son reçu porte
`selectionBasis: planner_heuristic_unvalidated`, `comparativeQuality: unknown`
et `gates.policyProposal: false`. Cette entrée prouve la conformité runtime du
plan, jamais un avantage comparatif.

Les deux entrées enregistrent les alternatives envisagées mais non exécutées
dans `unexecutedAlternatives` (résultat `unobserved`, qualité comparative
`unknown`) et portent `counterfactual.comparativeClaim: prohibited` : une trace
de décision, même bonne, n'établit pas ce qui se serait produit avec une autre
forme pour la même mission. Le reçu de transition scelle ces champs dans son
identité ; les effacer invalide son digest.

Les deux entrées exigent que le plan soit compilé et typé. La voie calibrée
`PROPOSE` ne prend en charge qu'un unique nœud `TOPOLOGY`, qui doit correspondre
exactement à `selectedTopology` et `selectedVariant`. La voie planner permet un
graphe composite seulement si chaque feuille `TOPOLOGY` est enregistrée et
mature, si le graphe passe le vérificateur de types, et si chaque feuille a des
affectations financées dont les capacités couvrent ses exigences. Tout composant
inconnu, non mature, mal typé ou non affecté entraîne un refus explicite.

La première admission est un préflight. Après la négociation des ressources, le
coordinator rebâtit le plan concret à partir des workers effectivement financés,
de leurs tokens, du lease réel et d'une nouvelle preuve de quiescence horodatée.
Il refuse si le préflight manque ou si la seconde admission échoue. Une cohorte
de remplacement ne peut pas être déclarée `not_applicable` pour éviter ces
contrôles, même si sa topologie et ses kinds semblent inchangés.

Le classement actuel abstient les recettes générées non calibrées. Cette
abstention est conservée : aucun seuil heuristique ne doit être rebaptisé preuve
d'amélioration. La voie planner peut tout de même admettre un plan exécutable
après les gates, en gardant sa sélection heuristique explicitement non validée.

## Conséquences

### Positives

- Une recommandation n'est jamais prise pour une autorisation implicite.
- Les recettes admises correspondent au plan concret et restent sous les
  capacités, le budget, le lease et la barrière de quiescence observés.
- L'abstention non calibrée demeure explicite ; l'admission ne fabrique pas de
  preuve comparative.

### Limites

- Les preuves sont locales à la barrière et au plan observés. Le coordinator
  fournit la quiescence (horodatage, processus actifs, workers DB actifs et
  leases actifs), ainsi que le lease dérivé du plan; l'admission ne crée ni
  inventaire, ni lease, ni autorité.
- Une transition planner peut être admise avec une sélection heuristique, mais
  son reçu conserve `planner_heuristic_unvalidated` et une qualité comparative
  `unknown`. Les résultats ne démontrent aucun gain de qualité, coût ou latence.
  Seule une issue appariée `pairEvidence` vérifiée (même tâche, calibration
  hors famille et hors modèle) peut un jour qualifier un gain comparatif ; en
  son absence, toute revendication comparative reste interdite.
- L'admission est une barrière de sûreté, pas une mesure d'efficacité ; le
  benchmark comparatif doit être exécuté séparément avant toute revendication
  de gain.

## Alternatives

- Traiter `PROPOSE` comme une autorisation : écarté, car les scores ne sont pas
  calibrés et la proposition ne vérifie pas les conditions d'exécution réelles.
- Autoriser une recette heuristique après validation seule : écarté, car cela
  transformerait un prior en décision sans preuve ni voie métier atteignable.
- Agréger les leases des workers : écarté, car l'autorité des descendants ne
  peut pas élargir celle de l'orchestrator.
