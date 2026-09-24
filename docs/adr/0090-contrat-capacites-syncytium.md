# ADR 0090 — Contrat de Capacités Syncytium

## Statut

Accepté — lot 26 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, sélection de topologie, capacités requises et profil runtime.

## Lié à

Phase 44 de la feuille de route Syncytium.

## Contexte

Le contrat de topologie Syncytium ne déclarait que l'état CRDT, la signalisation, le bac à sable, le gouverneur de sortie, l'inférence locale et l'observabilité. Les lots suivants ont ajouté des garanties de causalité, conflits sémantiques, invariants, synchronisation sélective et transactions.

## Décision

1. Ajouter les capacités explicites `CAUSAL_STATE`, `SEMANTIC_CONFLICTS`, `INVARIANT_GATES`, `SELECTIVE_SYNC` et `TRANSACTIONAL_SHARED_STATE` au registre GenOS.
2. Déclarer ces capacités comme requises pour le mode Syncytium.
3. Étendre le contrat Syncytium avec provenance, capsules/snapshots, barrière de preuve et reprise résiliente.
4. Décrire le profil de synchronisation comme causal et sélectif, avec matérialisation par snapshots.
5. Exposer les nouvelles entrées dans le graphe de capacités machine-readable.

## Conséquences

### Positives

- L'audit de topologie signale une exécution Syncytium qui ne fournit pas l'une de ses garanties requises.
- Les nouveaux noms sont interrogeables dans le graphe de concepts et normalisés avec les capacités existantes.
- Le contrat reflète les phases implémentées du plan Syncytium.

### Négatives

- L'audit reste déclaratif : chaque déploiement doit fournir explicitement les capacités disponibles.
- La présence dans le registre ne prouve pas à elle seule qu'un environnement les a configurées.

## Alternatives

- Traiter ces capacités comme de simples métadonnées de profil : écarté, car l'audit ne détecterait pas leur absence.
- Exiger seulement `CRDT_SHARED_STATE` : écarté, car cela ne décrit ni la correction sémantique ni le mode de réplication.
