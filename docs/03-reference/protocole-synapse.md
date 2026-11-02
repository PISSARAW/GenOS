# Protocole SYNAPSE v1

- **Statut** : Profil expérimental Node ; contrat, codec natif, conversation durable et accusés implémentés
- **Portée** : Différences JSON bornées et communication compacte entre deux acteurs
- **Dernière revue** : 2026-11-02

Le [schéma commun](../../shared/synapseProtocol.v1.schema.json) définit
`genos.synapse/v1`. Le
[validateur](../../backend/src/services/synapseProtocol/contract.js) expose
`createMessage`, `validateMessage`, `validateContext`, `validateDelta`,
`validateRepresentation` et `validateState`.

## Enveloppe et messages

L'enveloppe reprend `messageId`, `operationId`, `missionId`, `conversationId`,
`sender`, `audience`, `scope`, `causalRefs`, `generations`, `authority`,
`idempotencyKey`, `createdAt`, `expiresAt`, `payloadDigest`, `payload`,
`protocol` et `type`. Les acteurs lient individu, incarnation et domaine de
confiance. Les générations d'incarnation, d'organisation et de workspace restent
distinctes de la génération de l'état partagé et de l'autorité.

Les dates futures, expirées ou non représentables sont rejetées. Les validateurs
acceptent `{ now }`, date ou millisecondes Unix. Les identifiants refusent les
blancs initiaux ou finaux. Une empreinte cohérente ne prouve pas l'autorité.

L'émetteur doit générer des `messageId` uniques entre missions et conversations.
Le journal de conversation impose leur unicité globale dans son fichier ;
les clés d'idempotence sont cloisonnées par portée, mission, conversation,
émetteur et audience. Réutiliser une clé avec un message différent produit un
conflit. Un replay renvoie le résultat historique, sans réappliquer le delta.

| Type | Payload strict |
| --- | --- |
| `DECLARE_CONTEXT` | `context` |
| `OFFER_DELTA` | `delta`, `representation` |
| `REQUEST_MISSING` | `deltaId`, `deltaDigest`, `missing`, `canonicalRequested` |
| `APPLY_DELTA` | `deltaId`, `deltaDigest`, `representation` |
| `ACK_STATE` | `deltaId`, `deltaDigest`, `resultDigest` |
| `ACK_FACT` | `ackId`, `deltaId`, `deltaDigest`, `dimension`, `subjectDigest`, `evidenceRef` |

`REQUEST_MISSING.missing` est une liste non vide de conditions manquantes.
Une offre déjà compatible peut être appliquée sans demande artificielle.
Chaque conversation doit contrôler l'ordre, la causalité, l'idempotence et les
droits en plus de la forme du message.

## Contexte engagé

| Champ | Signification |
| --- | --- |
| `contextId`, `domain` | Identité et domaine du contexte |
| `publisher`, `audience` | Acteur publiant et destinataire fixé ; un destinataire dans ce profil |
| `base.stateDigest`, `.generation` | Objet de départ et génération exacts |
| `schema.schemaId`, `.version`, `.digest` | Référence du schéma local attendu |
| `dictionary.snapshot`, `.digest` | Snapshot natif complet et son empreinte ; tous deux `null` si absent |
| `grounding` | Entrées natives de connaissances communes avec leur histoire |
| `dependencies` | Références `{dependencyId, digest}` uniques |

Le dictionnaire contient identité, participants, domaine, version, vocabulaire,
symboles, `commonGroundHash`, statut et expiration. Chaque symbole conserve
`semanticFingerprint`, `canonicalMeaning`, `payloadSchema` et confiance.
Le digest complet lie tous ces champs. Le hash natif seul ne suffit pas.

Le domaine et les participants du dictionnaire doivent correspondre au
contexte. Les incarnations et l'audience sont des bindings explicites ; une
transition d'organisation ne réécrit pas l'audience d'une publication antérieure.

Les histoires de connaissances communes peuvent avoir des dates ou références
de preuves différentes entre deux runtimes. La qualification compare les
conditions utiles de leur contrat ; elle ne fabrique pas une histoire commune.

## Delta et représentations

Le descripteur du delta contient `deltaId`, `contextDigest`, `baseDigest`,
`targetDigest` et `operationsDigest`. Ce dernier porte sur la liste canonique
des opérations normalisées, avec son ordre. Le digest du delta est calculé
sur ce descripteur, sans sa représentation.

