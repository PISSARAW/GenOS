# MORPH — Coordination durable et décision irrévocable

- **Statut** : Profil expérimental Node intégrable, avec une base de décision autoritaire unique.
- **Dernière revue** : 2026-11-02

## API et autorité

`MorphCoordinator` est exportée par
`backend/src/services/morphProtocol/coordinator.js`. Le constructeur reçoit
`{dbPath,authorize,verifyCheckpoint,verifyReady,verifyApplied,clock}`. Les quatre
callbacks sont obligatoires et peuvent être asynchrones. La base SQLite utilise
WAL ; l'absence de `dbPath` produit une base en mémoire, impropre à la reprise
durable d'un déploiement.

| Méthode | Résultat |
| --- | --- |
| `apply(message)` | Promesse du résultat journalisé et de son statut |
| `state(transitionId)` | Copie de l'état durable ou `null` |
| `decision(query)` | Décision durable liée exactement à la requête, ou `null` |
| `history()` | Messages et résultats achevés dans leur ordre de commit |
| `close()` | Fermeture de la connexion SQLite |

L'intégrateur doit désigner une seule base autoritaire de coordination pour
chaque portée exacte `{organizationId,projectId}`. Les participants doivent consulter cette même autorité dans
leur callback `verifyDecision`. Une copie de la base ou un digest transmis dans
un message ne constitue pas une seconde autorité valide. Ce profil n'implémente
ni consensus entre coordinateurs indépendants, ni élection de leader, ni
réplication tolérante aux partitions.

## Conversation et preuve des étapes

La conversation suit
`PROPOSE → QUIESCE → CHECKPOINT → PREPARE → READY → COMMIT → FINALIZE`.
Chaque nœud du roster fixé dans le plan doit fournir son propre `READY`.

| Message | État obtenu et contrôle |
| --- | --- |
| `PROPOSE` | `proposed` ; conservation et identité du coordinateur contrôlées |
| `QUIESCE` | `quiescing` ; intention journalisée, sans preuve implicite d'arrêt des participants |
| `CHECKPOINT` | `checkpointed` ; vérification indépendante de la source et de la quiescence |
| `PREPARE` | `prepared` ; nouvelle vérification source et initialisation contrôlée de la version autoritaire |
| `READY` | `prepared`, puis `ready` quand tous les nœuds fixés ont un reçu vérifié |
| `COMMIT` | `committed` ; version d'organisation et décision irrévocable écrites atomiquement |
| `FINALIZE` | `finalized` ; reçus d'application de tous les participants vérifiés indépendamment |

Les nœuds participants sont des runtimes d'exécution ; leur roster peut être
distinct des agents logiques de `snapshot.members`. Il est fixé par le plan.
L'autorisation et la vérification source doivent confirmer qu'il couvre tous
les agents et ressources concernés. La bibliothèque ne déduit pas cette
couverture d'une simple liste fournie par l'émetteur.

Tous les messages visent l'acteur coordinateur dans `audience`. Leur émetteur
est le coordinateur, sauf `READY` et `REJECT`, réservés à un participant du
roster. Les commandes du coordinateur citent le dernier message journalisé ;
les `READY` citent le `PREPARE`, afin de pouvoir arriver dans un ordre différent.
Un rejet antérieur au `PREPARE` cite le dernier message connu. Les portées,
mission, conversation, workspace et identité d'incarnation du coordinateur
restent liées à la transition.

L'enveloppe porte la version d'organisation source avant `COMMIT`, et la version
cible pour les commandes postérieures à cette décision. Sa génération de
workspace reste distincte. L'autorité réelle de chaque message est vérifiée
par `authorize(message)`, avant toute transition puis à nouveau après les
callbacks asynchrones. Les entrées des callbacks sont profondément gelées.

## Vérification de la source et conservation

Le plan contient les snapshots source et cible complets, leurs versions, les
participants et le coordinateur, ainsi que les transferts de responsabilité
explicites. `verifyConservation(plan)` est appelé à la proposition, à la
préparation et juste avant le commit. Ce contrôle conserve les obligations,
preuves, dépendances, incertitudes, audiences et limites des permissions selon
le contrat de conservation du profil. Une topologie nouvelle ne change pas la
qualification des preuves ni les dépendances historiques des agents.

`verifyCheckpoint(request)` est appelé aux étapes `CHECKPOINT`, `PREPARE` et
`COMMIT`. La requête est
`{stage,transitionId,planDigest,scope,missionId,conversationId,plan,checkpointDigest}`,
avec `checkpointDigest = digest(plan.sourceSnapshot)`. Le callback doit consulter
la source réelle de confiance, confirmer sa version et son contenu exact,
l'exhaustivité des obligations et ressources, le roster autorisé et la
quiescence requise. Il doit aussi refuser une source devenue périmée entre les
étapes.

