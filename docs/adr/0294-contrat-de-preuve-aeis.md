# ADR 0294 — Contrat de preuve exécutable AEIS

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : AEIS, preuve, promotion, confinement
- **Lié à** : ADR 0233

## Contexte

Deux reçus signés d'une commande réussie pouvaient promouvoir n'importe quelle phrase :
le résultat d'exécution ne démontrait aucun lien avec l'énoncé. Les identifiants de workspace
des vérificateurs étaient synthétiques alors que les deux processus utilisaient le même
répertoire. Un rapport pouvait aussi fournir un `cwd` hors du capsule avant le contrôle de
confinement.

## Décision

La promotion AEIS accepte un énoncé exécutable typé : la phrase doit être exactement le
prédicat « commande produit cette sortie » ou « commande termine avec code zéro ».
Les autres phrases restent des hypothèses et n'obtiennent pas d'assemblée de promotion.
Le répertoire de chaque commande est résolu physiquement sous le workspace enregistré pour
l'agent dans SQLite, avant l'exécution. Les reçus indépendants portent le répertoire
réellement exécuté ; deux exécutions dans le même répertoire ne constituent pas deux
réplicas indépendants. Les réplicas peuvent avoir des implémentations distinctes, mais
doivent vérifier le même prédicat.

## Conséquences

- Positives : un test sans lien, un répertoire extérieur ou un second reçu synthétique ne
  suffisent plus à promouvoir un claim.
- Négatives : les rapports libres antérieurs doivent exprimer un prédicat vérifiable et
  fournir deux environnements d'exécution distincts pour satisfaire le census.

## Alternatives

Lier une phrase libre à un simple code de sortie aurait préservé la faille sémantique.
Déduire l'indépendance du nom de l'acteur ou du PID n'aurait pas prouvé la séparation des
environnements. Les attestations sémantiques externes exigent un autre contrat de confiance.
