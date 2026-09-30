# Réponse neuro-gliale corrélée aux événements de mission

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Runtime, neurobiologie, glie, quorum, preuve
- **Décideurs** : GenOS
- **Lié à** : ADR 0191

## Contexte

Les sous-systèmes neural, glial et quorum existaient sans être déclenchés par les
événements effectivement émis pendant une mission. Leur seule présence ne prouvait
pas leur intégration.

## Décision

`GenosEcosystem::record_event` déclenche une réponse versionnée uniquement quand une
mission est corrélée et que l'événement appartient à la liste des reçus d'exécution,
actions incarnées, actions instinctives ou reproduction. La réponse applique un
signal excitateur ou inhibiteur, fait évoluer le quorum à partir des cellules actives,
exécute le pipeline glial et conserve les mesures dans un événement dédié.

## Conséquences

### Positives

- Le chemin relie les événements du runtime aux systèmes neurobiologique, glial et quorum.
- Le reçu cite l'événement source et la mission, et rapporte une latence mesurée.

### Négatives

- L'event store est en mémoire et le pipeline glial utilise un état environnemental
  événementiel simplifié ; cela ne constitue pas une validation E2E durable.
- Le quorum local n'est pas un consensus distribué et n'authentifie pas les participants.

## Alternatives

- Garder les modules comme primitives isolées : rejeté, car cela ne fournit aucun chemin runtime.
- Déclencher la réponse pour tout événement : rejeté, car les événements génériques ne
  sont pas une preuve de mission.
