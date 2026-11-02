# Protocole EVIDENCE v1

- **Statut** : Profil expérimental ; contrat et validateur Node implémentés
- **Portée** : Affirmations liées à un objet exact, conversations et révisions
- **Dernière revue** : 2026-11-02

Le protocole porte les conditions sous lesquelles une conclusion peut être
utilisée. La réussite d'un transport et l'existence d'une empreinte ne prouvent
pas la conclusion. La politique, l'autorité et les preuves doivent être évaluées
par le destinataire dans son propre contexte.

## Contrat commun

Le [schéma JSON](../../shared/evidenceProtocol.v1.schema.json) définit
`genos.evidence/v1`. Le
[validateur Node](../../backend/src/services/evidenceProtocol/contract.js)
expose `createMessage(fields, options)`, `validateMessage(message, options)` et
`validateClaim(claim)`. Une entrée invalide lève une erreur et ne produit pas
d'acceptation implicite. Les validateurs retournent une copie JSON détachée.

| Champ | Signification |
| --- | --- |
| `protocol`, `type` | Version exacte et opération connue |
| `messageId`, `operationId` | Identité de livraison et opération logique |
| `missionId`, `conversationId` | Mission et conversation |
| `sender.agentId`, `sender.incarnationId`, `sender.trustDomain` | Identité déclarée et frontière de confiance |
| `scope.organizationId`, `scope.projectId` | Portée de l'opération |
| `causalRefs` | Références des messages antérieurs |
| `generations.incarnation`, `.organization`, `.workspace` | Trois générations distinctes |
| `authority.authorityId`, `.generation` | Référence et génération d'autorité déclarées |
| `idempotencyKey` | Identité stable pour une reprise sans réapplication |
| `createdAt`, `expiresAt` | Dates RFC 3339 ; expiration strictement postérieure |
| `payloadDigest`, `payload` | Empreinte SHA-256 canonique et contenu |

Les identifiants sont des chaînes non vides, sans espace blanc initial ou final ;
les espaces internes restent autorisés. Les générations sont des entiers
positifs ou nuls représentables exactement en JavaScript. Le validateur rejette
les versions inconnues, les champs d'enveloppe supplémentaires, une empreinte
différente, une date de création future et une expiration atteinte. `options.now`
permet d'injecter une horloge en millisecondes Unix ou chaîne RFC 3339.

Le validateur de forme ne contrôle pas les droits réels de `sender` ou
`authority`. Un récepteur doit les confronter au contexte authentifié, aux
générations courantes et à sa politique. Il doit distinguer un doublon exact
d'une réutilisation conflictuelle de clé ; l'expiration ne permet jamais de
réappliquer un ancien effet.

## Affirmation

Chaque opération transporte un payload strict, sans champ supplémentaire.

| Opérations | Champs obligatoires du payload |
| --- | --- |
| `ASSERT` | `claim` |
| `REQUEST_EVIDENCE`, `VERIFY`, `ACCEPT_UNDER_POLICY`, `CHALLENGE`, `RETRACT` | `claimId` |
| `COUNTEREXAMPLE` | `claimId`, `counterexampleResultId`, `domainFingerprint` |
| `INVALIDATE_DEPENDENTS`, `ACK_APPLIED` | `claimId`, `revisionMessageId` |

Le récepteur vérifie ensuite la transition, la causalité et les droits effectifs.

| Champ de `claim` | Contenu |
| --- | --- |
| `claimId` | Identifiant stable |
| `subject.artifactDigest`, `.baseDigest`, `.environmentDigest` | Objet, base et environnement exacts |
| `predicate.command` | Commande dont le comportement est affirmé |
| `predicate.expectedExitCode`, `.expectedOutput` | Au moins un prédicat explicite ; si les deux existent, les deux s'appliquent |
| `assumptions` | Hypothèses explicites |
| `domain.fingerprint`, `.description` | Domaine d'applicabilité |
| `evidence`, `obligations` | Références des preuves et obligations couvertes |
| `provenance.producerId`, `.sourceRefs` | Producteur et origine déclarés |
| `dependencies` | Affirmations nécessaires à cette conclusion |
| `policy.policyId`, `.version` | Politique selon laquelle la conclusion est évaluée |

Les références sont uniques dans chaque liste. Les empreintes ont la forme
`sha256:` suivie de 64 caractères hexadécimaux minuscules. Le contrat permet
d'annoncer une preuve ; il ne certifie pas qu'elle existe ou couvre réellement
l'obligation. Le récepteur vérifie les références et le prédicat exact sans
exécuter aveuglément une commande reçue.

