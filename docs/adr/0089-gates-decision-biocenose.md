# 0089 — Gates de promotion au jugement Biocénose

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Biocénose, épistémologie, gouvernance, audit
- **Décideurs** : GenOS
- **Lié à** : [ADR 0021](0021-promotion-epistemique-des-decisions.md), [topologie Biocénose](../02-orchestration/topologies/biocenose.md)

## Contexte

Les évaluateurs de vérification et de veto minoritaire existaient, mais le service de
finalisation pouvait être appelé sans leurs résultats. Une réponse marquée `VERIFIED`
par son producteur ne suffit pas à établir sa provenance. Par ailleurs, la table des
membres est append-only : muter son statut pour appliquer une quarantaine contournerait
la règle d'audit.

## Décision

- La finalisation applique elle-même les gates, quel que soit son appelant.
- Toute claim factuelle persistée qui soutient une décision doit avoir un reçu `VERIFIED`
  et accepté par le validateur de confiance fourni. En son absence, le jugement est
  rétrogradé à `REVIEW_REQUIRED`.
- Un dissent critique dont la preuve n'est pas approuvée par ce validateur maintient le
  jugement en `ESCALATED` ; une preuve minoritaire fatale approuvée retourne
  `PROMOTION_BLOCKED`.
- La constitution active est revalidée et son identité, sa communauté et son hash sont
  vérifiés à la finalisation.
- Quarantaine et réintégration sont des événements append-only. L'état effectif des
  membres est dérivé de ces événements et exclut les membres quarantinés des participants,
  commits, claims et routeurs.

## Conséquences

### Positives

- L'omission du runtime ne permet plus de contourner le veto ou les exigences de preuve.
- La quarantaine reste traçable et compatible avec l'immutabilité du registre des membres.
- Un membre peut être réintégré sans réécriture de son historique.

### Négatives

- Les intégrations doivent fournir un validateur de confiance pour produire un jugement
  factuel promouvable.
- Les gates vérifient l'intégrité du flux Biocénose ; elles ne remplacent pas une porte
  de promotion générale dans les autres topologies.

## Alternatives

- Faire confiance au seul champ `status: VERIFIED` : rejeté, car le producteur du reçu
  pourrait se déclarer lui-même fiable.
- Mettre à jour `biocenose_members.status` : rejeté, car cette table est append-only.
- Appliquer les contrôles uniquement dans `runBiocenoseRound` : rejeté, car un appelant
  direct à la finalisation pourrait les omettre.
