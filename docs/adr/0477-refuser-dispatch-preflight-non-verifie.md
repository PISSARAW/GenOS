# ADR 0477 — Refuser le dispatch si le préflight d’exécution est non vérifié

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : Ontogenesis, admission des missions et contrat d’exécution.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0472, séparation exécution/promotion ; ADR 0473, préflight partagé des missions.

## Contexte

Le préflight partagé distinguait déjà `unverified` de `blocked`, mais le service
de dispatch ne consultait que `blockingReasons`. Une invocation directe pouvait
donc préparer un workspace et démarrer un worker sans déclaration de capacités
d’exécution. La voie `tick` bloquait certaines missions après normalisation de
configuration, mais ce comportement indirect ne protégeait pas tous les
appelants.

## Décision

Le préflight garde ses états diagnostiques et ses raisons propres. Une fonction
commune de refus autorise le dispatch seulement si le préflight est présent,
cohérent, sans raison bloquante et si l’audit d’exécution est `admitted`.
`unverified` reçoit le motif stable
`capacites-execution-non-attestees`; tout statut inconnu ou préflight mal formé
échoue également de façon fermée. Les raisons existantes gardent la priorité.

Le tick et le dispatch direct appliquent ce contrat avant toute préparation de
workspace ou écriture d’exécution. Les écarts canoniques peuvent encore produire
`admitted_with_gaps` quand les besoins génériques d’exécution sont admis. Cette
admission ne prouve pas qu’un worker a réussi et n’ouvre aucun gate de preuve ou
de promotion. Une référence explicitement demandée à une capacité du catalogue
ou à un concept du graphe d’exécution, mais résolue comme indisponible, bloque
aussi le dispatch. Les références philosophiques restent consultatives et les
entrées purement documentaires ne sont pas interprétées comme des demandes
d’exécution.

## Conséquences

### Positives

- Aucun chemin de lancement n’interprète l’absence de déclaration comme une
  capacité disponible.
- Le diagnostic `unverified` reste distinct des erreurs de configuration
  bloquantes.
- Les écarts de maturité canonique ne deviennent pas un refus universel.
- Une capacité explicitement demandée ne peut pas être silencieusement ignorée
  lorsqu’elle est partielle ou incompatible avec la topologie.
- Le format actuel n’exprime pas de mode consultatif pour les références au
  graphe d’exécution ; une référence explicite incompatible est donc refusée.

### Négatives

- Les appelants directs doivent fournir un préflight cohérent avant tout
  lancement ; ils reçoivent `WAITING_INPUT` si les capacités manquent.
- Les capacités déclarées restent une configuration d’admission. Elles ne sont
  pas une attestation de succès ou une preuve de promotion.

## Alternatives

- Ajouter `unverified` aux `blockingReasons` du constructeur : rejeté, car cela
  confondrait état diagnostique et règle de dispatch, et changerait les
  consommateurs du préflight.
- Continuer à s’appuyer sur la normalisation du tick : rejeté, car les appels
  directs au service peuvent contourner cette voie.
- Traiter un préflight admis comme preuve d’exécution : rejeté, les reçus worker
  et gates d’évidence restent les autorités pour les décisions ultérieures.

## Vérification attendue

Les tests de contrat conservent `unverified` sans raison bloquante dans le
diagnostic, mais vérifient son refus au dispatch. Un test SQLite exerce le
service direct et le tick : aucun workspace ni run n’est créé lorsque la
configuration omet les capacités. Les préflights admis et admis avec écarts
canoniques restent admissibles.
