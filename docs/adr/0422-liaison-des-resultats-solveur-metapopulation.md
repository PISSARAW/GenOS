# ADR 0422 — Lier le résultat du solveur à son îlot et à sa preuve

## Statut

Accepté le 11 octobre 2026.

## Contexte

La recherche d'îlot persistait le résultat de `options.solverSearch` si son
`solverId`, son objectif et ses compteurs avaient une forme valide. Le dème,
le problème et la seed n'étaient pas rappelés par le résultat. Le runtime
attribuait donc au dème courant un résultat éventuellement produit pour un
autre contexte. Aucune référence de preuve n'était conservée avec cet état.

## Décision

- Exiger que le résultat du solveur rappelle exactement `demeId`, `solverId`,
  `problemRef` et `seed` de la requête transmise à l'adaptateur.
- Exiger un `incumbentRef` et un `evidenceRef` non vides, ainsi qu'un objet
  `provenance`. Conserver la référence et la provenance dans l'état persisté.
- Refuser le résultat avant toute mutation du profil si un champ est absent
  ou discordant. La vérification régionale compare la preuve et la seed à
  l'état relu en base.

## Conséquences

Une réponse ancienne ou croisée entre îlots ne peut plus être promue comme
résultat local. Les adaptateurs de solveur doivent retourner les identifiants
et la référence de preuve. Cette liaison ne vérifie pas indépendamment la
valeur de l'objectif ni l'authenticité de l'adaptateur externe.
