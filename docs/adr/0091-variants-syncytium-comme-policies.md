# ADR 0091 — Variants Syncytium comme Policies

## Statut

Accepté — lot 27 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, sélection de policies, schémas et configuration d'exécution.

## Lié à

Phase 45 de la feuille de route Syncytium.

## Contexte

Le runtime a plusieurs variantes spécialisées, mais chacune était appelée par une façade dédiée. Le plan demande une interface commune permettant d'évaluer la convenance d'une variante et de configurer son schéma, ses zones, domaines, invariants, réplication, réparation et conditions d'arrêt.

## Décision

1. Enregistrer douze policies nommées : hard, soft, code, document, graph, transactional, epistemic, blackboard, local-first, speculative, hierarchical et realtime-control.
2. Donner à chaque policy la même interface de configuration et un résultat `analyzeFit` déterministe.
3. Appliquer la priorité Code, Graph, Transactional, Speculative, Hierarchical lors d'une égalité de convenance; accepter aussi la sélection explicite par identifiant.
4. Publier `createPolicySession` pour compiler le schéma et domaines retenus avec les réglages de réplication, réparation et arrêt.
5. Traiter réparation et conditions d'arrêt comme des descripteurs déclaratifs que les gates runtime spécialisées interprètent.

## Conséquences

### Positives

- Une même API expose les stratégies spécialisées et leurs choix de cohérence.
- La sélection automatique et son ordre de priorité sont testables et reproductibles.
- Les sessions peuvent démarrer à partir d'une policy explicite ou d'un ajustement à la mission.

### Négatives

- Les descripteurs de réparation et d'arrêt n'exécutent pas à eux seuls les actions; les services métier gardent l'application des gates.
- La sélection automatique repose sur des signaux lexicaux simples et ne remplace pas un planificateur sémantique complet.

## Alternatives

- Fusionner toutes les variantes dans un seul schéma fixe : écarté, car leurs zones et sémantiques diffèrent.
- Laisser le choix implicite dans chaque appel spécialisé : écarté, car l'ajustement et les capacités ne seraient pas comparables.
