# ADR 0379 — Octroi borné de délégation au sous-orchestrateur

- **Statut** : Accepté pour la tranche locale
- **Date** : 2026-10-10
- **Domaine** : Sous-orchestration, contrats workers, jetons modèle
- **Décideurs** : maintenance GenOS
- **Lié à** : [ADR 0353](0353-delegation-worker-bornee-et-admission-runtime.md), [ADR 0376](0376-plafond-projet-sur-ascendance-garage.md)

## Contexte

La création d'un worker accordait systématiquement cinq enfants et une profondeur
de délégation de un à tout contrat `sub_orchestrator`. Un enfant créé sous un
worker pouvait donc recevoir une capacité indépendante de son parent. Le plafond
de jetons délégués était également fixé à 10 000, même si le worker n'avait reçu
que quelques milliers de jetons. Enfin, le contrat renvoyé après la persistance
était reconstruit : son échéance pouvait différer du contrat enregistré.

## Décision

La flotte n'accorde le contrat de délégation de profondeur un qu'à un
`sub_orchestrator` dont le parent persistant est en mode `orchestrator`.
Un parent en mode `worker` produit un contrat sans délégation. Le plafond de
jetons délégués ne dépasse jamais l'allocation modèle du worker ; le contrôle
du contrat persistant rejette toute augmentation ultérieure de ce plafond.
La flotte renvoie le contrat exact qui a été persisté.

L'API de délégation bornée conserve sa profondeur un et son ensemble actuel de
types enfants. Cette tranche ne rend pas la délégation récursive admissible.

## Conséquences

### Positives

- Un sous-orchestrateur enfant ne reçoit aucune autorité de délégation implicite.
- Le budget de ses enfants ne peut pas excéder ses jetons modèle alloués.
- La même échéance et le même contrat sont utilisés par le lanceur et la base.

### Limites

- Les contrats persistés antérieurement avec un plafond supérieur à leur
  allocation sont refusés lorsqu'ils sont réévalués ; une migration explicite
  serait nécessaire pour les réhabiliter.
- La profondeur supérieure à un attend une autorité de chaîne, une allocation
  descendante et des preuves scellées adaptées.

## Alternatives

1. Autoriser immédiatement les enfants `sub_orchestrator` : rejeté, car leur
   contrat pouvait acquérir une autorité automatique sans chaîne vérifiée.
2. Garder le plafond constant de 10 000 : rejeté, car il pouvait excéder les
   jetons alloués au parent.

## Vérification

Les tests de contrats vérifient la borne des jetons et le refus d'un plafond
altéré. Le test de la flotte vérifie qu'un parent worker ne donne aucune
délégation et qu'un orchestrateur conserve un octroi borné.
