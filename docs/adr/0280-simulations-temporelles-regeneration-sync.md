# ADR 0280 — Simulations temporelles de régénération et de synchronisation

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, résilience, synchronisation Edge
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0277, ADR 0278

## Contexte

La régénération n'exposait qu'un plan ponctuel, et la synchronisation Edge ne
réconciliait qu'un lot unique. Les tendances temporelles nécessitaient une logique
spécifique chez chaque appelant.

## Décision

Ajouter une simulation bornée à vingt étapes pour les trajectoires de dommage et à
vingt lots pour la synchronisation. Les séries de régénération exigent des ticks
croissants et des preuves sur tout dommage non nul. La synchronisation réutilise les
horloges causales, les événements acceptés, les vérifications de provenance et les
rejets entre lots. Les conflits sont rapportés sans résolution automatique.

## Conséquences

### Positives

- Les tendances temporelles suivent les mêmes invariants que les opérations
  ponctuelles.
- La réplication reste fail-closed et expose les conflits accumulés.

### Limites

- Les deux simulations sont des évaluations en mémoire; le contrôleur persiste leur
  reçu final, pas chaque étape comme événement distinct.
- Aucune transition d'apoptose ou de résolution de conflit n'est exécutée.

## Alternatives

- Ajouter un runner sans borne : rejeté, car une séquence fournie pourrait être
  arbitrairement longue.
