# ADR 0299 — Liaison des assemblages AEIS au run

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : AEIS, mémoire, intégrité, portée
- **Lié à** : ADR 0295, ADR 0298

## Contexte

Un assemblage signé prouvait son contenu, mais pas le run ou la portée de
mémoire qui l'avaient produit. Un appel direct au dépôt pouvait présenter le
même assemblage avec un autre identifiant de run et inscrire une seconde issue.

## Décision

La version 3 de la signature des assemblages inclut `run_id` et `scope_id`.
Une migration ajoute ces colonnes sans attribuer les anciens assemblages à un
run inconnu. La résolution de mémoire exige l'égalité exacte des deux valeurs
avec la demande. Les versions 1 et 2 restent lisibles pour l'audit, mais ne
peuvent plus créer une nouvelle issue de mémoire sans liaison explicite.

## Conséquences

- Positives : un assemblage ne peut pas faire progresser l'affinité d'un autre
  run ni d'une autre portée; modifier ses métadonnées invalide la signature.
- Négatives : les assemblages historiques non liés restent consultables mais
  ne permettent pas la résolution rétroactive de la mémoire.

## Alternatives

Se fier au `runId` transmis à `resolve` aurait conservé la possibilité de
rejouer une preuve valide sous un nouvel identifiant.
