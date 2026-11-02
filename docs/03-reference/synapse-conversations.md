# SYNAPSE — Conversations et application durable des différences

- **Statut** : Profil Node intégrable sur états JSON et tables de communication natives.
- **Dernière revue** : 2026-11-02

## API locale et ressource réelle

`SynapseConversation`, exportée par
`backend/src/services/synapseProtocol/conversation.js`, reçoit
`{dbPath,actor,incarnationGeneration,authority,authorize,localContext,codec,clock}`.
L'acteur, sa génération d'incarnation et son autorité viennent de la
configuration locale de confiance. Ils ne sont pas hérités des messages reçus.
Les callbacks d'autorisation et de contexte sont obligatoires.

`codec` est une factory locale recevant la connexion SQLite, par exemple
`db => createContextCodec({db,schema,operations,...})`. Il doit partager
exactement `runtime.db` avec le service. Les appels utilisent le même
`withTransaction` asynchrone que les services de communication natifs.

La requête de document est
`{scope,missionId,conversationId,contextId}`. La ressource JSON est indexée par
`scope + missionId + contextId`, indépendamment de la conversation. Une nouvelle
conversation référence donc le même artefact et sa génération courante ; elle
ne crée pas une copie qui masquerait une modification de la base.

| Méthode | Résultat |
| --- | --- |
| `initialize(query,{value,generation})` | Initialise une ressource locale depuis une source de confiance ; refuse une ressource déjà existante |
| `replaceState(query,{expectedGeneration,value})` | Remplacement local explicite par CAS ; incrémente la génération |
| `state(query)` | État réel `{value,stateDigest,generation}`, ou `null` |
| `captureContext(query)` | Descripteur capturé depuis cet état et les tables natives installées |
| `apply(message)` | Journalise une émission locale ou traite un message destiné à l'acteur local |
| `outbox(query)` | Enveloppes de réponse persistées, à acheminer explicitement |
| `status(deltaQuery)` | État du dialogue concernant la différence exacte |
| `receipt(deltaQuery)` | Reçu d'application locale réellement committé, ou `null` |
| `subject(deltaQuery)` | Sujet exact `{context,delta,receiver}` pour les contrôles d'accusés |
| `close()` | Ferme la connexion SQLite |

La requête `deltaQuery` est
`{scope,missionId,conversationId,deltaId,deltaDigest}`. Les lectures et mutations
sont toutes soumises à `authorize({operation,request})`. Les opérations sont
`INITIALIZE`, `REPLACE_STATE`, `CAPTURE_CONTEXT`, `APPLY`, `STATE`, `STATUS`,
`RECEIPT`, `SUBJECT` et `OUTBOX`. Ce callback doit authentifier l'appelant et
imposer ses droits sur la portée demandée. Les méthodes d'initialisation et de
remplacement sont des opérations locales d'administration ; aucun message du
protocole ne les déclenche automatiquement.

## Contexte installé et différence proposée

`localContext({query,state})` reçoit la photographie SQLite
`state={value,stateDigest,generation}`. Il retourne l'entrée du codec natif :
`{contextId,dialectId,domain,publisher,audience,state:state.value,generation:state.generation,dependencies}`.
Le service refuse un provider qui prétend décrire un autre contenu ou une autre
génération que ceux de cette photographie.

Le codec capture réellement le dialecte complet et les connaissances communes
via `dialectService` et `commonGroundService`. Le descripteur reçu lie la base,
le schéma local, le dictionnaire, l'audience et les dépendances. Le service ne
crée ni schéma, ni symbole, ni connaissance commune à partir d'un descripteur
distant. Leur installation relève de l'opérateur local.

La différence est un engagement immuable
`{deltaId,contextDigest,baseDigest,targetDigest,operationsDigest}`. La
représentation est séparée : soit des symboles de dialecte et leurs payloads,
soit les opérations canoniques explicites `put` et `remove`. Dans les deux cas,
les opérations normalisées doivent correspondre exactement à `operationsDigest`.
Le JSON calculé doit satisfaire le schéma installé et avoir `targetDigest`.

## Phases, demandes et causalité

Le dialogue suit `DECLARE_CONTEXT → OFFER_DELTA → APPLY_DELTA → ACK_STATE`.
Une `REQUEST_MISSING` s'intercale lorsqu'un élément manque ; aucune demande
vide n'est inventée lorsque l'offre est déjà compatible.

Les enveloppes `DECLARE_CONTEXT`, `OFFER_DELTA` et `APPLY_DELTA` vont du publisher
au receveur déclaré. `REQUEST_MISSING` et `ACK_STATE` inversent ces identités et
utilisent l'autorité et la génération locales du receveur. La portée, la mission,
la conversation, l'organisation et le workspace restent liés au dialogue.

`OFFER_DELTA` cite la déclaration. Sans élément manquant, `APPLY_DELTA` cite
l'offre ; sinon il cite la dernière demande reçue. Une demande créée après
un refus d'application cite cet `APPLY_DELTA`. L'accusé `ACK_STATE` cite
l'application dont il rapporte le résultat.

