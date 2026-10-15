# ADR 0549 — Admission explicite des stratégies morphogénétiques

- **Statut** : Proposé, intégration au chemin d'exécution requise
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
la proposition et son admission. Il est implémenté avec des tests ciblés, mais
doit encore être appelé par le chemin de continuation pour gouverner le plan
effectivement exécuté.

## Décision

Une recette ne peut être admise que si le classement l'a explicitement
proposée et qu'elle correspond exactement à la recette sélectionnée par la
politique. La première version n'admet que les topologies ou variantes simples
enregistrées et matures (`implemented` ou `stable`), avec validation de type
positive. Les compositions imbriquées restent refusées jusqu'à ce que leur
plan concret, leurs leases et leurs allocations soient validables de la même
manière.

L'admission exige aussi des preuves concrètes sur le plan destiné à l'exécution
:

- inventaire connu des capacités de topologie, couvrant les capacités requises ;
- affectations non vides de workers, kinds présents dans l'inventaire et
  capacités requises disponibles pour chaque worker ;
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

Le classement actuel abstient les recettes générées non calibrées. Cette
abstention est conservée : aucun seuil heuristique ne doit être rebaptisé preuve
d'amélioration. Tant qu'une voie de proposition atteignable n'est pas branchée,
le service d'admission ne rend pas l'orchestrator plus adaptatif à lui seul.

## Conséquences

### Positives

- Une recommandation n'est jamais prise pour une autorisation implicite.
- Les recettes admises correspondent au plan concret et restent sous les
  capacités, le budget, le lease et la barrière de quiescence observés.
- L'abstention non calibrée demeure explicite ; l'admission ne fabrique pas de
  preuve comparative.

### Limites

- Le service n'est pas encore appelé par `missionMorphogenesisContinuation` ni
  par le coordinator. L'intégration doit faire l'admission après matérialisation
  du plan et avant la création/dispatch des workers.
- Les recettes `NESTED`, les heuristiques non calibrées et l'absence d'inventaire
  ou de preuve runtime produisent un refus.
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
