# ADR 0461 — Exclure l'hôte et l'acteur des vérificateurs de mission Holobionte

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : Holobionte, douze variants, autorité des preuves
- **Lié à** : [ADR 0401](0401-preuve-arret-mission-holobionte.md)

## Contexte

Le runner d'une mission de variant exigeait deux identifiants de vérificateur
distincts et des assertions liées aux références de preuve. Il acceptait
cependant `hostId` ou `actorId` parmi ces identifiants. Une réponse `PASS`
fournie avec l'hôte et un second identifiant recevait donc un verdict final
`PASS`, alors que l'hôte avait participé à la vérification de sa propre
mission.

## Décision

Le préflight et le verdict n'admettent comme vérificateurs de mission que les
identifiants distincts de `hostId` et, lorsqu'il est présent, de `actorId`.
Deux identités admissibles sont requises. Le runner transmet cette liste à
`verifyMission` et refuse un `PASS` si la réponse cite une identité exclue.
Dans ce cas, le verdict est `INCONCLUSIVE` et la session n'est pas arrêtée.

## Conséquences et limites

Une mission qui déclarait l'hôte ou l'acteur comme second vérificateur doit
fournir deux autres identités. Le contrôle porte sur les identifiants et les
références rendus par l'adaptateur : il ne prouve pas à lui seul l'indépendance
organisationnelle ou l'exécution réelle de la vérification externe. Les gates
des résultats métier et la preuve de clôture restent séparés.

## Alternative écartée

Accepter le nom de l'hôte comme vérificateur en supposant qu'un autre processus
utilise cet identifiant aurait rendu l'autorité invérifiable dans le reçu de
mission. Une identité distincte est exigée.
