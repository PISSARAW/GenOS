# ADR 0570 — Adaptation structurelle intra-inférence et interventions légères

- **Statut** : Accepté
- **Date** : 2026-10-17
- **Domaine** : orchestration, morphogenèse, runtime, preuve
- **Lié à** : ADR 0554, ADR 0555, ADR 0568, ADR 0569

## Contexte

L'adaptation intra-époque changeait l'attention et supprimait certains doublons,
mais toute structure restait différée à la barrière. `ROSTER_REDUCTION` n'avait pas
d'action runtime et la métrique de réduction des communications exigeait un adaptateur
facultatif non raccordé. Les campagnes comparatives et Kubernetes disposaient de
contrats, mais pas de runners complets ni de reçus externes observés.

## Décision

1. Une structure locale d'inférence peut changer pendant une génération pour trois
   types fermés : représentation de raisonnement, ordre des phases et séquence
   d'outils. La proposition doit porter une référence de preuve. Le runtime checkpointe,
   rejette la génération obsolète et reprend avec une révision supérieure.
2. Le kind, la topologie collective, le roster, l'identité et les leases ne sont pas
   mutés en place. Ils restent soumis à la transition authentifiée et restaurable.
3. `ROSTER_REDUCTION` devient une action de relève calibrée. Le plan conserve des IDs
   explicites, préserve les rôles requis, est revérifié après financement et est scellé
   dans le reçu et les missions durables.
4. Le backend produit la métrique de communication mission-scopée depuis les
   observations intra-époque checkpointées et la fait signer par le vérificateur
   sémantique enregistré. Le corpus apparié reste obligatoire pour sélectionner l'action.
5. Un contrat commun signé évalue GenOS, LangGraph, Magentic, AFlow et DyLAN. Un runner
   Kubernetes collecte pods, digests, sondes, redémarrage et logs. Aucun de ces outils
   ne transforme l'absence de reçu externe en succès.

## Conséquences

### Positives

- La structure de raisonnement peut réellement évoluer pendant l'inférence sans
  mutation concurrente d'une topologie collective.
- Les réductions de roster et de communication ont un chemin runtime explicite,
  calibré, admis et vérifiable.
- Les deux manques empiriques disposent d'un protocole exécutable et échouent fermés.

### Négatives

- Une génération abandonnée consomme la latence déjà écoulée.
- `ROSTER_REDUCTION` et `COMMUNICATION_REDUCTION` restent abstentionnistes sans corpus
  apparié qualifié; aucune calibration n'est inventée.
- Sans contexte Kubernetes ni reçus des rivaux, les résultats restent `not_observed`.

## Alternatives

- Muter les workers et leases pendant une génération : rejeté, car la restauration et
  l'autorité deviendraient ambiguës.
- Précharger des gains ou des reçus synthétiques comme résultats externes : rejeté,
  car un fixture de test n'est pas une observation de production.
