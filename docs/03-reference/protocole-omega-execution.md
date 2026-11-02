# Protocole OMEGA Execution v1

- **Statut** : Profil expérimental ; contrat Node et admission durable implémentés
- **Portée** : Exécution bornée de vrais programmes G-CIR Ω
- **Dernière revue** : 2026-11-02

Le [schéma commun](../../shared/omegaExecutionProtocol.v1.schema.json) décrit
`genos.omega.execution/v1`. Le programme transporté conserve son propre format
`genos.gcir.omega/v1` et sa version 1. Le
[validateur](../../backend/src/services/omegaProtocol/contract.js) expose
`createMessage`, `validateMessage`, `validateProgram`, `validateCapabilities`
et `validateSubmission`.

## Enveloppe et messages

L'enveloppe reprend les champs de la famille : `messageId`, `operationId`,
`missionId`, `conversationId`, `sender`, `audience`, `scope`, `causalRefs`,
`generations`, `authority`, `idempotencyKey`, `createdAt`, `expiresAt`,
`payloadDigest`, `payload`, `protocol` et `type`.

Les acteurs sont identifiés par `agentId`, `incarnationId` et `trustDomain`.
La portée contient `organizationId` et `projectId`. Les générations
d'incarnation, d'organisation et de workspace demeurent distinctes de la
génération d'autorité et de la génération du runtime. Les identifiants
refusent les blancs initiaux ou finaux. Les dates futures, expirées ou non
représentables sont rejetées, y compris les secondes intercalaires non prises
en charge. Les validateurs acceptent `{ now }`, date ou millisecondes Unix.

| Type | Payload strict |
| --- | --- |
| `DESCRIBE_RUNTIME` | `runtimeId` |
| `SUBMIT_PROGRAM` | `submission` |
| `ACCEPT_PLAN` | `planId`, `planDigest` |
| `EXECUTE`, `RESUME`, `REPORT_OBLIGATIONS` | `runId`, `planId`, `planDigest`, `baseDigest`, `environmentDigest` |
| `REQUEST_EFFECT` | `effect` |
| `AUTHORIZE_EFFECT`, `RECONCILE_EFFECT` | `effectKey` |
| `EFFECT_RECEIPT` | `effectKey`, `receiptDigest` |
| `EFFECT_OUTCOME_UNKNOWN` | `effectKey`, `reason` |

Un reçu de transport ne devient ni une obligation satisfaite, ni une preuve,
ni un effet appliqué. Les erreurs et les issues inconnues restent des états
explicites de la conversation.

## Programme réel et requêtes bornées

`validateProgram` utilise `cognitiveOmegaInteropService.validate` puis `read`.
Le profil exige une représentation canonique v1, des identifiants d'opération
compatibles avec le registre existant, une référence explicite, des dépendances
uniques et `state: 'open'` pour toutes les opérations. Il exige exactement une
requête pour chaque opération dans `program.payload.requests`.

| Opération | Requête autorisée |
| --- | --- |
| `READ` | `objectId` |
| `SELECT` | `fields`, liste de champs uniques |
| `CHECK` | `predicate`, référence ou description bornée du prédicat |
| `INFER` | `instruction`, chaîne bornée |
| `CALL`, `EMIT` | `resourceId`, `action`, `cost`, entier non négatif |

Le payload ne peut pas contenir `handlers`, `results`, `objects` ou un reçu
préfabriqué. Une requête `CHECK` décrit ce qui doit être vérifié ; elle ne
déclare pas le résultat du test. Les lectures, sélections et vérifications
sont réalisées par des handlers installés localement, sous autorisation.
Un chemin ou une expression reçue ne doit pas être exécuté aveuglément.

`program.policy` reste la liste native des références autorisées par kind
(`read`, `select`, `call`, `infer`, `check`, `emit`). La présence d'un handler
ne permet pas d'ignorer un refus dans cette politique.

L'empreinte du programme est calculée par `cognitiveOmegaInteropService.digest`
sur son vrai MessagePack. L'empreinte d'un plan ou d'un payload utilise la
[canonicalisation JSON EVIDENCE](protocole-evidence.md). Ces deux empreintes
ne sont pas interchangeables. Les
[vecteurs du profil](../../shared/omegaExecutionProtocol.v1.vectors.json)
complètent les vecteurs existants du codec.