Une modification de l'artefact, de sa base, de son environnement ou de la
politique exige une nouvelle évaluation. Un résultat sur une copie isolée ne
prouve pas automatiquement une propriété du workspace réel.

## Conversation et révision

La conversation nominale comprend `ASSERT`, `REQUEST_EVIDENCE`, `VERIFY` et
`ACCEPT_UNDER_POLICY`. La révision comprend `CHALLENGE`, `COUNTEREXAMPLE`,
`RETRACT`, `INVALIDATE_DEPENDENTS` et `ACK_APPLIED`.

`ACK_APPLIED` porte sur une révision identifiée et doit être produit après son
application persistante. Un accusé réseau ne suffit pas. Un consommateur
déconnecté doit reprendre les révisions manquantes avant de promouvoir une
conclusion dépendante ; son ancienne copie ne peut pas prouver sa propre
fraîcheur. L'histoire antérieure reste consultable.

L'acceptation d'un contre-exemple requiert sa vérification indépendante. Les
descendants dont le domaine chevauche la réfutation sont invalidés ; une
relation de domaine inconnue exige une suspension, conformément au
[propagateur existant](../../backend/src/services/epistemicScheduler/counterexamplePropagation.js).

### Erreurs et reprise

Le validateur expose `EvidenceProtocolError` et un champ `code` stable.

| Code | Reprise attendue |
| --- | --- |
| `EVIDENCE_JSON_INVALID` | Corriger les données JSON, sans réessai aveugle |
| `EVIDENCE_SCHEMA_INVALID` | Corriger le contrat ou négocier une version compatible |
| `EVIDENCE_INTEGRITY` | Rejeter le message et récupérer le contenu exact |
| `EVIDENCE_CLOCK_INVALID` | Corriger l'horloge injectée du récepteur |
| `EVIDENCE_TIME_INVALID` | Corriger une date non représentable par le runtime, notamment une seconde intercalaire |
| `EVIDENCE_EXPIRY_INVALID` | Émettre un nouveau message avec une fenêtre valide |
| `EVIDENCE_FUTURE` | Vérifier les horloges avant toute nouvelle livraison |
| `EVIDENCE_EXPIRED` | Reprendre la conversation et réévaluer l'état courant |

Ces erreurs ne sont ni une vérification réussie ni un accusé d'application.
Elles ne donnent pas le droit d'étendre une autorité ou de modifier un payload
en conservant sa clé d'idempotence. Après déconnexion, le destinataire recharge
son journal et réclame les messages manquants par leurs références causales.
Seule une application durable autorise un `ACK_APPLIED` correspondant.

## Canonicalisation et empreintes

Le [module canonique](../../backend/src/services/evidenceProtocol/canonical.js)
expose `canonicalize(value)` et `digest(value)`. Les objets ont leurs clés triées
lexicographiquement selon les unités UTF-16 ; les tableaux conservent leur ordre.
Les nombres finis et les chaînes suivent la sérialisation JSON ECMAScript.
L'empreinte porte sur les octets UTF-8 du résultat compact, sans saut de ligne.
Une implémentation indépendante doit reproduire ces conventions, notamment les
nombres IEEE 754 ; aucune normalisation Unicode supplémentaire n'est appliquée.

Les valeurs non JSON, les nombres non finis, les cycles, les tableaux creux,
les accesseurs d'objet, les prototypes exotiques et une profondeur supérieure
à 64 conteneurs sont rejetés. Les
[vecteurs communs](../../shared/evidenceProtocol.v1.vectors.json) fournissent
des empreintes de référence, dont un texte Unicode.

## Vérification reproductible et limites

Depuis la racine : `node backend/tests/test_evidence_protocol_contract.js`.
Ce test vérifie les vecteurs, la liaison du payload, l'horloge, les versions,
les contraintes du sujet et les valeurs JSON ambiguës.

Ce premier contrat n'ajoute pas automatiquement un endpoint HTTP, un outil MCP,
une implémentation Rust ou une extension A2A. Il ne fournit pas d'identité
cryptographique ni de garantie d'indépendance statistique des vérificateurs.
Les autorités, leases, frontières de confiance et gates de promotion existants
continuent de s'appliquer. Voir l'[ADR](../adr/2026-11-02-protocole-evidence.md).
