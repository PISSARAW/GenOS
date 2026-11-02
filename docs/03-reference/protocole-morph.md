# Protocole MORPH v1

- **Statut** : Profil expérimental ; contrat portable et validateur Node implémentés
- **Portée** : Transformation explicite d'une organisation et conservation de ses engagements
- **Dernière revue** : 2026-11-02

Le [schéma commun](../../shared/morphProtocol.v1.schema.json) définit
`genos.morph/v1`. Le
[validateur](../../backend/src/services/morphProtocol/contract.js) expose
`createMessage(fields, { now })`, `validateMessage(message, { now })`,
`validatePlan(plan)` et `validateSnapshot(snapshot)`. Ces méthodes contrôlent la
forme ; elles ne vérifient pas la conservation ni l'autorité réelle.

## Enveloppe

Chaque message contient `protocol`, `type`, `messageId`, `operationId`,
`missionId`, `conversationId`, `sender`, `audience`, `scope`, `causalRefs`,
`generations`, `authority`, `idempotencyKey`, `createdAt`, `expiresAt`,
`payloadDigest` et `payload`.

`sender` et `audience` sont des acteurs : `agentId`, `incarnationId`,
`trustDomain`. `scope` contient `organizationId` et `projectId`. Les générations
`incarnation`, `organization` et `workspace` sont trois entiers distincts,
positifs ou nuls et représentables exactement. `authority` contient
`authorityId` et `generation` ; ce sont des déclarations à confronter au contexte
authentifié du récepteur.

Les identifiants refusent les blancs initiaux et finaux. Les dates RFC 3339
doivent être représentables par le runtime ; les secondes intercalaires non
prises en charge sont rejetées. La création ne peut pas être future et
l'expiration doit suivre la création et l'horloge courante. `now` accepte une
date ou des millisecondes Unix.

La canonicalisation et les empreintes SHA-256 réutilisent
[EVIDENCE](protocole-evidence.md). Les
[vecteurs communs](../../shared/morphProtocol.v1.vectors.json) portent des
empreintes calculées indépendamment en Python. Une empreinte cohérente ne
prouve ni l'identité, ni l'autorité, ni la vérité du snapshot annoncé.

## Messages

Les payloads et les objets du plan sont stricts : un champ structurel
supplémentaire est rejeté.

| Type | Payload |
| --- | --- |
| `PROPOSE` | `plan` |
| `QUIESCE`, `CHECKPOINT`, `PREPARE`, `COMMIT`, `ABORT`, `FINALIZE` | `transitionId`, `planDigest` |
| `READY` | `transitionId`, `planDigest`, `receiptDigest` |
| `REJECT`, `RECOVERY_REQUIRED` | `transitionId`, `planDigest`, `reason` |

Le profil du coordinateur utilise son acteur comme audience. Les intentions
de changement émanent du coordinateur ; les réponses de préparation émanent
des participants. Les reçus doivent être vérifiés à partir de leur contenu
exact et de l'état durable, jamais de leur seule empreinte annoncée.

La conversation nominale est
`PROPOSE → QUIESCE → CHECKPOINT → PREPARE → READY → COMMIT → FINALIZE`.
Une décision de commit et son application sur chaque participant restent des
états distincts. Un échec après un effet potentiellement appliqué exige une
récupération explicite ; un `ABORT` ne prouve pas une compensation.

## Plan complet

| Champ | Contenu |
| --- | --- |
| `transitionId` | Identifiant de la transformation |
| `sourceVersion`, `targetVersion` | Versions d'organisation avant et après |
| `participants` | Roster fixé des acteurs des nœuds d'exécution à acquitter |
| `coordinator` | Acteur responsable de la coordination |
| `sourceSnapshot`, `targetSnapshot` | États complets à comparer |
| `transfers` | Changements explicites de responsable |

