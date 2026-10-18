# ADR 0611 — Frontière de livraison d’Ontogenèse

Date : 2026-10-18. Statut : accepté. Complète les ADR 0235 et 0238.

## Problème

L’Ontogenèse sait produire un commit local vérifié sur sa branche dédiée. Sa
configuration refuse déjà `allowPush`, `allowMerge`, `publication.enabled` et
`merge.enabled`, mais deux chemins techniques restaient trop permissifs :

- l’adaptateur Git de l’intégrateur transmettait tout sous-ordre reçu ;
- une commande de vérification configurée pouvait nommer directement
  `git push` ou `git merge`.

Une consigne textuelle au worker et un drapeau de configuration ne suffisent pas à
prouver que la publication demeure hors autorité.

## Décision

L’autorité de l’Ontogenèse s’arrête au commit local vérifié :

1. l’adaptateur Git de l’intégrateur applique une liste positive de sous-ordres
   locaux nécessaires (`add`, `commit`, `status`, `diff`, `rev-parse`, `log`,
   `cat-file`, `merge-base`) ;
2. la validation de configuration rejette une vérification qui demande directement
   `git push` ou `git merge`, y compris avec des options Git globales ;
3. la mission reçoit un contrat explicite interdisant commit, push, fusion et
   mutation de remote ; seul l’intégrateur peut créer le commit local après les
   gates ;
4. le statut opérateur expose `push=outside_authority` et
   `merge=outside_authority` avec le dernier commit local disponible.

Aucune commande de push ou de fusion n’est ajoutée. Leur exécution requiert une
action séparée de l’opérateur, hors du processus Ontogenèse et de ses leases.

## Conséquences

- Une règle de revue `allow` ne peut pas réintroduire push ou fusion.
- Une future publication devra créer une nouvelle frontière d’autorité, une preuve
  dédiée et un ADR ; elle ne pourra pas élargir silencieusement l’adaptateur actuel.
- Les scripts arbitraires choisis par l’opérateur restent sa responsabilité : cette
  décision ferme les chemins Git directs du runtime, sans prétendre constituer une
  sandbox réseau générale.

## Vérification

`backend/tests/test_ontogenesis_release_boundary.js` vérifie le rejet des commandes
externes, la liste positive de l’intégrateur, le contrat de mission et la visibilité
de la frontière dans le statut.
