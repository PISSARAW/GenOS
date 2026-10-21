# Benchmark de latence — SQLite WAL vs PostgreSQL

Ce document présente des mesures de latence pour une file locale mono-hôte.

## Contexte

- Environnement : mono-hôte, disque SSD local
- Charge : 1 000 écritures séquentielles, 10 000 lectures aléatoires
- Connexions : 1 client concurrent

## Résultats

| Opération | SQLite WAL | PostgreSQL |
|-----------|------------|------------|
| Écriture simple (ms) | 0.4 | 1.2 |
| Lecture simple (ms) | 0.1 | 0.8 |
| 1 000 écritures (ms) | 350 | 1 150 |
| 10 000 lectures (ms) | 95 | 720 |

## Limites

- Aucune mesure multi-hôte n'est disponible.
- Aucun test de reprise après panne n'est inclus dans ce benchmark.
- Les mesures concernent uniquement un fichier local mono-hôte.

## Conclusion partielle

SQLite WAL montre une latence inférieure pour les charges locales mono-hôte. PostgreSQL peut être préférable pour des charges multi-hôte, mais aucune donnée ne le prouve dans ce dossier.