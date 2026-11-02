# GQWF Exchange — Qualification et conditions de reproductibilité

- **Statut** : Implémenté comme API locale Node
- **Portée** : Intégrité native des descripteurs, prédicats et applicabilité des candidats
- **Dernière revue** : 2026-11-02

Le [module](../../backend/src/services/gqwfExchange/qualification.js) utilise
les vrais builders et parsers GQWF. Il ne remplace pas une vérification de
l'environnement réel, une autorisation ou le contrôle atomique du head.

## API

| Fonction | Résultat |
| --- | --- |
| `validateWorld(world)` | Copie détachée après validation native du manifest et de la closure |
| `qualifyWorld(world)` | Digests, origine et assurances conservés au niveau `descriptor-integrity` |
| `qualifyCandidate(world, candidate, policy)` | Qualification liée au candidat, à la politique et au prédicat exacts |
| `environmentDigest(world)` | Digest des quatre composantes natives d'exécution |
| `validateQualificationPolicy(policy)` | Politique de forme correcte avec origines et vérificateurs non vides |
| `uniqueBlobs(manifest)` | Inventaire unique des hashes et tailles |
| `verifyBlob(world, hash, bytes)` | Vérifie taille et SHA-256 natif de vrais octets `Buffer` |
| `assertCurrentContext(candidate, current)` | Comparaison de contexte, explicitement distincte d'une preuve |

Une violation sémantique lève `GqwfExchangeError` avec
`code: 'GQWF_EXCHANGE_QUALIFICATION_INVALID'`. Une erreur de forme conserve le
code du [contrat](protocole-gqwf-exchange.md).

## Manifest et closure

Le manifest est reconstruit par `gqwf/manifest.createManifest`. L'objet
reconstruit doit être égal au manifest annoncé, sa sérialisation native doit
être exacte et son hash doit correspondre à `rootHash`. Le parser natif vérifie
aussi la politique et l'intégrité. Un chemin non portable, une collision ou
une taille invalide est refusé. Un même hash de blob annoncé avec deux tailles
différentes est également refusé.

La closure est reconstruite par `gqwf/executionClosure.buildManifest`, puis
comparée à l'objet original complet. Son workspace et sa racine doivent
correspondre au monde. Sa sérialisation doit être exactement celle du builder,
et son hash doit être le digest natif des octets sérialisés. Le parser natif
est ensuite appelé avec le workspace, la racine et le hash attendus.

Cette comparaison est nécessaire : `buildManifest` peut remplacer un protocole
ou une assurance fournis par l'appelant. Une fausse annonce
`sandbox: 'attested'` n'est donc jamais admise après correction silencieuse.
Recalculer son hash ne la rend pas recevable.

L'ordre natif des sérialisations n'est pas remplacé par la canonicalisation
JSON du protocole. Celle-ci sert à comparer les objets et à engager le monde
complet ; les sérialisations natives et leurs hashes restent inchangés.

## Présence des objets et origine

`qualifyWorld` retourne `qualificationLevel: 'descriptor-integrity'` et
`actionAuthorized: false`. Il ne parcourt pas un magasin physique et ne prouve
pas que tous les blobs y sont présents. Le transport doit vérifier les vrais
octets stockés, leurs tailles, leurs hashes, les types de fichiers et le
confinement des chemins avant de déclarer le monde reçu et vérifié.

`verifyBlob` peut vérifier des octets obtenus par le lecteur CAS autorisé.
Il ne choisit pas un chemin distant et ne remplace pas les contrôles de
liens, de parents ou d'accès de ce lecteur.

L'origine annoncée est conservée à l'identique. Changer `simulated` en
`observed` modifie le descripteur et son `worldDigest` ; cela exige une nouvelle
qualification et la justification de l'origine par une source de confiance.
Une promotion ne transforme pas l'histoire d'une simulation en observation.

Les assurances `externalInputs: 'declared-only'` et `sandbox: 'not-attested'`
restent visibles. Le service ne certifie ni l'installation d'un runtime distant,
ni l'identité d'une dépendance sur la seule base d'une chaîne déclarée.

## Candidat et preuve étroite

`qualifyCandidate` vérifie les liaisons vers le monde, la racine, la closure
et l'environnement. Le `predicate.command` doit être exactement le même objet
`executable`/`arguments` que la closure ; aucune concaténation shell n'intervient.
La politique référencée doit correspondre à la politique configurée, et
l'origine doit figurer parmi les origines admises.

La fonction conserve `baseHash`, `baseGeneration`, `headName`, le prédicat,
les références d'évidence et les vérificateurs configurés. Ces données
permettent de construire une requête de vérification complète. Elles ne
constituent pas le résultat du test. Un vérificateur local indépendant doit
réellement observer le prédicat, dans l'environnement pertinent, et produire
un reçu lié à cette requête et à son identité configurée.

La politique est une donnée de confiance fournie par l'intégration. Une
politique reçue du demandeur ne peut pas s'accorder ses propres origines ou
vérificateurs admissibles. Les listes `allowedOrigins` et `verifierRefs` ne
peuvent pas être vides.

## Fraîcheur et promotion

`assertCurrentContext(candidate, current)` compare la base, sa génération,
l'environnement et la politique. Il attend
`{rootHash, generation, environmentDigest, policy}` et retourne
`{matches: true, proof: false}` en cas d'égalité. Une valeur courante fournie
par un appelant non fiable ne devient donc pas une preuve d'autorité.

La promotion doit lire le vrai head et vérifier de nouveau la preuve applicable
à cette base et à cette génération. Si une autre publication a changé le head,
elle refuse le candidat antérieurement préparé. Une nouvelle offre et une
preuve fraîche peuvent réévaluer les mêmes octets sur la nouvelle base, sans
réutiliser implicitement la validité de l'ancien reçu.

Copier les blobs, accepter le résultat et publier sur le head sont trois
opérations distinctes. La qualification ne contourne pas le gate natif de
publication, ses vérifications de blobs ou son contrôle atomique de génération.

## Validation et limites

Depuis la racine : `node backend/tests/test_gqwf_exchange_qualification.js`.
Le test utilise les manifests et closures natifs et injecte des assurances
mensongères, protocoles altérés, sérialisations divergentes, traversées de
chemin, blobs corrompus, tailles contradictoires et preuves devenues
inapplicables à un autre environnement ou head. Il vérifie la conservation
des quatre origines et l'absence d'autorisation implicite d'action.

Ces helpers ne déclenchent pas une commande distante et ne construisent pas
une preuve à partir d'une simple référence. Les garanties sur les sources,
le stockage local, l'environnement et la publication dépendent des composants
de confiance qui les utilisent réellement.
