# ADR 0554 — Calibrer le sélecteur morphogénétique sur des issues vérifiées

- **Statut** : Accepté pour la calibration consultative
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, calibration, preuve
- **Décideurs** : GenOS
- **Lié à** : ADR 0536, 0544, 0549

## Contexte

Le sélecteur attribuait aux recettes des scores heuristiques et un statut
`uncalibrated`. Une déclaration de calibration fournie par l'appelant ne peut pas
transformer ces scores en estimations fiables. Le dépôt ne contient pas encore de
campagne morphogénétique vérifiée suffisante pour apprendre une préférence.

## Décision

Ajouter un calibrateur consultatif alimenté uniquement par des issues appariées,
liées à un reçu indépendant vérifié et à une empreinte de résultat. Chaque ligne
identifie une échelle d'intervention, une famille de tâches, un modèle, une partition
train/validation et les estimations de gain/coût émises avant l'exécution. Le coût et
le gain sont normalisés dans `[0, 1]`.

Une échelle n'est qualifiée qu'avec au moins 30 observations d'entraînement et 10 de
validation, sans chevauchement des familles ni des modèles. Les erreurs absolues
tenues à l'écart doivent battre les prédictions neutres (gain nul et coût nul). Le
sélecteur compare ensuite la borne basse du gain à la borne haute du coût marginal.
À défaut d'échantillon, de reçu, de séparation ou de marge probante, il choisit
`NO_CHANGE`.

La réallocation est candidate uniquement pour une empreinte stable du plan financé :
budget, allocations de groupe, preuves et actions autorisées. Chaque allocation
financée doit porter un `proofDigest` et un reçu indépendant signé dont le digest et
la référence correspondent exactement. Les seules `evidenceRefs` déclarées ne
suffisent pas. Le résultat calibré doit porter le même `candidateId`; tout plan
différent exige ses propres issues vérifiées. Son application exige aussi l'admission
de stratégie et le reçu de transition correspondant. Le reçu d'effet enregistre alors
les tokens réellement affectés aux workers. `NO_CHANGE` conserve la répartition
standard.

Le producteur backend de reçus indépendants pour les besoins de ressources et le
stockage backend par défaut des issues vérifiées n'existent pas encore. Sans reçus
admissibles, adaptateur `loadVerifiedOutcomes`, calibration exacte ou admission, la
réallocation reste indisponible et le sélecteur s'abstient. Aucun corpus ni résultat
de campagne n'est présumé. La réduction des communications suit son propre candidat
runtime et ne peut pas rendre une allocation admissible.

## Conséquences

- Le résultat expose les tailles train/validation, la séparation famille/modèle,
  les erreurs de validation, les estimations et leur incertitude.
- Les échelles non qualifiées restent visibles comme `unavailable`.
- L'apprentissage persistant, la récolte automatique des reçus et la preuve d'un
  avantage empirique de la politique restent à réaliser.

## Alternatives

- Accepter `calibrationStatus: calibrated` fourni par un appelant : rejeté, car cette
  déclaration n'est pas une preuve d'issues vérifiées ni de généralisation.
- Choisir l'estimation moyenne sans tenir compte de l'incertitude ni du coût : rejeté,
  car une moyenne fragile pourrait provoquer un remplacement inutile.