Une représentation est soit :

```javascript
{ encoding: 'dialect', operations: [{ symbol: 'P', payload: { key: 'counter', value: 1 } }] }
```

soit :

```javascript
{ encoding: 'canonical', operations: [{ kind: 'put', key: 'counter', value: 1 }] }
```

Les opérations canoniques sont `put` avec `key` et `value`, ou `remove` avec
`key` seulement. Une clé ne reçoit qu'une opération par delta. Une suppression
vise une clé présente. Le profil borne les opérations à 64, les états à 128
clés et 1 Mio, les représentations à 2 Mio. Les clés dangereuses de prototype
et les valeurs non JSON sont rejetées.

Les digests utilisent la [canonicalisation EVIDENCE](protocole-evidence.md).
Les [vecteurs communs](../../shared/synapseProtocol.v1.vectors.json) ont des
empreintes calculées indépendamment en Python.

## Fallback et conditions manquantes

Le destinataire peut demander une représentation canonique si le dictionnaire
est absent, différent, expiré ou ne permet pas un décodage local autorisé.
Cette représentation doit satisfaire exactement le même `operationsDigest`
et produire exactement `targetDigest` à partir de la même base.

Elle ne contourne ni la base, ni le schéma local, ni les participants, ni
l'audience, ni les dépendances, ni les connaissances communes requises. Une
base modifiée exige une nouvelle déclaration et une nouvelle offre rebasée.
Un digest incohérent est rejeté ; il ne devient pas une invitation à deviner.

Les schémas et mappings configurés localement restent les seuls compilés et
exécutés. `payloadSchema` reçu dans un snapshot est une donnée à comparer,
jamais un nouveau validateur à installer.

## Accusés distincts

`ACK_FACT.dimension` vaut `transport_received`, `decoded`, `state_applied`,
`action_observed`, `independently_verified` ou `human_authorized`. Ces dimensions
ne forment pas une échelle et n'impliquent pas les autres. Le sujet peut être
lié par le digest de `{context, delta, receiver}` ; le reçu doit être confronté
à une preuve locale de la dimension annoncée.

Un accusé de compatibilité sémantique reste un accord opérationnel avec un
contrat. Il ne prouve pas une compréhension mentale. Une autorisation humaine
ne remplace pas un test, et un état appliqué ne prouve pas une action externe.

## Erreurs et validation

Les validateurs lèvent `SynapseProtocolError`, avec notamment
`SYNAPSE_JSON_INVALID`, `SYNAPSE_SCHEMA_INVALID`, `SYNAPSE_CONTEXT_INVALID`,
`SYNAPSE_STATE_INVALID`, `SYNAPSE_REPRESENTATION_INVALID`,
`SYNAPSE_TIME_INVALID`, `SYNAPSE_CLOCK_INVALID`, `SYNAPSE_EXPIRY_INVALID`,
`SYNAPSE_FUTURE`, `SYNAPSE_EXPIRED` ou `SYNAPSE_INTEGRITY`.
Le codec peut lever `SYNAPSE_DELTA_INVALID` pour un engagement incohérent.

Depuis la racine : `npm --prefix backend run test:synapse-protocol` lance les
sept fichiers de tests. Le contrat seul se lance avec
`node backend/tests/test_synapse_protocol_contract.js`.
Voir le [codec natif](synapse-contexte.md) et
l'[ADR](../adr/2026-11-02-protocole-synapse.md).
Le [démonstrateur entre processus](../06-qualite-preuves/synapse-processus-2026-11-02.md)
vérifie un dictionnaire divergent chez un seul destinataire, une coupure avant
livraison de l'accusé et un rebase explicite après changement de base.
Les [accusés distincts](synapse-accuses.md) conservent les preuves de chaque
dimension sans autorisation implicite d'action.
La [conversation durable](synapse-conversations.md) décrit le document réel,
son CAS, les enveloppes inversées et l'outbox persistée avec le changement.

Le contrat n'ajoute pas automatiquement un endpoint réseau, une extension A2A,
un interpréteur Rust ou un outil MCP. SYNAPSE/REFLEX, signaux réflexes et droit
d'agir associé restent hors de cette première implémentation.
