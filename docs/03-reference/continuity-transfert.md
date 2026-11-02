# CONTINUITY — Transfert de responsabilité durable

- **Statut** : Implémenté comme bibliothèque Node intégrable ; authentification et ressource autoritaire à fournir.
- **Dernière revue** : 2026-11-02

## API et états

`ContinuityHandoff` est exportée par
`backend/src/services/continuityProtocol/handoff.js`. Son constructeur reçoit
`{dbPath,authorize,verifyCheckpoint,activateAuthority,clock}`. Les trois callbacks
sont obligatoires et peuvent être asynchrones. La base SQLite utilise WAL ; en
l'absence de `dbPath`, elle reste en mémoire.

| Méthode | Résultat |
| --- | --- |
| `apply(message)` | Promesse du résultat durable de la transition |
| `state(transferId)` | Copie de l'état durable ou `null` |
| `history()` | Messages et résultats validés, ordonnés par séquence |
| `close()` | Fermeture de la connexion SQLite |

La conversation suit
`OFFER_HANDOFF → SEAL_CHECKPOINT → ACCEPT_RESPONSIBILITY → ACTIVATE_SUCCESSOR`.
Ses états sont `offered`, `sealed`, `accepted`, puis `activated`. Un état
intermédiaire `activation_pending` est conservé **avant** l'appel de la ressource
autoritaire. `ABORT_HANDOFF` peut produire `aborted` depuis `offered` ou `sealed`.
Une responsabilité déjà acceptée ou une activation engagée exige une décision
de récupération ; elle n'est pas annulée implicitement.

Chaque message après l'offre doit citer `state.lastMessageId` dans `causalRefs`.
L'organisation, le projet, la mission, la conversation et les générations
d'organisation et de workspace restent liés au transfert. La génération
d'incarnation source reste constante entre l'offre et le scellement ; celle du
successeur est fixée à l'acceptation puis vérifiée à l'activation. Ces générations
ne sont pas assimilées à la génération d'autorité.

## Paquet et acceptation explicite

L'offre porte `{transferId,source,successor,bundle,authority}`. Source et successeur
sont des identités complètes : agent, incarnation, domaine de confiance, mission,
branche et empreinte d'histoire. Leurs incarnations doivent être différentes.
Le profil v1 exige la même mission et la même branche ; un fork ne reçoit pas
de droits par héritage ou par simple copie de son état.

Le paquet `bundle` contient :

- Le checkpoint exact : identifiant, empreinte et empreinte d'histoire source.
- Les obligations ouvertes, chacune avec un identifiant, un propriétaire proposé et des références de preuves.
- Les références de preuves disponibles.
- Les permissions effectives demandées.
- Le budget dans une unité explicite, avec plafond, dépense et réserve.
- Les effets dont l'issue est inconnue, avec responsable, description et référence d'opération.

Les propriétaires proposés des obligations et des effets incertains doivent
être l'acteur successeur dès l'offre : cette destination fait partie du paquet
scellé. L'identité source conserve l'origine du transfert. L'acceptation du
successeur référence exactement `bundleDigest` ; elle ne réécrit ni les droits,
ni le budget, ni les incertitudes en cours. L'état conserve l'identité du
successeur, le digest accepté et le message d'acceptation.

L'offre et le scellement proviennent de la source et visent le successeur.
L'acceptation et l'activation proviennent du successeur et visent la source.
Les contrôles d'acteur sont complétés par `authorize(message)`, qui doit
authentifier le transport, l'identité et l'autorité réelle. Une identité copiée
ou une empreinte correcte ne fournit pas à elle seule cette autorité.

## Vérification du checkpoint

`verifyCheckpoint(request)` reçoit
`{transferId,bundleDigest,source,successor,bundle,scope,missionId,branchId}`.
Le callback doit consulter l'état source de confiance et vérifier l'intégrité
du checkpoint, l'histoire annoncée, l'exhaustivité des obligations et effets
incertains, les preuves référencées, les droits et le budget restant. Une liste
vide dans le message ne prouve pas l'absence d'obligations dans cet état source.

