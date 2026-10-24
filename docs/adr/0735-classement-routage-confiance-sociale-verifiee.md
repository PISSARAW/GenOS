# ADR 0735 — Classer le routage social avec la confiance de domaine vérifiée

- **Statut :** accepté
- **Date :** 24 octobre 2026

## Contexte

`relationOutcomeLearningService` recalcule `trustByDomain` à partir d'évaluations
scopées, binaires et vérifiées, mais le profil de communication ne consomme pas
ce signal. Une expérience ultérieure ne peut donc pas démontrer que le résultat
d'une interaction précédente change le choix d'un destinataire.

## Décision

Lorsque l'intention de communication nomme un domaine, le profil relationnel lit
la valeur `trustByDomain` de chaque destinataire. Le routeur classe les candidats
admissibles par confiance décroissante; les candidats sans mesure restent après
ceux qui en possèdent une, et l'ordre d'entrée départage les égalités. Sans
domaine, l'ordre historique reste inchangé.

Cette mesure ne confère aucune autorité, permission, capacité de divulgation ni
garantie de compétence. Les filtres d'admissibilité, les contrôles RPE et les
autorisations existantes gardent priorité. Seules les évaluations acceptées par
`relationOutcomeLearningService` peuvent alimenter la confiance persistée.

## Conséquences

- Une preuve de résultat vérifié peut désormais modifier un choix ultérieur de
  destinataire dans le même domaine.
- Le comportement reste déterministe et explicable par le profil et l'ordre des
  candidats.
- Le protocole SocialWorld V2 doit comparer ce classement aux bras statiques et
  sans physiologie relationnelle avant toute affirmation de bénéfice causal.
