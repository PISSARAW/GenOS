# ADR 0481 — Autorité et reçu pour les overrides de promotion en production

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-14
- **Domaine** : Releases, autorité de production et audit des décisions.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0480, preuve avant promotion ; ADR 0478, liaison des opérations aux reçus durables.

## Contexte

La route de promotion exigeait `workspace:write`. Pour contourner un rollout,
elle acceptait `force: true` et toute chaîne non vide comme `overrideReason`.
L'override ne conservait ni l'identité de son auteur ni la raison dans un
registre durable. Un opérateur pouvait ainsi remplacer la preuve de rollout
par une affirmation contrôlée par le même appelant.

## Décision

Le chemin normal de promotion reste soumis à `workspace:write` et à un rollout
promu pour la production. Le chemin `force: true` exige en plus l'autorité
distincte `release:force_promote`, que les politiques IAM peuvent accorder
explicitement et que le rôle administrateur possède par `all`.

Un override n'est accepté que vers `production`, avec une raison de 12 à 2000
caractères non blancs et une identité authentifiée. La transaction qui active
la release ajoute un reçu dans `release_force_promotion_receipts`. Les reçus
sont append-only et contiennent le scope tenant, l'acteur, la raison et l'heure.
Si l'écriture du reçu échoue, la mutation de la release est annulée.

## Conséquences

### Positives

- Un droit général d'écriture ne suffit plus pour contourner le rollout.
- L'override laisse une preuve durable liée au scope et à l'acteur.
- L'état actif et le reçu d'override sont atomiques.

### Négatives

- Les opérateurs qui avaient utilisé `force` doivent recevoir explicitement la
  permission IAM `release:force_promote`.
- Les raisons courtes ou vagues de moins de 12 caractères sont refusées.

## Alternatives

- Garder `workspace:write` et journaliser uniquement dans la télémétrie : rejeté,
  car l'événement de télémétrie n'est pas atomique avec la mutation de release.
- Autoriser tout override administrateur sans reçu : rejeté, car l'identité et
  le motif ne seraient pas conservés avec l'état promu.

## Vérification

`node backend/tests/test_release_force_promotion_permission.js` vérifie le refus
d'un opérateur standard et l'autorisation administrateur. `node
backend/tests/test_release_operations.js` vérifie le rollout normal ainsi que
l'écriture transactionnelle du reçu pour un override de production.
