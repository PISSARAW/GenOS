# SYNAPSE — Contexte, codec et qualification native

- **Statut** : Implémenté comme API locale Node/SQLite
- **Portée** : Contrats sémantiques locaux, différences JSON et fallback canonique
- **Dernière revue** : 2026-11-02

Le [module](../../backend/src/services/synapseProtocol/contextCodec.js) expose
`createContextCodec(options)` et `ContextCodec`. Il réutilise réellement
`communication/dialectService` pour l'encodage et le décodage, et
`communication/commonGroundService.getSharedGround` pour les connaissances
communes du domaine exact.

## Configuration locale

Les options sont `db`, `schema`, `operations`, `groundingProvenance`,
`minimumGroundConfidence` et `clock`. La connexion expose les méthodes natives
`exec/get/all/run` et peut être partagée avec la conversation durable. Les
lectures du codec utilisent le même `withTransaction` réentrant.

`schema` contient `schemaId`, `version` et une `definition` JSON Schema locale.
`operations` contient exactement deux mappings locaux, pour `put` et `remove`.
Chaque mapping contient `kind`, `semanticFingerprint`, `canonicalMeaning` et
`payloadSchema`. Seuls ces schémas de confiance sont compilés.

Par défaut, le contrat de provenance des connaissances communes est
`{kind:'synapse-context/v1', strength:'configured'}` et la confiance déclarée
minimale est 0,5. L'intégration peut fournir un autre contrat non vide.
Il s'agit de conditions opérationnelles déclarées ; ni ce label ni un score
ne prouvent une indépendance ou une vérité statistique.

Les tables natives doivent être provisionnées par une intégration autorisée.
Un symbole ou un schéma reçu dans un message ne remplace pas cette configuration.
Le [helper de test](../../backend/tests/helpers/synapseContextFixture.js)
montre un provisionnement avec les vrais services natifs dans deux bases
indépendantes.

## API

| Méthode | Résultat |
| --- | --- |
| `capture(localInput)` | Snapshot complet du contexte local |
| `createDelta({deltaId, context, operations, state})` | Descripteur engagé et représentation canonique |
| `encode({context, operations})` | Représentation compacte via le vrai dialecte installé |
| `qualify({context, delta, representation, local})` | Compatibilité, conditions manquantes et résultat calculé |

`localInput` contient `contextId`, `dialectId`, `domain`, `publisher`, `audience`,
`state`, `generation` et `dependencies`. `local` reprend ce même objet. L'état
et les dépendances doivent provenir d'un fournisseur local de confiance ; les
donner depuis le message distant ne prouve pas leur présence locale.

Les entrées asynchrones sont copiées avant l'attente du mutex pour éviter
qu'un appelant les modifie pendant une capture. La valeur retournée par la
qualification est calculée depuis l'état local ; elle n'est pas installée par
le codec. La conversation doit ensuite contrôler l'autorité et appliquer son
propre CAS atomique sur la génération.

## Dictionnaire complet

Le hash natif du dialecte lie son identité, sa version et les associations
symbole/empreinte. Il ne lie pas le sens canonique ou le schéma de payload.
Le codec compare donc tout le snapshot retourné par `getDialect`, notamment
ces champs, les participants, le domaine, le vocabulaire, le statut, la
confiance et l'expiration.

Pour un décodage compact, le symbole est réellement résolu par `decode` avec
la version attendue. Son empreinte, son sens et son schéma doivent correspondre
au mapping local configuré. Le payload est vérifié par le schéma local et par
les champs autorisés de l'opération. Un payload ne peut pas remplacer le kind
résolu en fournissant sa propre propriété `kind`.

Une différence déclenche une demande de représentation canonique, sans
installation de définition distante ni interprétation par ressemblance.

## Connaissances communes et histoires indépendantes

La capture conserve les entrées natives complètes des empreintes configurées,
y compris leurs dates, confiance et provenance. Deux bases indépendantes
peuvent avoir confirmé la même expression à des dates différentes et avec des
preuves locales différentes.

La qualification n'exige donc pas l'égalité des dates ou des identifiants de
preuve. Pour chaque empreinte requise, elle contrôle les participants, le
domaine, le statut `grounded`, la validité de chaque expiration, le minimum
de confiance configuré et les bindings du contrat de provenance. La confiance
locale ne peut pas être inférieure à celle exigée par le contexte offert.
Les autres métadonnées historiques sont conservées, sans leur inventer une
égalité entre les runtimes.

Un état révoqué, périmé, absent ou insuffisant reste incompatible, y compris
en représentation canonique. L'appel à `getSharedGround` conserve la portée
du domaine ; une connaissance d'un autre domaine ne suffit pas.

## Engagement du delta et fallback

Le codec vérifie `contextDigest`, `baseDigest`, le digest des opérations
normalisées et le résultat exact. Les opérations canoniques restent bornées
à `put` et `remove`, une seule par clé, sous le schéma d'état local. Une
suppression absente, une clé dangereuse, un type incorrect ou un résultat
incohérent est refusé.

Une qualification incompatible retourne `compatible:false`, `missing` et
`canonicalRequested`. Ce dernier vaut vrai lorsque la représentation compacte
échoue seulement à cause du dictionnaire ou du décodage autorisé.
Une qualification réussie retourne aussi `operations` et `value`.

Le champ `context` du résultat est le contexte local capturé. Son digest peut
différer de celui de l'offre à cause des histoires natives indépendantes.
Il ne remplace pas le contexte original dans l'engagement du delta ou dans
le sujet d'un accusé.

Le fallback canonique conserve le descripteur initial et son digest
d'opérations. Il ignore uniquement la dépendance au dialecte ; il ne contourne
jamais la base, le schéma, les acteurs, l'audience, les dépendances ou les
connaissances communes requises.

## Fraîcheur et intégration

La qualification relit le dictionnaire et les connaissances communes dans la
transaction native. Le fournisseur de contexte doit aussi être relu après
les callbacks d'autorisation si leurs attentes ont pu laisser évoluer les
dépendances ou la configuration locale. Réutiliser une ancienne valeur fournie
avant ces attentes ne prouve pas la fraîcheur du monde courant.

Le codec n'installe aucun état reçu et n'autorise aucune action externe. Il ne
remplace pas les leases, les audiences historiques, les gates EVIDENCE ou la
vérification indépendante. Un décodage réussi reste une compatibilité
opérationnelle avec le contrat configuré.

## Validation

Depuis la racine : `node backend/tests/test_synapse_protocol_context.js`.
Le test utilise deux bases avec leurs dialectes et connaissances réellement
provisionnés. Il couvre les histoires différentes mais compatibles, le même
hash natif avec un sens ou un payload schema altéré, les symboles inconnus,
le dictionnaire absent, le fallback sans changement d'engagement, les bases,
audiences et dépendances différentes, les connaissances révoquées et les
opérations incompatibles avec le schéma local.
