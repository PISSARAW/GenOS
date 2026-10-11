# ADR 0434 — Conserver la deadline lors d'une réparation Rhizome

## Statut

Accepté.

## Contexte

Après un échec de route muni d'un reçu vérifié, le runtime peut réparer le
chemin puis réessayer. La première exécution et son vérificateur recevaient
la deadline de la mission ; le retry ne la recevait pas. Un provider pouvait
donc être rappelé après l'échéance, notamment avec les variants `resilient`
et `self_healing`.

## Décision

- Le retry reçoit la même deadline que la première tentative.
- L'opération bornée refuse une deadline déjà expirée avant d'appeler le
  provider ou le vérificateur. Le résultat du retry reste non vérifié et la
  seconde exécution n'est pas lancée.

## Limites

Une deadline ne retire pas un effet déjà produit par la première tentative.
Pour une opération déjà en cours, l'arrêt dépend du respect du signal
d'annulation par l'adaptateur externe. Ce contrôle ne prouve ni la réparation
universelle des routes ni une borne de latence de bout en bout.
