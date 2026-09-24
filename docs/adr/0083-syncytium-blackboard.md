# ADR 0083 — Variant Blackboard pour Syncytium

## Statut

Accepté — lot 22 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, coordination multi-agent par mutations partagées.

## Lié à

Phase 40 de la feuille de route Syncytium.

## Contexte

Les agents d'un blackboard doivent pouvoir publier un problème, de nouvelles preuves, une demande de vérification, une dépendance bloquante et leurs résultats dans un état commun observable.

## Décision

1. Ajouter les mutations typées `new_problem`, `new_evidence`, `request_verification`, `unresolved_dependency` et `result` dans un champ `ADD_WINS_SET` en zone `APPEND_ONLY`.
2. Exiger un acteur et un payload objet pour chaque événement, avec un identifiant d'événement et un lien `respondsTo` facultatifs.
3. Exposer une lecture commune et un filtre par type pour que les agents réagissent aux mutations qu'ils observent.
4. Réutiliser le Shared State causal Syncytium au lieu de créer un bus mutable à dernière valeur.

## Conséquences

### Positives

- Les événements concurrents restent visibles ensemble et sont filtrables par catégorie.
- Chaque agent peut publier une réponse reliée à l'événement qui l'a motivée.
- La coordination utilise les projections, les droits de domaine et les deltas existants du runtime.

### Négatives

- La réaction des agents s'appuie sur leurs lectures et abonnements Syncytium; ce lot ne crée pas un ordonnanceur de workers.
- Les événements sont append-only; leur archivage ou leur retrait relève d'une politique distincte.

## Alternatives

- Écraser l'état du tableau par une valeur JSON courante : écarté, car les mutations concurrentes pourraient se masquer.
- Ajouter des signaux REFLEX urgents pour chaque publication : écarté, car les événements de travail ne sont pas des urgences système.
