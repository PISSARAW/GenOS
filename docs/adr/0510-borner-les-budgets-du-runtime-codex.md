# ADR 0510 — Borner les budgets du runtime Codex

- **Statut** : Accepté et implémenté pour la garde d'événements Codex.
- **Date** : 2026-10-15
- **Domaine** : Budgets du runtime et arrêt fail-closed.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0509, échéance de lease MCP par mission.

## Contexte

Le planificateur normalise les budgets de tokens, coût, latence et événements.
Le runtime relit toutefois ces valeurs depuis le message de mission. Sa garde
convertissait les dimensions absentes, nulles ou invalides en `Infinity`, ce qui
désactivait le contrôle pour cette dimension. Un budget de tokens à zéro, utilisé
par les workers déterministes, désactivait aussi le contrôle des tokens.

## Décision

Les dimensions absentes utilisent les mêmes plafonds finis par défaut que le
normaliseur de mission : 100 000 tokens, 1 USD, 60 000 ms et 100 événements.
Une valeur explicite finie et positive ou nulle est conservée. Une valeur
explicite invalide, négative ou non finie devient un plafond nul, ce qui arrête
le runtime dès qu'une consommation est observée.

## Conséquences

### Positives

- Aucune dimension de budget ne peut devenir infinie dans cette garde.
- L'absence de valeur conserve les plafonds historiques du normaliseur.
- Les workers déterministes gardent un budget de tokens nul.
- Le test couvre les valeurs absentes, nulles, invalides et infinies.

### Négatives

- Une valeur corrompue explicite entraîne un arrêt immédiat dès consommation; le
  diagnostic apparaît comme épuisement de budget plutôt que comme erreur de
  décodage du message.

## Alternatives

- Conserver `Infinity` pour les dimensions absentes ou invalides : rejeté, car
  une erreur de sérialisation désactive silencieusement la limite.
- Remplacer un budget nul par le plafond par défaut : rejeté, car zéro est le
  contrat explicite des workers déterministes.