Un transfert contient `kind`, `id`, `from` et `to`. `kind` vaut `tasks`,
`obligations`, `permissions`, `budgets` ou `unknownEffects`. Les acteurs `from`
et `to` désignent le propriétaire avant et après ; l'identifiant désigne
l'élément précis de la collection.

Les participants représentent des nœuds d'exécution, tandis que `members`
représente des membres logiques. Plusieurs membres peuvent être hébergés sur
un nœud. Le roster ne se déduit donc pas de l'union des membres. L'autoriseur
et le vérificateur de checkpoint doivent établir que les participants fixés
correspondent aux nœuds réels couvrant tous les membres concernés.

## Snapshots

Chaque snapshot possède toutes les collections suivantes, y compris lorsqu'une
collection est vide. `content` est un objet JSON complet de l'application,
conservé sans réinterprétation par le contrôle sémantique. Le vérificateur
autoritatif doit établir que la source n'omet aucun élément réel.

| Champ | Structure d'un élément |
| --- | --- |
| `topology` | `a_team`, `biocenose`, `biome`, `holobionte`, `metapopulation`, `rhizome`, `syncytium` ou `trinity` |
| `members` | Acteurs logiques ; au moins un |
| `tasks` | `taskId`, `owner`, `content` |
| `obligations` | `obligationId`, `owner`, `requirements`, `content` |
| `permissions` | `grantId`, `holder`, `resources`, `actions`, `conditions` |
| `budgets` | `budgetId`, `owner`, `unit`, `limit`, `spent`, `reserved` |
| `claims` | `claimId`, `content` |
| `evidence` | `evidenceId`, `content` |
| `provenance` | `agentId`, `content` |
| `dependencies` | `dependencyId`, `content` |
| `audiences` | `messageId`, `recipients` (acteurs), `contentDigest` |
| `uncertainties` | `uncertaintyId`, `content` |
| `questions` | `questionId`, `content` |
| `unknownEffects` | `effectId`, `owner`, `content` |

`owner` et `holder` sont des acteurs. `requirements`, `resources` et `actions`
sont des listes de références uniques. `conditions` conserve les restrictions
du grant, par exemple échéance, tenant et génération de ressource. Les montants
de budget sont des entiers non négatifs ; leurs unités doivent être explicites.
Le contenu d'une affirmation porte notamment son objet exact, son prédicat,
son domaine et ses limites ; le contenu d'une preuve conserve sa qualification,
son origine et les conditions de sa vérification.

## Forme, conservation et autorité

`validatePlan` peut accepter deux versions de forme correcte qui ne se suivent
pas. Il ne constitue donc pas un gate de promotion. Le
[contrôle de conservation](morph-conservation.md) impose la version suivante,
les propriétaires et toutes les garanties sémantiques. Les callbacks de
confiance doivent en plus vérifier la source réelle, la couverture des nœuds,
les droits et les reçus. La séparation évite de confondre parsing et décision.

## Erreurs et validation

Le validateur lève `MorphProtocolError` avec un code stable :
`MORPH_JSON_INVALID`, `MORPH_SCHEMA_INVALID`, `MORPH_TIME_INVALID`,
`MORPH_CLOCK_INVALID`, `MORPH_EXPIRY_INVALID`, `MORPH_FUTURE`, `MORPH_EXPIRED`
ou `MORPH_INTEGRITY`. Il faut corriger le contrat, l'horloge ou les données
exactes avant de reprendre ; une erreur ne constitue jamais un reçu réussi.
Les clés d'idempotence ne doivent pas être réutilisées avec un autre contenu.

Depuis la racine : `node backend/tests/test_morph_protocol_contract.js`.

Ce contrat n'active pas la morphogenèse P0 existante, ses canaris ou ses
mutations de production. Il n'ajoute pas automatiquement un transport réseau,
un endpoint HTTP, un outil MCP, une extension A2A ou une implémentation Rust.
Voir l'[ADR](../adr/2026-11-02-protocole-morph.md).