Le reçu attendu porte `status:"validated"`, `requestDigest:digest(request)`,
`checkpointDigest` et un `receiptDigest` SHA-256. La forme du reçu ne remplace
pas la consultation indépendante effectuée dans le callback.

Au `PREPARE`, la première source validée initialise la ligne autoritaire
`digest(scope) → (sourceVersion, sourceSnapshotDigest)`. La version représente
l'organisation dans la portée projet explicite de ce profil ; elle n'est pas
une génération globale commune à tous les projets. Une autre préparation
sur cette même portée exige exactement cette même source. Le `COMMIT` réalise
un compare-and-swap vers `(targetVersion, targetSnapshotDigest)` dans la même
transaction que la décision et le journal. Deux transitions concurrentes sur
la même version source et la même portée ne peuvent donc pas toutes deux
committer dans cette base. Deux projets d'une même organisation possèdent des
lignes autoritaires distinctes et peuvent évoluer indépendamment, conformément
au stockage des participants. Aucun projet implicite ni portée wildcard n'est
accepté pour la lecture d'une décision.

## Reçus des participants et lecture de décision

La requête de décision liée, notée `B`, contient
`{transitionId,planDigest,checkpointDigest,scope,missionId,conversationId,sourceVersion,targetVersion}`.
`decision(B)` retourne exactement
`{decision:"COMMIT"|"ABORT",...B,decisionDigest}`, où le digest est calculé sur
`{profile:"genos.morph.decision/v1",decision,...B}`. Un champ différent ou
manquant ne permet pas de lire une décision comme applicable à une autre
transition. Les méthodes de lecture restent destinées à un intégrateur de
confiance ; elles ne réalisent pas une authentification réseau.

Un reçu participant contient `{status,...B,participant,receiptDigest}`, avec
`status:"ready"` ou `"applied"`. Son digest porte sur
`{profile:"genos.morph.participant/receipt/v1",status,...B,participant}`.

Pour un `READY`, le payload indique `receiptDigest` et l'enveloppe identifie le
participant. `verifyReady({query:B,participant,receiptDigest})` doit retrouver
son reçu réellement préparé, par exemple dans sa base indépendante. Le
coordinateur compare l'ensemble du reçu et compte les participants uniques ;
plusieurs messages du même nœud ne remplacent pas un participant absent.

Pour `FINALIZE`, `verifyApplied({query:B,participant})` doit retrouver le reçu
d'application durable de chaque nœud. Les consultations sont indépendantes et
peuvent être concurrentes. Une réception de message ou une réponse de transport
ne suffit pas à fabriquer ce reçu. Un reçu absent, d'une autre portée ou d'une
autre transition empêche la finalisation.

## Abandon et récupération

`ABORT`, émis par le coordinateur, ou `REJECT`, émis par un participant avant la
décision, journalise une décision `ABORT`. La version d'organisation n'avance
pas. Après une décision `COMMIT`, aucun message ne peut la convertir en abandon
ou prétendre avoir restauré la source.

La décision `COMMIT` est persistée avant toute application par les participants.
Un arrêt du coordinateur, un participant inaccessible ou un accusé perdu peut
donc laisser `committed` sans que la transition soit globalement terminée. Le
coordinateur peut enregistrer `RECOVERY_REQUIRED` avec une raison explicite,
puis reprendre `FINALIZE` après vérification des applications manquantes. La
décision reste `COMMIT` durant cette récupération. Une tentative de
finalisation sans tous les reçus échoue et ne produit pas de faux état final.

La redélivrance exacte d'un message journalisé retourne son résultat initial.
Un identifiant ou une clé d'idempotence réutilisé avec un contenu différent
échoue. L'expiration est contrôlée à la réception et juste avant le commit ;
les changements concurrents de l'état lu provoquent un refus avec possibilité
de retry. La bibliothèque n'exécute pas de timer automatique de timeout :
l'intégrateur borne ses appels et déclenche l'abandon ou la récupération selon
la décision déjà présente.

## Limites et validation

Le profil fournit un point de décision durable unique et des interfaces
transport indépendantes. Il ne configure pas de réseau distribué, ne protège
pas des magasins externes qui ignorent ses décisions, et n'autorise pas le
commit P0 de morphogenèse de production. Les canaris, leases et gates existants
restent nécessaires à toute intégration qui produit des effets réels.

```text
node backend/tests/test_morph_protocol_coordinator.js
node backend/tests/test_morph_protocol_coordinator_races.js
```

Ces suites couvrent redémarrage, doublons, conflits, roster incomplet, reçus
mal liés, abandon avant commit, décision irrévocable, reprise de finalisation,
course READY/ABORT, révocation et expiration avant décision. Deux connexions
SQLite concurrentes vérifient qu'une seule transition peut committer la même
version d'organisation dans une portée donnée, tandis que deux projets d'une
même organisation peuvent committer des snapshots distincts. Les callbacks contrôlés de ces suites ne constituent
pas, à eux seuls, une preuve d'exécution distribuée.