Le reçu attendu contient `status: "validated"`, `transferId`, `bundleDigest`,
`checkpointDigest`, `sourceHistoryDigest`, `requestDigest: digest(request)` et
un `receiptDigest` SHA-256. Le digest de requête lie toutes les identités et la
portée, y compris lorsque les listes du paquet sont vides. Les paramètres des
callbacks sont des copies profondément gelées.

## Activation et fencing

`activateAuthority(request)` reçoit
`{transferId,bundleDigest,scope,missionId,branchId,previousOwner,successor,previousGeneration,newGeneration,permissions,budget}`.
Les propriétaires sont des acteurs `{agentId,incarnationId,trustDomain}`.
La nouvelle génération doit être exactement l'ancienne plus un.

Ce callback doit appliquer le transfert sur la ressource protégée, avec un
contrôle atomique de l'ancienne génération et de son propriétaire. Il doit
être idempotent pour le même `transferId` et les mêmes données, refuser les
droits supplémentaires ou un budget augmenté et faire respecter le fencing
à chaque effet ultérieur. `FencedResource.transfer` fournit l'adaptateur local
de référence de cette ressource ; ce contrôle ne couvre pas automatiquement
des services externes.

Le reçu attendu est exactement `{...request,status:"activated",receiptDigest}`,
où `receiptDigest` est le digest de
`{profile:"genos.continuity.fence/receipt/v1",status:"activated",...request}`.
Le runtime vérifie ce lien après le callback de confiance ; le calcul du digest
ne remplace pas l'exécution sur la ressource.

## Crash, doublons et concurrence

L'état et chaque message achevé sont écrits atomiquement. Une redélivrance
exacte retourne le résultat déjà conservé ; réutiliser le même identifiant ou
la même clé avec un autre contenu échoue, y compris pour l'intention d'activation.
Après un callback, l'autorité et l'expiration sont réévaluées. Le commit compare
l'état courant à celui lu avant l'appel et refuse une transition concurrente.

L'activation de la ressource et le commit local sont deux transactions distinctes.
Une perte de réponse, un arrêt ou une révocation entre les deux conserve
`activation_pending`. La ressource peut déjà appartenir au successeur : cet
état ne doit être présenté ni comme un échec sans effet, ni comme un retour
de l'autorité à la source. Après réouverture, redélivrer `ACTIVATE_SUCCESSOR`
avec le même paquet réinterroge le callback idempotent puis finalise le journal.
Un nouveau message non expiré peut reprendre la même intention et doit citer
le dernier message achevé, l'acceptation. Le binding d'activation est immuable.

Une copie locale ancienne ne prouve pas que l'ancienne génération est encore
valide. La seule protection contre une ancienne incarnation reconnectée est le
contrôle de la génération au point où la ressource applique réellement l'effet.
Le runtime ne restaure pas les permissions à partir d'un checkpoint.

## Limites et tests

Cette bibliothèque ne configure ni réseau, ni authentification distribuée,
ni gate automatique des routes HTTP ou des outils MCP. Les lectures supposent
un intégrateur de confiance et ne sont pas une API multi-tenant exposable telle
quelle. Un crash du service autoritaire impose aussi la durabilité de son propre
journal, indépendamment de la base du transfert.

```text
node backend/tests/test_continuity_protocol_handoff.js
node backend/tests/test_continuity_protocol_handoff_races.js
```

Ces tests exécutent les transitions locales, la reprise SQLite et les bindings,
avec des callbacks contrôlés. Ils injectent une réponse perdue après effet,
des doublons, des conflits, une annulation concurrente, une expiration et des
révocations. Le démonstrateur multiprocessus vérifie séparément le fencing et
les arrêts réels entre ressource et consommateur.
