# ADR 0079 — Variant Transactionnel pour Syncytium

## Statut

Accepté — lot 20 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, transactions atomiques, budget, inventaire et capacité.

## Lié à

Phase 38 de la feuille de route Syncytium.

## Contexte

Syncytium possède déjà un service de transactions sérialisables et un `ESCROW_COUNTER` borné. Il manquait un contrat de domaine garantissant qu'une réservation prélève plusieurs ressources et publie sa réservation de manière atomique.

## Décision

1. Déclarer `budget`, `inventory` et `capacity` comme `ESCROW_COUNTER` avec allocations par acteur.
2. Déclarer `reservations` comme un `MAP` en zone `SERIALIZABLE`.
3. Réserver via une transaction unique qui consomme chaque allocation demandée et inscrit le reçu de réservation.
4. Libérer via une transaction unique qui rend les ressources consommées et supprime le reçu; seul son acteur peut le faire.
5. Utiliser les préconditions de version d'état pour rendre la libération conditionnelle à l'observation du reçu.

## Conséquences

### Positives

- Les ressources ne peuvent pas être consommées au-delà de l'allocation de l'acteur.
- Une réservation partielle n'est jamais visible si un prélèvement ou un invariant échoue.
- Les opérations restent rejouables et idempotentes au niveau de leurs identifiants d'opération.

### Négatives

- Les quantités sont des entiers sûrs positifs ou nuls; les ressources fractionnaires nécessiteraient un facteur d'échelle explicite.
- Les allocations initiales demeurent définies dans le schéma de session; leur rééquilibrage passe par les opérations atomiques d'allocation existantes.

## Alternatives

- Lire les compteurs puis les modifier par opérations séparées : écarté, car des échecs intermédiaires exposeraient une réservation partielle.
- Traiter les réservations comme de simples lignes en `MAP` : écarté, car cela ne borne pas les ressources réellement disponibles.
