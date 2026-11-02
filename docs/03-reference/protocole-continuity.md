# Protocole CONTINUITY v1

- **Statut** : Profil expérimental ; contrat JSON et validateur Node implémentés
- **Portée** : Reconnaissance d'identité et transfert explicite de responsabilité
- **Dernière revue** : 2026-11-02

Le [schéma commun](../../shared/continuityProtocol.v1.schema.json) décrit
`genos.continuity/v1`. Le
[validateur](../../backend/src/services/continuityProtocol/contract.js) expose
`createMessage(fields, { now })`, `validateMessage(message, { now })`,
`validateIdentity(identity)` et `validateBundle(bundle)`.

## Identifiants et enveloppe

| Identifiant | Signification |
| --- | --- |
| `agentId` | Individu logique |
| `incarnationId` | Activation déterminée de cet individu |
| `missionId` | Travail et engagements susceptibles de survivre à l'activation |
| `branchId` | Trajectoire de travail |
| `authority.authorityId`, `.generation` | Référence et génération d'autorité déclarées |

Une `identity` contient `agentId`, `incarnationId`, `missionId`, `branchId`,
`trustDomain` et `historyDigest`. Un `actor` contient seulement `agentId`,
`incarnationId` et `trustDomain`. Une identité ne contient aucune permission.

L'enveloppe comporte `messageId`, `operationId`, `missionId`, `conversationId`,
`sender` et `audience` (actors), `scope` (`organizationId`, `projectId`),
`causalRefs`, `generations` (`incarnation`, `organization`, `workspace`),
`authority`, `idempotencyKey`, `createdAt`, `expiresAt`, `payloadDigest`, `payload`
et `type`. Les générations sont des entiers non négatifs représentables
exactement, et restent distinctes des identifiants de branche et d'incarnation.

Les identifiants n'admettent aucun blanc initial ou final. Les dates doivent
être représentables par le runtime ; les secondes intercalaires non prises en
charge sont rejetées. La création ne peut pas être future et l'expiration doit
être postérieure à la création et à l'horloge courante. `now` accepte une date
RFC 3339 ou des millisecondes Unix.

L'empreinte SHA-256 du payload réutilise la
[canonicalisation EVIDENCE](protocole-evidence.md). Les
[vecteurs](../../shared/continuityProtocol.v1.vectors.json) permettent de
vérifier une implémentation indépendante. Ils ne prouvent pas l'identité ni
l'autorité de l'émetteur.

## Messages

Tous les payloads sont stricts : les champs supplémentaires sont rejetés.

| Type | Payload obligatoire |
| --- | --- |
| `PRESENT` | `identity`, `predecessor`, `relation` |
| `CHALLENGE` | `presentationMessageId`, `nonce`, `challengeExpiresAt` |
| `ATTEST` | `challengeMessageId`, `nonce`, `presentationDigest`, `proof` |
| `CONTINUITY_PROOF` | `attestationMessageId`, `proofDigest` |
| `OFFER_HANDOFF` | `transferId`, `source`, `successor`, `bundle`, `authority` |
| `SEAL_CHECKPOINT` | `transferId`, `bundleDigest` |
| `ACCEPT_RESPONSIBILITY` | `transferId`, `bundleDigest` |
| `ACTIVATE_SUCCESSOR` | `transferId`, `bundleDigest` |
| `ABORT_HANDOFF` | `transferId`, `bundleDigest`, `reason` |

`nonce` contient 64 chiffres hexadécimaux minuscules. `proof` contient `proofId`
et `proofDigest`. Le défi et la preuve doivent être liés à la présentation,
à l'audience, à la portée et à l'incarnation par le vérificateur de confiance.
Le schéma ne remplace pas cette vérification.

`relation` distingue `continuation`, `fork`, `succession` et `restore`. La
continuation et la restauration conservent l'individu logique, avec une nouvelle
incarnation ; le fork et la succession désignent un nouvel individu. Ces
relations ne donnent aucune autorité par elles-mêmes. La restauration doit
conserver l'histoire intermédiaire.

## Bundle et autorité