## Capacités et soumission

Les capacités sont obtenues par `describeRuntime`, callback de confiance du
runtime, jamais reprises depuis les données du demandeur. Elles contiennent :

| Champ | Signification |
| --- | --- |
| `runtimeId`, `generation` | Runtime et génération de son registre effectif |
| `domains` | Domaines effectivement disponibles |
| `operations` | Descripteurs uniques `{kind, references}` installés |
| `verifierRefs` | Vérificateurs réellement disponibles |
| `effectGuarantees` | Garanties effectivement fournies par les adaptateurs |
| `maxOperations` | Capacité annoncée entre 1 et 64 opérations |

Une `submission` contient `planId`, `program`, `domain`, `policy`
(`policyId`, `version`), `baseDigest`, `environmentDigest`, `requirements`
(`verifierRefs`, `effectGuarantees`) et `budget` (`unit`, `limit`, `spent`,
`reserved`). Ce budget est une déclaration à vérifier à la source autoritative,
pas un droit de dépenser accordé par le demandeur.

L'admission refuse une référence absente, une permission native manquante, un
domaine indisponible, un vérificateur absent ou une garantie requise manquante.
Pour `CALL` ou `EMIT`, elle exige au minimum `durable_intent`, `idempotency`,
`reconciliation` et `fencing`, même si le demandeur omet ces exigences.

Ces garanties ne peuvent être annoncées pour un handler arbitraire. Le profil
de ressource protégée doit réellement conserver l'intention, dédupliquer,
permettre la réconciliation et contrôler l'autorité au point d'effet. Un autre
adaptateur doit prouver ses propres garanties avant d'être annoncé compatible.

## Requête d'effet

`effect` lie `effectKey`, la portée, la mission, la conversation, le run, le
plan, le programme, les capacités, la politique, le runtime et sa génération,
`stepId`, `kind`, `reference`, la base, l'environnement, les trois générations,
l'acteur, l'autorité, `resourceId`, `action`, `cost`, le candidat et son
empreinte, `proofReceipt`, le budget et `expiresAt`.

`proofReceipt` vaut un objet JSON ou `null` ; sa présence ne prouve pas sa
validité. Le gate doit consulter la preuve indépendante et confronter l'effet
au plan accepté, à l'état autoritatif, au tarif et à l'autorité courante.
La clé est dérivée de l'objet canonique
`{scope, missionId, conversationId, runId, planDigest, stepId}`.
Une issue inconnue exige une réconciliation sur cette même clé avant reprise.

## Erreurs, validation et limites

Le validateur lève `OmegaProtocolError`, avec notamment
`OMEGA_JSON_INVALID`, `OMEGA_SCHEMA_INVALID`, `OMEGA_PROGRAM_INVALID`,
`OMEGA_CAPABILITIES_INVALID`, `OMEGA_BUDGET_INVALID`, `OMEGA_TIME_INVALID`,
`OMEGA_CLOCK_INVALID`, `OMEGA_EXPIRY_INVALID`, `OMEGA_FUTURE`, `OMEGA_EXPIRED`
et `OMEGA_INTEGRITY`. Une erreur n'accorde aucun droit et ne permet pas de
modifier le contenu sous une clé d'idempotence déjà utilisée.

Depuis la racine : `node backend/tests/test_omega_protocol_contract.js`.
Le test utilise le vrai codec et rejette les résultats préfabriqués, les
requêtes mal typées, les opérations présatisfaites et les divergences du contrat.

La suite complète se lance avec `npm --prefix backend run test:omega-protocol`.
Le [bridge natif](omega-execution-durable.md) et le
[gate des effets](omega-effets.md) décrivent l'exécution et la réconciliation.
Le [démonstrateur entre processus](../06-qualite-preuves/omega-execution-processus-2026-11-02.md)
interrompt l'exécuteur entre effet externe et reçu local, puis vérifie la
reprise sans duplication ni nouvelle inférence.

Ce profil est plus restrictif que le codec historique. Il ne revendique pas
l'exécution distante de tout programme décodable, une disponibilité universelle
des domaines, une extension A2A ou une implémentation Rust de la nouvelle
conversation. Voir l'[admission](omega-admission.md) et
l'[ADR](../adr/2026-11-02-protocole-omega-execution.md).
