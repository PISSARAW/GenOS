# ADR 0333 - Réconciliation des effets externes avant reprise Temporal

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : missions longues, effets externes, reprise

## Décision

Un identifiant stable précède chaque activité externe. Le ledger marque
`in_flight` avant l'appel. Après confirmation, il marque `confirmed` ; si
l'appel lève une erreur, il marque `uncertain`. Ces deux états non conclus
interdisent de répéter automatiquement l'action. Une réconciliation explicite
établit si l'effet a eu lieu. La façade Temporal lit cet état via une activité.

## Limites

Une panne entre l'effet et le reçu ne peut pas être classée automatiquement.
Le protocole évite le rejeu aveugle, mais un opérateur ou une API de lecture
externe doit résoudre l'incertitude. Le serveur Temporal n'est pas requis par
les tests locaux et aucune migration de la persistance GenOS n'est décidée.
