# ADR 0403 — Frontière quiescente des snapshots Métapopulation

## Contexte

Le runtime régional persiste les dèmes, migrations, baux et événements hors du
workspace d'un agent. Une session créée par le parcours biologique restait en
`FORMING` ; l'adaptateur snapshot n'acceptait que `QUIESCENT` ou `CLOSED` et
supposait que le propriétaire du workspace isolé d'un dème était l'identifiant
de l'agent. Les capsules réelles utilisent un identifiant d'isolation ou de
daemon. Le plugin de morphogenèse pouvait retourner `NO_ACTION` pour une région
sans dème, sans avoir exécuté de mission de variant.

## Décision

Le parcours de morphogenèse transmet le variant explicite à la session. Une
région créée sans dème retourne `BLOCKED/REGION_UNPOPULATED` et ne revendique
aucune vérification de mission. Pour une session existante, le variant demandé
doit correspondre au variant persisté.

`quiesceForSnapshot` prend une session, un agent et un workspace explicites.
Dans une transaction SQLite, il refuse les agents de mission en cours, les
effets régionaux en vol et les liens mission/dème/workspace absents. Il inscrit
`SESSION_QUIESCED` puis valide la frontière avec l'adaptateur snapshot. Un
échec annule la transition. L'opération est idempotente sur une session déjà
quiescente.

L'appartenance persistée du dème à l'agent et le lien `mission_agents` fondent
l'autorisation. Le workspace d'un dème isolé reste une référence : son
propriétaire peut être l'identifiant de capsule ou de daemon. Le snapshot
d'agent n'en restaure pas les fichiers ni l'état collectif.

## Conséquences

- `boundaryVerified` décrit seulement une frontière stable ;
  `missionVerified` reste faux.
- Les migrations, colonisations et baux actifs interdisent la quiescence et
  donc la capture. Les adaptateurs externes restent requis pour leurs effets.
- Les anciennes sessions sans mission liée ou sans dème attaché restent
  refusées jusqu'à une association vérifiée ; aucune association n'est déduite
  du seul identifiant demandé.
