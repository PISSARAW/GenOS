# Protocole GQWF Exchange v1

- **Statut** : Profil expérimental ; contrat et qualification Node implémentés
- **Portée** : Échange de mondes et de candidats avec leurs limites d'applicabilité
- **Dernière revue** : 2026-11-02

Le [schéma](../../shared/gqwfExchangeProtocol.v1.schema.json) définit
`genos.gqwf.exchange/v1`. Le
[validateur](../../backend/src/services/gqwfExchange/contract.js) expose
`createMessage`, `validateMessage`, `validateWorldShape`, `validateCandidate`
et `validateQualificationPolicy`.

Le contrôle de forme est distinct de la qualification sémantique : un monde
ayant les bons champs peut encore porter un manifest, une closure ou une
empreinte incohérents. Voir la [qualification](gqwf-exchange-qualification.md).

## Enveloppe et messages

L'enveloppe contient `protocol`, `type`, `messageId`, `operationId`, `missionId`,
`conversationId`, `sender`, `audience`, `scope`, `causalRefs`, `generations`,
`authority`, `idempotencyKey`, `createdAt`, `expiresAt`, `payloadDigest` et
`payload`. Acteurs, portées et générations suivent les autres profils de la
famille. Les générations d'incarnation, d'organisation et de workspace restent
distinctes de celle du head GQWF et de l'autorité.

Les identifiants n'admettent pas de blanc initial ou final. Les dates futures,
expirées ou non représentables sont rejetées. `{ now }` permet d'injecter une
date ou des millisecondes Unix pour les tests. Une empreinte cohérente ne
prouve pas l'identité ni l'autorité du demandeur.

| Type | Payload strict |
| --- | --- |
| `OFFER_WORLD` | `world` |
| `NEED_OBJECTS`, `VERIFY_WORLD` | `worldId`, `worldDigest` |
| `TRANSFER` | `worldId`, `worldDigest`, `hash`, `bytesBase64` |
| `OFFER_CANDIDATE` | `candidate` |
| `REQUEST_EVIDENCE`, `PREPARE_PROMOTION`, `COMMIT` | `candidateId`, `candidateDigest` |
| `REJECT`, `ABORT` | `candidateId`, `candidateDigest`, `reason` |

Les deux dernières opérations concernent la conversation de promotion. Les
messages inconnus ou hors ordre doivent être refusés par la conversation
concernée, même si leur enveloppe est correctement formée.

`TRANSFER` porte des blobs de fichiers, au maximum 8 Mio décodés par message.
Le base64 doit être canonique ; une variante ambiguë ou une taille supérieure
est rejetée. Les textes des manifests et closures figurent déjà dans l'offre.
La réception ne doit ni matérialiser un chemin arbitraire ni exécuter une
commande du monde distant.

## Monde et empreintes natives

| Champ du monde | Contenu |
| --- | --- |
| `worldId`, `workspaceId` | Identifiants logiques, distincts des chemins locaux |
| `origin` | `kind` et `sourceRef` |
| `rootHash` | Empreinte native du manifest de fichiers |
| `manifest`, `manifestSerialized` | Objet natif complet et sérialisation native exacte |
| `closureHash` | Empreinte native des octets UTF-8 de la closure sérialisée |
| `closure`, `closureSerialized` | Objet natif complet et sérialisation native exacte |

`origin.kind` vaut `observed`, `isolated`, `simulated` ou `unexecuted`. Cette
origine est une déclaration à confronter aux sources de confiance. Le contrôle
d'intégrité la conserve ; il ne prouve pas à lui seul qu'une observation a eu
lieu dans l'environnement réel.

Le manifest utilise la politique native GQWF v2 et des entrées
`{path, hash, size, mode}`. Les chemins doivent respecter les règles portables
et les limites du validateur natif. Les liens, permissions de lecture ou
destinations locales ne se déduisent pas d'un manifest reçu.

La closure native `gqwf-execution-closure-v1` contient `workspaceId`, `rootHash`,
`command` (`executable`, `arguments`), `runtime`, `dependencies`, `environment`
et `assurance`. Les dimensions d'assurance sont exactement :

| Dimension | Garantie annoncée |
| --- | --- |
| `fileRoot` | `content-addressed` |
| `externalInputs` | `declared-only` |
| `sandbox` | `not-attested` |

Les `rootHash`, `closureHash` et hashes des blobs sont 64 caractères
hexadécimaux minuscules sans préfixe, conformément au stockage natif. Les
`worldDigest`, `candidateDigest`, `environmentDigest` et `payloadDigest`
utilisent `sha256:` puis 64 caractères hexadécimaux, selon la
[canonicalisation EVIDENCE](protocole-evidence.md). Ces couches ne sont pas
interchangeables.

Le même identifiant logique de workspace peut être présent dans deux bases
séparées. Chaque processus choisit son chemin local de confiance ; aucun chemin
absolu distant n'est importé depuis le descripteur.

## Candidat et politique

Un candidat contient `candidateId`, `worldId`, `worldDigest`, `rootHash`,
`closureHash`, `baseHash`, `environmentDigest`, `headName`, `baseGeneration`,
`predicate`, `policy` et `evidenceRefs`.

Le prédicat contient `command`, objet natif `executable`/`arguments`, et au
moins `expectedExitCode` ou `expectedOutput`. Si les deux sont présents, les
deux conditions doivent être vérifiées. Une commande reçue est une déclaration
du prédicat, pas une permission de l'exécuter. Le vérificateur utilise un
programme local installé et explicitement autorisé.

L'environnement est lié par l'empreinte canonique de
`{command, runtime, dependencies, environment}` provenant de la closure.
La base et sa génération restent des dimensions distinctes. La conservation
des octets du candidat ne suffit pas à conserver l'applicabilité d'une preuve.

`policy` contient `policyId` et `version`. La politique effective est fournie
par l'intégration de confiance et contient aussi `allowedOrigins` et
`verifierRefs`, tous deux non vides. Une référence d'évidence annoncée dans
`evidenceRefs` n'est pas une preuve automatiquement admise ; un vérificateur
configuré doit produire un reçu lié à la requête complète.

## Erreurs, validation et limites

Le validateur lève `GqwfExchangeError` avec les codes
`GQWF_EXCHANGE_JSON_INVALID`, `GQWF_EXCHANGE_SCHEMA_INVALID`,
`GQWF_EXCHANGE_TIME_INVALID`, `GQWF_EXCHANGE_CLOCK_INVALID`,
`GQWF_EXCHANGE_EXPIRY_INVALID`, `GQWF_EXCHANGE_FUTURE`,
`GQWF_EXCHANGE_EXPIRED`, `GQWF_EXCHANGE_INTEGRITY` ou
`GQWF_EXCHANGE_TRANSFER_INVALID`. La qualification peut lever
`GQWF_EXCHANGE_QUALIFICATION_INVALID`.

Depuis la racine : `node backend/tests/test_gqwf_exchange_contract.js`.
Les [vecteurs communs](../../shared/gqwfExchangeProtocol.v1.vectors.json)
incluent un manifest vide avec son hash natif calculé indépendamment en Python.

Le contrat n'active pas automatiquement une réplication ou une promotion native,
un endpoint réseau, un outil MCP, une extension A2A ou un interpréteur Rust.
Les callbacks, scopes et gates de l'intégration restent nécessaires. Voir
l'[ADR](../adr/2026-11-02-protocole-gqwf-exchange.md).
