# ADR 0095 — Runtime Autonome Syncytium

## Statut

Accepté — lot 30 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, cycle event-driven, réparation et matérialisation.

## Lié à

Phase 48 de la feuille de route Syncytium.

## Contexte

Le cycle runtime cible reçoit les opérations, applique les gates Syncytium, publie les deltas, vérifie les invariants puis matérialise ou répare. Le runtime est déclenché par des événements, pas par une boucle temporelle obligatoire.

## Décision

1. Créer les contrôleurs d'état, de réparation et de matérialisation ainsi qu'un orchestrateur de runtime et un processeur d'événements.
2. Déléguer autorité, causalité, conflits, zones et invariant gates aux services d'opération et de transaction existants.
3. Convertir un batch multi-opérations en transaction atomique; traiter une opération seule directement.
4. Après chaque événement, inspecter la cohérence; ne réparer que si un appelant fournit une requête explicite et que le gate de réparation l'accepte.
5. Déclencher snapshot et compaction sur franchissement de seuil configurables à la suite des événements; conserver la vérification de causal stability du service de compaction.
6. N'utiliser aucun timer permanent : `receive` constitue le point d'activation du cycle.

## Conséquences

### Positives

- Le runtime autonome réutilise les gates en place sans dupliquer les contrôles critiques.
- Les événements peuvent publier sélectivement via les plans de delta retournés par Syncytium.
- Snapshotting et compaction sont paramétrables et la compaction respecte les frontières causales stables.

### Négatives

- La découverte d'opérations et la reprise des événements appartiennent au transport appelant; aucun daemon d'arrière-plan n'est ajouté.
- La réparation reste explicite; la détection seule ne déclenche pas une mutation.

## Alternatives

- Faire tourner un tick permanent : écarté, car le plan privilégie les événements et cela ajouterait du travail sans mutation.
- Réimplémenter les gates dans l'orchestrateur : écarté, car des chemins de mutation pourraient alors diverger.