`OFFER_HANDOFF.authority` contient `previousGeneration` et `newGeneration`,
distinctes de l'autorité déclarée de l'enveloppe. Le récepteur doit comparer
les deux à l'état courant des ressources protégées.

| Champ du bundle | Contenu |
| --- | --- |
| `checkpoint` | `checkpointId`, `digest`, `sourceHistoryDigest` |
| `obligations` | Objets `obligationId`, `owner` (actor), `evidenceRefs` |
| `evidenceRefs` | Références des preuves acquises |
| `permissions` | Ensemble explicite de ressources autorisées |
| `budget` | `unit`, `limit`, `spent`, `reserved` en entiers non négatifs |
| `unknownEffects` | Objets `effectId`, `owner` (actor), `description`, `reference` |

Les propriétaires du bundle désignent la destination proposée ; elle doit
accepter explicitement cette responsabilité. Le checkpoint porte l'empreinte
de l'histoire source. Aucun reçu de livraison ne prouve le transfert effectif
d'autorité. Le destinataire vérifie notamment l'absence de budget ou de droits
créés implicitement et la conservation des obligations.

Le validateur rejette les `obligationId` et `effectId` dupliqués ainsi que les
budgets pour lesquels `spent + reserved` dépasse `limit`, y compris dans un
message `OFFER_HANDOFF`. Les preuves de checkpoint doivent lier toute la requête
vérifiée, notamment la portée, les acteurs et le bundle complet.
Les preuves référencées par chaque obligation doivent figurer dans l'inventaire
`bundle.evidenceRefs` ; cette cohérence locale ne vérifie pas leur existence.

Une annulation après un effet d'activation incertain ne peut pas effacer cet
effet. La conversation doit réclamer une récupération ou une réconciliation
avec l'autorité de la ressource avant de continuer.

## Erreurs et reprise

Les validateurs lèvent `ContinuityProtocolError` avec un `code` stable.

| Code | Reprise |
| --- | --- |
| `CONTINUITY_JSON_INVALID` | Corriger une valeur non JSON |
| `CONTINUITY_SCHEMA_INVALID` | Corriger le contrat ou négocier une version compatible |
| `CONTINUITY_TIME_INVALID` | Corriger une date non représentable |
| `CONTINUITY_CLOCK_INVALID` | Corriger l'horloge injectée |
| `CONTINUITY_EXPIRY_INVALID` | Émettre un message avec une fenêtre valide |
| `CONTINUITY_FUTURE` | Vérifier la synchronisation des horloges |
| `CONTINUITY_EXPIRED` | Reprendre la conversation et obtenir un nouveau défi |
| `CONTINUITY_INTEGRITY` | Récupérer le contenu exact, sans réutiliser une clé conflictuelle |
| `CONTINUITY_BUNDLE_INVALID` | Corriger les identifiants dupliqués ou le budget incohérent |

Le validateur contrôle la forme et l'intégrité. Les conversations doivent
contrôler la causalité, l'idempotence, les transitions autorisées, la fraîcheur
des autorités et la conservation des engagements. Une reconnexion ne doit
jamais réactiver implicitement une ancienne incarnation.

## Validation et limites

La suite complète se lance avec `npm --prefix backend run test:continuity-protocol`.
Les références décrivent la [reconnaissance durable](continuity-identite.md),
le [transfert de responsabilité](continuity-transfert.md) et le
[contrôle d'autorité sur la ressource](continuity-autorite.md).
Le [démonstrateur à trois processus](../06-qualite-preuves/continuity-migration-processus-2026-11-02.md)
copie un état scellé, interrompt l'activation et vérifie le refus de l'ancienne
incarnation après reconnexion.

Depuis la racine : `node backend/tests/test_continuity_protocol_contract.js`.
Le test couvre les neuf messages, leurs payloads, les identifiants, les dates,
les empreintes et les vecteurs communs.

Ce contrat n'ajoute pas automatiquement un endpoint HTTP, une identité
cryptographique, une extension A2A, un outil MCP ou une implémentation Rust.
Les décisions d'autorité doivent continuer de passer par les gates existants.
Voir l'[ADR](../adr/2026-11-02-protocole-continuity.md).
