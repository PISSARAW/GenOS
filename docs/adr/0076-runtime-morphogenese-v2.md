# ADR 0076 — Runtime morphogénétique v2

- Statut : Accepté
- Date : 2026-09-24
- Domaine : Orchestration, contrôle morphogénétique, observabilité

## Contexte

Le dépôt contient un contrôleur morphogénétique Rust et des services sémantiques,
de mémoire et d'exécution Node. Deux décideurs autonomes créeraient des décisions
contradictoires et rendraient les gates difficiles à auditer.

## Décision

Rust est l'autorité déterministe pour valider et adjuger une proposition de
transition. Node observe, profile, diagnostique, synthétise une proposition,
exécute les adaptateurs, persiste les résultats et construit les vues et reçus.
Node ne peut appliquer une proposition avant la décision du kernel. `NO_CHANGE`
est un résultat final valide. Les actions appliquées passent par gouvernance,
transition vérifiable, attribution de crédit et mémoire.

Les intégrations du runtime prennent les services comme dépendances explicites;
une absence d'adaptateur de kernel n'est pas compensée par une décision locale.
Les métriques et reçus exposent les éléments de preuve, les coûts et la disponibilité
du rollback.

## Conséquences

- Le binding ou transport Rust–Node reste un adaptateur d'exécution déployé par
  l'application; ces services ne prétendent pas l'implémenter implicitement.
- Les propositions LLM restent des entrées non fiables et passent par le kernel.
- `NO_CHANGE` ne déclenche ni snapshot, ni mutation, ni dépense de transition.
- Les benchmark et tests d'invariants déterminent la calibration des seuils.
