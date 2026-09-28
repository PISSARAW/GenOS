# ADR 0170 — Spécialisation des workers par variant Syncytium

## Statut

Acceptée

## Date

2026-09-28

## Domaine

Syncytium, orchestration, workers, capacités

## Décideurs

Équipe GenOS

## Lié à

ADR 0043 — Runtime worker commun et phénotypes composables.

## Contexte

Les policies Syncytium sélectionnent le schéma CRDT, les invariants et les stratégies de réparation. La composition biologique créait néanmoins toujours les quatre mêmes rôles, sans ajouter de spécialiste correspondant au domaine du variant.

## Décision

La composition Syncytium conserve ses quatre rôles nécessaires à la coordination d'état et ajoute un rôle spécialisé pour les variants `code`, `graph`, `document` et `transactional`. Chaque rôle déclare ses capacités requises et passe par le sélecteur standard de WorkerKinds. Les affectations explicites fournies par l'appelant restent soumises à la vérification de compatibilité.

## Conséquences

### Positives

- Les variants code, graphe, document et transactionnel lancent un worker avec un mandat adapté à leur domaine.
- Les nouveaux rôles réutilisent les contrats, artefacts de preuve et contrôles d'affectation existants.
- Les rôles CRDT fondamentaux restent présents.

### Négatives

- Les variants concernés consomment un emplacement worker supplémentaire.
- La spécialisation ne prouve pas à elle seule une amélioration de qualité; une comparaison avec baseline reste nécessaire.

## Alternatives

- Modifier les rôles fondamentaux selon le variant, au risque de confondre les responsabilités de coordination CRDT et d'analyse métier.
- Laisser chaque appelant fournir des affectations manuelles, ce qui ne corrige pas la composition par défaut.
