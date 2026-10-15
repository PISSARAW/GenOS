# ADR 0555 — Réduction des communications à la relève morphogénétique

- **Statut** : Accepté pour une action consultative et conditionnelle
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, communication, leases, preuve
- **Décideurs** : GenOS
- **Lié à** : ADR 0549, 0552, 0554

## Contexte

Le sélecteur répertorie plusieurs échelles d'adaptation, mais une échelle sans effet
runtime réel ne doit pas être déclarée disponible. Les workers qui utilisent
`continuous_sync` reçoivent un handshake de coordination et les outils
`genos_organization_state`, `genos_worker_inbox` et `genos_worker_publish`. Les
continuités sont préparées après fermeture des workers de l'époque précédente; la
lease et la politique de la mission suivante sont donc un point d'application sûr.

## Décision

Ajouter le candidat stable `communication-reduction:barrier-only-v1`. Il n'est
disponible que si une mesure de redondance scoped au même `missionId` est portée par
un reçu indépendant vérifié, contient au moins dix tentatives et démontre au moins
20 % d'échanges redondants. La tâche doit utiliser actuellement `continuous_sync`,
ne pas déclarer la communication requise et ne pas être une organisation
`cross_functional_pod`. Les trois outils doivent être loués et aucun ne peut faire
partie des outils requis.

Une sélection confirmée est appliquée lors de la construction de la continuation
suivante : la cadence devient `barrier_only` et les seules leases des trois outils
de coordination sont retirées. Le préflight runtime n'active alors ni handshake ni
consigne de coordination continue. Si l'évidence est absente, obsolète ou invalide,
si une dépendance est requise ou si le candidat est `NO_CHANGE`, aucune mutation
n'est appliquée. Une divergence après sélection fait échouer la préparation avant
persistance et dispatch.

Le contrat d'intégration vers le sélecteur est `describeAvailability(mission,
communicationMetric)` du helper `communicationReductionIntervention`. La sortie
porte le `candidateId`, l'échelle, le statut et la raison d'indisponibilité. Une
calibration peut référencer le même `candidateId`; la disponibilité opérationnelle
ne suffit pas à démontrer un gain et la calibration vérifiée reste obligatoire
pour qu'un sélecteur choisisse cette échelle.

## Conséquences

### Positives

- Le contrôle de communication est un effet runtime transmis à la mission suivante,
  vérifié par le même préflight que celui qui impose le handshake continu.
- La réduction est bornée, réversible à l'époque suivante et ne change aucune lease
  pendant l'inférence.
- `NO_CHANGE`, l'absence de mesure et les dépendances de communication bloquent
  l'intervention.

### Négatives

- Le dépôt ne produit pas encore automatiquement un reçu de mesure de redondance
  scoped à une mission. Sans producteur d'évidence conforme, l'action reste
  indisponible en production.
- La mesure atteste une redondance passée; elle ne garantit pas que la réduction
  améliore la qualité future. Cette valeur doit être apprise et confirmée sur des
  issues indépendantes hors échantillon.
- La réduction ne s'applique pas aux organisations `cross_functional_pod` ni aux
  tâches dont les outils de coordination sont requis.

## Alternatives

- Retirer les outils de coordination à chaque époque : rejeté, car l'existence
  d'une lease n'établit ni redondance ni caractère facultatif de la communication.
- Se contenter d'une consigne dans le prompt : rejeté, car le worker pourrait
  toujours appeler les outils loués et l'effet ne serait pas imposé par le runtime.
- Changer les leases pendant une inférence active : rejeté, car cela violerait la
  frontière de quiescence et compliquerait la reprise.
