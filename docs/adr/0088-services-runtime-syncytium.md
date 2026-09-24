# ADR 0088 — Services du Runtime Syncytium

## Statut

Accepté — lot 25 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, rôles runtime, exécution multi-noyaux et matérialisation.

## Lié à

Phase 43 de la feuille de route Syncytium.

## Contexte

Le modèle cible distingue quatre responsabilités de service sans imposer quatre agents fixes: coordination de l'état, N noyaux d'exécution parallèles, gardien de cohérence et exécution d'intégration/materialization.

## Décision

1. Publier un catalogue des quatre rôles et des plans qu'ils servent.
2. Exposer le State Plane sur les opérations et transactions du Shared State.
3. Créer les noyaux parallèles à la demande, chacun lié à un acteur et à un domaine fixe.
4. Exposer le gardien pour audit, explication causale, localisation et réparation.
5. Exposer le service d'intégration pour capturer et lister les matérialisations.

## Conséquences

### Positives

- Le nombre de noyaux d'exécution dépend de la mission; le test instancie douze noyaux sans changer les rôles.
- Les noyaux portent toujours leur identité de domaine, qui est vérifiée par les mécanismes d'autorité existants.
- Les responsabilités de garde et de matérialisation appellent les services Syncytium existants.

### Négatives

- Ce lot sépare les contrats de service; il ne déploie pas ces services comme processus ou workers distribués autonomes.
- La parallélisation sûre dépend toujours des classifications de cohérence et des gates des opérations.

## Alternatives

- Construire exactement quatre agents nommés et permanents : écarté, car le nombre de noyaux d'exécution varie selon la mission.
- Un seul service monolithique pour tous les rôles : écarté, car il masque les responsabilités et les frontières d'autorité.
