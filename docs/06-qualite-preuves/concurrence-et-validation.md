# Concurrence Git et validation locale

Ce guide définit le flux de travail local lorsque plusieurs agents ou tâches
modifient GenOS en parallèle.

## Isolation du travail

- Une tâche d'édition utilise son propre worktree et sa propre branche `codex/*`.
- Aucun agent ne modifie, ne réinitialise et ne commit dans le worktree d'une
  autre tâche.
- Chaque tâche vérifie son diff, exécute ses tests ciblés et crée ses commits
  dans son worktree.
- L'intégration dans la branche commune est sérialisée après revue des commits.
- Un conflit d'index ou de fusion bloque l'intégration et les tests complets.
  Ne jamais supprimer un `index.lock` sans avoir établi qu'aucun processus Git
  ne le détient.

## Validation

`npm test` exécute un prévol qui refuse les index non fusionnés et les marqueurs
de conflit dans les fichiers modifiés ou non suivis, puis prend un verrou commun
à tous les worktrees du même dépôt.
Les suites complètes ne s'exécutent donc pas simultanément dans ces worktrees.
Un verrou abandonné n'est repris qu'après vérification que son PID n'est plus
actif; un verrou illisible bloque avec un message de diagnostic. Le prévol exige
512 Mio libres sur le volume du dépôt et celui du répertoire temporaire avant
de lancer les scénarios qui créent des espaces isolés.

Les suites démarrent avec `NODE_ENV=test` et un répertoire de base dédié à
l'exécution. Si un test ne fournit pas `GENOS_DB_PATH`, le backend lui attribue
une base temporaire propre au processus. Les tests qui vérifient la reprise
entre processus doivent définir explicitement une base temporaire partagée.
Une configuration `GENOS_DB_PATH` de poste ou une base utilisateur ne doit
jamais servir de fixture implicite. `npm run test:unlocked` est réservé à
l'appel interne du lanceur et ne doit pas remplacer `npm test`.

Le verrou Node ne couvre pas les commandes Cargo. Les fixtures Rust qui sont
recherchées dans `.genos/trajectories` utilisent donc un identifiant UUID par
exécution : deux validations ne doivent ni écraser ni supprimer la même
trajectoire de comptabilité. Les assertions continuent de vérifier les tokens
réels et le filtrage temporel en passant par la recherche de trajectoire du CLI.

## Intégration d'une tâche

1. Créer un worktree depuis la révision de base convenue et une branche dédiée.
2. Vérifier qu'il n'existe aucun conflit avant de commencer les modifications.
3. Créer un commit par solution cohérente et indiquer les fichiers dans le bloc
   `Receipt` du message de commit.
4. Exécuter les contrôles ciblés dans le worktree, puis demander l'intégration.
5. Après intégration, exécuter la suite complète dans un worktree propre.

Un succès de test dans un worktree ne valide pas une fusion conflictuelle ni
les changements concurrents présents dans une autre copie.
