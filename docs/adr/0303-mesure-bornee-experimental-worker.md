# ADR 0303 — Mesure bornée du worker expérimental

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Workers, expérimentation, preuve
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0294, ADR 0301

## Contexte

Le `experimental_worker` produisait un protocole et un artefact de mesure
par modèle, sans route capable d'exécuter une expérience structurée.
La campagne comparative ne mesurait aucune capacité expérimentale.

## Décision

La méthode `measure_lpt` reçoit des travaux, un nombre de machines et
un seuil entier. Elle exécute le planificateur LPT borné, relève le
makespan observé et compare cette mesure au seuil. Le rapport contient
le protocole, une mesure liée au reçu de procédure et une conclusion
limitée à ces entrées. Le budget de modèle est zéro token.

## Conséquences

Un cas expérimental de plus devient mesurable par recalcul indépendant.
Le protocole ne réalise ni répétitions statistiques ni contrôle de
facteurs confondants ; il ne doit pas être présenté comme une expérience
scientifique générale. Une conclusion `supported_for_this_input` ne
permet aucune généralisation à d'autres ordonnancements.

## Alternatives

- Déduire une mesure d'une description générée : rejeté, faute
  d'exécution observée.
- Écrire `validated` pour tous les seuils satisfaits : rejeté, car le
  constat ne porte que sur une entrée bornée.
