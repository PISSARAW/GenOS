# ADR 0020 — Persistance explicite des analyses philosophiques

- **Statut** : Accepté
- **Date** : 2026-09-17
- **Domaine** : Philosophie, analyses, provenance, persistance
- **Décideurs** : Équipe GenOS
- **Lié à** : [gouvernance du registre philosophique](0018-gouvernance-registre-philosophique.md), [socle épistémique](0019-socle-epistemique-du-savoir.md)

## Contexte

Les évaluations philosophiques sont normalement des opérations de lecture seule.
Certaines analyses doivent toutefois être conservées pour comparaison, audit ou
reprise ultérieure, sans persister automatiquement chaque requête.

## Décision

Ajouter une table `philosophy_analyses` et trois opérations explicites :
`saveAnalysis`, `getAnalysis` et `listAnalyses`. Une analyse conserve son concept,
ses entrées, son résultat, sa provenance, son créateur et ses horodatages.

La persistance est opt-in. Les limites de taille JSON et la validation de
l’identifiant conceptuel sont appliquées avant écriture. La conservation d’une
analyse ne transforme pas son contenu interprétatif en preuve factuelle.

## Conséquences

### Positives

- Les analyses nécessaires peuvent être auditées et comparées.
- Les évaluations ordinaires restent sans effet de bord.
- La provenance est conservée avec le résultat.

### Négatives

- Une migration et une politique de rétention devront être maintenues.
- Les résultats persistés peuvent devenir obsolètes et doivent rester révisables.

## Alternatives

- Ne rien persister : insuffisant pour l’audit et la comparaison.
- Persister chaque évaluation : rejeté, car trop intrusif et coûteux.
