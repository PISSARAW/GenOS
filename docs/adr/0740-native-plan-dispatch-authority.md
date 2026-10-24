# ADR 0740 — Autorité de dispatch des plans de mission natifs

- **Statut** : Accepté
- **Date** : 2026-10-24
- **Domaine** : Orchestration, dispatch, morphogenèse, preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0051, ADR 0064a, ADR 0731

## Contexte

Un plan de mission natif contient des objectifs validés, des contrats de méthode
versionnés, des WorkerKinds compatibles et une empreinte qui scelle la liste des
assignations. Quand aucun utilisateur ne demande de topologie, le plan morphogénétique
choisit actuellement une topologie de repli. Cette topologie peut remplacer la liste
d'assignations native ou exiger une équipe dédiée incompatible avec les objectifs natifs.

Le plan natif et la morphogenèse expriment alors deux autorités concurrentes sur le
dispatch. Le refus du conflit entre un plan natif et une équipe A-Team ou Trinity est
déjà une protection nécessaire. En revanche, appliquer une topologie de repli implicite
à un plan natif scellé ne représente pas une demande de l'utilisateur et peut rendre
impossible une mission pourtant conforme à ses contrats, à son budget et au fanout.

## Décision

Quand la requête contient au moins un objectif natif et ne demande explicitement aucune
topologie, le plan natif scellé gouverne le dispatch. Le runtime ne sème pas de sélection
morphogénétique de repli, ne compose pas une A-Team ou une Trinity automatique et ne
remplace pas les assignations du plan natif.

Une topologie explicitement demandée par l'utilisateur conserve l'autorité. Dans ce cas,
les gates existantes s'appliquent : readiness, budget et fanout restent obligatoires, et
un conflit entre une équipe dédiée active et des objectifs natifs reste refusé. Le plan
natif garde son empreinte, ses contrats de méthode et ses limites de délégation dans tous
les cas où il est retenu.

Cette décision ne modifie ni les critères de succès, ni le verdict canonique, ni les
gates de couverture, de preuves, d'homéostasie ou de promotion.

## Conséquences

### Positives

- Un plan natif explicite et scellé ne peut plus être remplacé par une topologie de repli
  non demandée.
- Les missions natives d'un seul worker n'ont pas à satisfaire artificiellement la
  readiness d'une topologie A-Team.
- Les demandes explicites A-Team et Trinity restent fail-closed et observables.

### Négatives

- Les missions natives sans topologie explicite ne produisent pas de plan de morphogenèse,
  de composition de topologie ni de snapshot associé à ce plan.
- Les utilisateurs qui veulent une composition topologique doivent la demander
  explicitement et satisfaire les gates correspondantes.

## Alternatives

- Composer systématiquement la topologie de repli : rejeté, car cela peut remplacer le
  plan natif scellé ou bloquer une mission sans que l'utilisateur ait demandé cette
  topologie.
- Réduire readiness, budget ou fanout pour faire tenir l'équipe dédiée : rejeté, car cela
  affaiblirait les limites de sécurité au lieu de respecter l'autorité du plan natif.
- Permettre à un plan natif de remplacer une topologie A-Team ou Trinity explicitement
  demandée : rejeté, car les deux contrats revendiquent alors l'autorité du dispatch.
