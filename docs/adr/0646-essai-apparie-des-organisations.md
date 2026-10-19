# ADR 0646 — Traiter l'organisation comme une hypothèse appariée

- **Statut** : Accepté pour la planification consultative
- **Date** : 2026-10-19
- **Domaine** : orchestration, morphogenèse, budgets, preuves
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0554, ADR 0564, ADR 0566, ADR 0622

## Contexte

Le classement morphogénétique pouvait recommander une topologie à partir de coûts,
de contraintes et d'issues calibrées. Une recommandation ne décrivait cependant pas
l'essai final permettant de comparer l'organisation candidate à l'organisation
courante. Exécuter directement la candidate confondrait sélection heuristique,
transport réussi et effet vérifié.

## Décision

La politique conditionnelle expose désormais un
`organizationHypothesisExperiment`. Une candidate n'y entre que si le classement
la propose sous la même identité. Le contrôle est toujours `NO_CHANGE`.

Le plan formule une hypothèse et son falsificateur, impose deux espaces isolés sur
le même environnement apparié et répartit un budget borné entre contrôle,
candidate et vérification. La mesure d'acceptation est prudente : la borne basse du
gain vérifié doit dépasser la borne haute du coût marginal.

Les rapports des deux bras restent diagnostiques. Le verdict doit provenir d'un
vérificateur indépendant des deux espaces, être lié à l'identité de transition et
porter les preuves appariées déjà définies par le calibrateur. Le compilateur ne
réserve aucun token et n'autorise ni exécution ni promotion. Une admission séparée
reste obligatoire.

L'analogie de **mosaïque somatique appariée** décrit deux tissus locaux soumis au
même milieu sans muter tout l'organisme. Elle ne constitue pas une preuve
biologique ni une garantie statistique.

## Conséquences

### Positives

- L'organisation devient une hypothèse falsifiable plutôt qu'un choix implicite.
- Le contrôle `NO_CHANGE`, le coût marginal et le budget du vérificateur sont
  visibles dans le même contrat.
- Une abstention du classement, une identité divergente ou un budget insuffisant
  produit explicitement `NO_CHANGE`.
- L'autorité de promotion reste hors du planificateur.

### Négatives

- Un essai apparié consomme deux exécutions comparables et une vérification.
- Le budget produit est une proposition, pas une réservation atomique.
- Le runtime standard ne lance pas encore automatiquement les deux bras depuis ce
  contrat et ne collecte pas leurs reçus.

## Alternatives

- **Appliquer directement le meilleur score** : rejeté, car un score heuristique
  n'est pas une preuve d'effet.
- **Comparer seulement aux missions historiques** : rejeté, car le changement de
  tâche, de modèle ou d'environnement peut expliquer l'écart.
- **Laisser la candidate vérifier son propre résultat** : rejeté, car
  l'indépendance du verdict ne serait pas établie.
