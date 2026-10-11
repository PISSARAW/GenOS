# ADR 0396 — Frontière corporelle et provenance du soi agentique

- **Statut** : accepté, portée Node
- **Date** : 2026-10-10
- **Domaine** : corps de l'orchestrator, action motrice, CoreSelf
- **Décideurs** : équipe GenOS
- **Lié à** : [corps de l'orchestrator](../02-orchestration/corps-orchestrator.md), [théorie du soi](../02-orchestration/theorie-du-soi-orchestrator.md)

## Contexte

Le corps était construit avant le budget runtime et le bail final. Un budget
absent était converti en zéro avec une confiance de un. Les percepts nommaient
leur modalité sans séparer le propriétaire du capteur du domaine observé.
L'attribution par copie d'efférence ne contrôlait pas l'identité de l'événement.
Le score `agencyCalibration` pouvait valoir un après une attribution externe.

## Décision

Le bootstrap calcule et confine le bail et le budget runtime avant de construire
le corps. Le percept budgétaire distingue l'allocation connue de l'état inconnu ;
l'inconnu coupe le dispatch sans se présenter comme une mesure de zéro.
Chaque percept expose le propriétaire de son capteur et son domaine observé.
Les effecteurs réellement loués sont distincts des contrats d'actionneurs
déclaratifs.

L'adaptateur moteur exige l'identité du propriétaire et une autorité positive
avant d'appeler l'effecteur ; un refus conserve un reçu sans effet. La copie
d'efférence exige `event.agentId` égal à l'agent dont le registre est consulté.
CoreSelf publie séparément le taux d'attribution au soi, l'erreur de prédiction
et leur score pondéré. Les claims sans producteur lié explicitement à l'agent
restent hors de `selfOriginRatio` ; aucune identité n'est inférée d'un texte.

## Conséquences

### Positives

- Le budget effectif et le bail final sont visibles avant la première action.
- Une observation externe ne peut plus consommer la copie d'efférence d'un
  autre agent par seul identifiant d'action.
- Les claims historiques sans producteur attesté n'augmentent aucun ratio
  individuel.

### Négatives

- Les anciens événements sans `event.agentId` ne correspondent plus à une
  copie d'efférence et restent des observations externes ou incertaines.
- `selfOriginRatio` peut être absent tant que les producteurs de claims ne
  transmettent pas d'identité d'agent vérifiée.
- L'adaptateur moteur Node reste un contrat interne tant qu'aucun environnement
  de production ne l'enregistre comme chemin d'action.

## Alternatives

- Déduire le propriétaire du `payload` ou du texte du claim : rejeté, car ces
  champs décrivent parfois la cible de l'action et ne prouvent pas l'émetteur.
- Conserver zéro pour un budget inconnu : rejeté, car cela confond absence de
  mesure et épuisement réel, même si les deux arrêtent le dispatch.
