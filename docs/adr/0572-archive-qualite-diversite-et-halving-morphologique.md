# ADR 0572 — Archive qualité-diversité et halving morphologique

- **Statut :** Accepté
- **Date :** 2026-10-18
- **Lié à :** ADR 0133, ADR 0294, ADR 0571

## Contexte

Le P0 de recherche morphologique a unifié le contrat des candidats et rendu le
lignage rejouable. Il conservait toutefois un unique champion et évaluait un
nombre implicite de descendants. Cette stratégie converge facilement vers une
seule famille structurelle et ne permet pas d'auditer la dépense de recherche.

## Décision

1. La recherche maintient une archive bornée avec au plus un élite par niche
   structurelle. Une niche est déterminée par le type racine, les topologies et
   variants présents, une bande de taille et une bande de profondeur.
2. L'élite d'une niche est le candidat évalué de meilleure qualité. La nouveauté
   structurelle est conservée comme métrique secondaire ; elle ne remplace ni
   l'évaluation ni une preuve de promotion.
3. Un budget explicite `maxEvaluations`, exprimé en évaluations de candidat,
   borne la recherche. Il ne représente pas des jetons et ne doit pas être
   présenté comme une attestation de coût fournisseur.
4. Après chaque vague, une successive halving déterministe conserve
   `ceil(n / eta)` candidats, avec un minimum déclaré. Elle prend d'abord le
   meilleur candidat de niches distinctes, puis complète par score.
5. Le quota restant finance les descendants des survivants en tourniquet. Le
   reçu de chaque vague conserve les candidats évalués, survivants, éliminés et
   le budget consommé. Une même graine reproduit ces décisions.

## Conséquences

- La recherche conserve plusieurs familles de morphologies au lieu d'un seul
  chemin gourmand.
- Le nombre d'exécutions de l'évaluateur ne dépasse jamais la limite déclarée.
- L'archive et le halving sont des mécanismes de recherche consultatifs. Ils
  n'accordent aucune autorité de commit et ne rendent pas un candidat éligible à
  la promotion.
- Le benchmark confirmatoire, le holdout externe, les intervalles de confiance
  et la comparaison MASS/EvoMAS restent un livrable ultérieur.

## Vérification

`backend/tests/test_morphology_search_p1.js` vérifie le remplacement d'un élite,
la conservation de niches distinctes, l'élimination déterministe, le plafond
d'évaluations, le lignage des descendants et le replay exact.
