# ADR 0419 — Capacité du fournisseur liée au travail Compute de Biome

## Statut

Accepté le 11 octobre 2026.

## Contexte

Le variant Compute sélectionnait un fournisseur selon `demand`, tandis que le
cycle transmettait ensuite `computeWork.resources` à l'adaptateur. Si le besoin
déclaré était inférieur à la réservation du travail, un fournisseur insuffisant
pouvait être choisi. En l'absence de fournisseur faisable, le travail explicite
disparaissait de la liste des exécutions sans reçu de refus dans la réponse.

## Décision

- Pour un `computeWork` explicite, comparer chaque fournisseur au maximum de
  `demand` et de `computeWork.resources`, ressource par ressource. Valider les
  ressources du travail avec le même contrat que la réservation d'exécution.
- Lorsqu'aucun fournisseur ne peut porter ce travail, retourner un résultat
  `abstained` avec la raison `no_feasible_provider`, en plus de l'action
  écologique `COMPUTE_CAPACITY_INSUFFICIENT` journalisée dans la session.
- Une sélection sans `computeWork` reste une recommandation. L'exécution
  demande toujours un adaptateur, une autorisation, une réservation et une
  vérification indépendante du résultat.

## Conséquences

Un besoin sous-déclaré ne permet plus d'envoyer le travail vers un fournisseur
déclaré insuffisant. Le refus de capacité devient observable dans la réponse du
cycle et dans son historique. Les capacités publiées par les fournisseurs
restent des entrées de planification ; ce changement ne certifie pas leurs
ressources physiques ni l'effet externe d'un adaptateur.