L'émetteur journalise ses propres offres et applications comme des messages
envoyés ; il ne prétend pas avoir appliqué localement son message destiné à un
autre acteur. Le receveur applique le changement à sa vraie ressource SQLite.
Le publisher qui reçoit `ACK_STATE` conserve une déclaration de son pair : ce
message ne lui crée pas un reçu d'application locale et ne remplace pas la
consultation de confiance du reçu réel du receveur.

## Compatibilité et représentation canonique

Une différence de dictionnaire provoque une réponse durable
`REQUEST_MISSING` avec `missing:["dictionary"]` et `canonicalRequested:true`.
Le publisher peut alors renvoyer le même descripteur de différence avec une
représentation canonique. Le receveur utilise les opérations explicites et ne
remplace pas son dictionnaire par celui du publisher.

La forme canonique contourne seulement l'absence ou la divergence du dialecte.
Elle ne contourne jamais une base, une génération, un schéma, une audience,
une dépendance ou une connaissance commune devenue incompatible. Ces écarts
produisent une demande explicite et laissent le JSON inchangé.

Une base différente exige un rebase explicite de la ressource locale ou une
nouvelle proposition correctement fondée. L'opérateur peut utiliser
`replaceState` avec la génération attendue, puis déclarer un nouveau contexte
dans une nouvelle conversation. La ressource reste celle du même `contextId`.
Le profil initial borne chaque dialogue à une différence liée à son contexte.

## Transaction, reprise et outbox

L'application relit l'état, le contexte installé et l'autorisation après
l'acquisition du mutex SQLite. La qualification consulte les tables natives,
rafraîchit le provider local, vérifie l'autorisation après ces attentes, puis
recapture et décode encore les tables natives avant toute écriture.
Le JSON réel, sa nouvelle génération, l'historique, le message reçu, le reçu
d'application et l'outbox `ACK_STATE` sont conservés atomiquement.

Un refus ou une erreur de journalisation annule l'ensemble de ces écritures.
Une coupure après commit mais avant livraison de l'accusé conserve le JSON,
le reçu et l'enveloppe dans l'outbox. Après redémarrage, le parent peut
redélivrer cette enveloppe. Le protocole n'expédie lui-même aucun message réseau.

Les identifiants de messages sont uniques dans la base et doivent être générés
en conséquence par le client. Les clés d'idempotence sont liées à la portée,
la mission, la conversation et aux deux identités. Une redélivrance exacte
retrouve le résultat déjà journalisé sans réappliquer le changement ; un contenu
différent sous un identifiant existant échoue. Deux appels concurrents identiques
ne produisent qu'une génération et qu'un accusé dans l'outbox.

## Reçu d'application et dimensions des accusés

Le reçu exact porte
`{status:"applied",scope,missionId,conversationId,deltaId,deltaDigest,contextId,contextDigest,baseDigest,resultDigest,previousGeneration,generation,appliedMessageId,receiver}`.
Son `receiptDigest` est le digest de
`{profile:"genos.synapse.state-receipt/v1",...body}`. La génération est exactement
la génération de base plus un. Le getter vérifie aussi la correspondance avec
l'historique JSON effectivement écrit dans la même transaction.

Ce reçu établit l'application locale de cette différence à ce moment de
l'histoire. Il ne prétend pas que cette génération est encore la génération
courante après un changement ultérieur. Les observations de décodage conservées
avec le dialogue lient le contexte et les opérations normalisées réellement
contrôlées ; elles n'accordent aucune permission d'action.

La réception, le décodage, l'application, une action externe, une vérification
indépendante et une autorisation humaine restent des dimensions distinctes.
Le registre d'accusés les contrôle par des providers explicites. La conversation
ne leur attribue aucun rang et ne transforme pas automatiquement `ACK_STATE`
en vérification indépendante ou en consentement humain.

## Frontières des providers et validation

Les callbacks `localContext` et `authorize` doivent être des lectures ou décisions
sans mutation du contexte ni des droits qu'ils évaluent. Les configurations et
dépendances hors base doivent rester stables pendant la transaction, ou partager
une génération de source et le même mutex avec leurs opérations de modification.
Un changement de configuration est une opération locale explicite distincte.
Le mutex ne rend pas atomiques les effets de bord arbitraires de deux providers
asynchrones indépendants. Les tables natives de dictionnaire et de connaissances
communes sont, elles, relues après l'autorisation dans la transaction partagée.

La bibliothèque n'installe pas de transport, de signature ou de contrôle
d'accès réseau. `runtime.db` et le store sont des interfaces administratives de
confiance, pas des endpoints exposables directement. Le profil initial applique
un état JSON borné ; il ne déclenche aucun réflexe ni effet externe.

```text
node backend/tests/test_synapse_conversation.js
node backend/tests/test_synapse_conversation_races.js
```

Les suites utilisent deux bases et deux registres natifs distincts. Elles
vérifient l'application réelle, le fallback canonique, le refus d'une base ou
d'un grounding périmé, la reprise de l'outbox, les conflits, la portée, les
révocations, les changements de dictionnaire pendant l'autorisation et l'attente
du mutex, l'expiration et le rollback atomique du JSON et des reçus.
