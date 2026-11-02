# GQWF Exchange — Transfert durable entre magasins indépendants

- **Statut** : Profil Node intégrable ; bases et magasins CAS physiquement séparés.
- **Dernière revue** : 2026-11-02

## API et chemins locaux

`GqwfExchange`, exportée par
`backend/src/services/gqwfExchange/exchange.js`, reçoit
`{dbPath,workspaceRoot,authorize,verifyWorld,clock}`. `authorize` est obligatoire ;
`verifyWorld` est un contrôle supplémentaire facultatif. Le chemin absolu
`workspaceRoot` vient de la configuration locale de confiance, jamais d'un
message distant. La racine doit déjà être un répertoire privé, sans alias de
lien symbolique ou de jonction. Sans `dbPath`, la base SQLite reste en mémoire.

| Méthode | Résultat |
| --- | --- |
| `apply(message)` | Exécute une étape du transfert et journalise son résultat |
| `describe(query)` | État durable du monde, sous contrôle d'accès |
| `verifiedWorld(query)` | Monde, qualification et reçu après relecture physique du CAS |
| `exportObjects({...query,hashes})` | Objets du seul monde demandé, encodés en base64 canonique |
| `assertSafeCas()` | Prépare et contrôle les répertoires CAS locaux de l'intégration |
| `close()` | Ferme la connexion SQLite |

La requête `query` est exactement
`{scope,missionId,conversationId,worldId,worldDigest}`. La portée contient une
organisation et un projet explicites. Une portée différente, un digest modifié
ou un champ de requête supplémentaire ne désigne pas le même monde.

Le callback reçoit `authorize({operation,request})` et doit retourner strictement
`true`. Les opérations sont `APPLY`, avec l'enveloppe complète, et
`DESCRIBE_WORLD`, `VERIFIED_WORLD`, `EXPORT_OBJECTS`, avec la requête liée.
L'intégrateur authentifie l'appelant et impose ses droits de lecture ou
d'écriture. Aucun export n'est disponible sur la seule présentation d'un hash.
Les paramètres des callbacks sont des copies profondément gelées.

## Conversation

La conversation suit `OFFER_WORLD → NEED_OBJECTS → TRANSFER → VERIFY_WORLD`.
Les identités, l'audience, les générations, l'autorité, la portée, la mission et
la conversation restent liées à l'offre. Chaque message suivant cite le dernier
message achevé dans `causalRefs`. L'expiration de l'offre et celle du message
courant sont contrôlées pendant le transfert.

| Message | Payload et comportement |
| --- | --- |
| `OFFER_WORLD` | `{world}` ; valide le manifeste natif et la fermeture d'exécution, sans prétendre posséder les blobs |
| `NEED_OBJECTS` | `{worldId,worldDigest}` ; lit le CAS destinataire et retourne seulement les objets absents |
| `TRANSFER` | `{worldId,worldDigest,hash,bytesBase64}` ; accepte un objet demandé, avec taille et hash réels corrects |
| `VERIFY_WORLD` | `{worldId,worldDigest}` ; relit tous les blobs et conserve métadonnées, index natifs et reçu |

Les états durables sont `offered`, `requested`, `transferring`, puis `verified`.
Un destinataire peut renégocier `NEED_OBJECTS` après un transfert partiel : les
objets reçus et encore intègres sont réutilisés. Un objet déjà reçu ou absent de
la demande n'est pas accepté sous un nouveau message `TRANSFER`. La
redélivrance exacte d'un message journalisé retrouve son résultat initial.

Pour amorcer un producteur local, l'intégrateur place les vrais fichiers dans
son CAS, puis exécute une session locale `OFFER_WORLD`, `NEED_OBJECTS`,
`VERIFY_WORLD`. Si les blobs sont déjà présents, la liste des objets manquants
est vide. Cette session ne requiert aucun chemin fourni par le destinataire.

## Formats natifs et qualification

Le descripteur porte `worldId`, `workspaceId`, l'origine du monde, le manifeste
GQWF, sa sérialisation exacte, son hash racine, la fermeture d'exécution et sa
sérialisation exacte. Le validateur reconstruit le manifeste avec
`gqwf/manifest.createManifest` et la fermeture avec
`gqwf/executionClosure.buildManifest` ; leurs parseurs natifs vérifient aussi
les représentations exactes.

Les hashes natifs de fichiers, de racine et de fermeture sont des SHA-256
hexadécimaux de 64 caractères **sans préfixe**. `worldDigest` et les digests du
protocole utilisent la forme `sha256:...`. Le hash de fermeture porte sur les
octets de sa sérialisation native ; il n'est pas remplacé par un digest du JSON
réordonné de l'enveloppe.

Le `workspaceId` est un identifiant logique conservé entre les deux bases. Ses
chemins physiques sont enregistrés indépendamment depuis les racines locales
injectées. Une réutilisation locale incompatible de cet identifiant, d'une
portée ou d'un chemin est refusée. Le transfert n'utilise pas la réplication
historique qui suppose déjà les deux workspaces dans une seule base.

La qualification conserve l'origine `observed`, `isolated`, `simulated` ou
`unexecuted`. Elle conserve aussi les garanties réelles de la fermeture :
`fileRoot: content-addressed`, `externalInputs: declared-only`,
`sandbox: not-attested`. Un transfert ne transforme pas une simulation en
observation réelle et n'atteste pas l'environnement d'exécution déclaré.

## Vérification physique et index persistés

Le bridge réutilise réellement `gqwf/objects.putBlob` et `readBlob`, ainsi que
`gqwf/metadataStore.putObject` et `readObject`. Chaque blob reçu est vérifié sur
ses octets, sa taille et son hash avant admission. Une entrée de manifeste ne
suffit jamais à déclarer un objet présent.

`VERIFY_WORLD` relit chaque objet unique, puis conserve le manifeste et la
fermeture dans le CAS des métadonnées. Le journal, l'état `verified`, le reçu,
`gqwf_roots` et `gqwf_execution_closures` sont écrits dans une transaction
SQLite. Ces vrais index natifs permettent une promotion ultérieure par les
services GQWF existants ; le transfert lui-même ne publie aucun head.

Le callback facultatif `verifyWorld(request)` reçoit
`{query,world,qualification,objects:[{hash,size}]}`. Son reçu doit contenir
`status:"validated"`, `requestDigest:digest(request)` et un `receiptDigest`
SHA-256. Le bridge relit ensuite les objets, afin qu'un contrôle asynchrone ne
masque pas une modification de leur contenu. En l'absence de callback, la
vérification porte sur l'intégrité du contenu et de ses descripteurs ; elle
ne prétend pas prouver l'exécution d'une commande.

`verifiedWorld(query)` retourne `{world,qualification,receipt}` après de
nouvelles lectures des blobs, des objets de métadonnées et des index natifs.
Un reçu historique ne masque donc pas une corruption survenue après le
transfert. Le reçu porte `status:"verified"`, la requête complète, `rootHash`,
`closureHash`, la qualification et le digest de
`{profile:"genos.gqwf.exchange/receipt/v1",...body}`.

## Confinement du magasin et bornes

Les parents de chaque chemin CAS sont contrôlés composant par composant avec
`lstat` et `realpath`, depuis la racine locale de confiance. Les liens
symboliques et jonctions sont refusés avant lecture ou écriture. Les identités
des répertoires sont comparées avant et après l'accès. Une feuille doit être
un fichier régulier privé, sans lien symbolique et avec `nlink === 1` ; les
liens physiques sont donc refusés. Les mêmes contrôles couvrent le CAS des
blobs et celui des métadonnées.

La racine doit rester contrôlée par le service et protégée par les permissions
du système d'exploitation. Ces vérifications JavaScript ne constituent pas une
primitive atomique `openat` contre un processus local hostile qui remplacerait
continuellement les parents pendant une opération. Le profil n'atteste pas une
sandbox OS et ne remplace pas l'isolation du répertoire CAS.

Le profil borne chaque blob à 8 MiB, exige un encodage base64 canonique et borne
les objets de métadonnées à 16 MiB. Un export porte au plus sur 1 000 hashes et
32 MiB de contenu par lot. Les objets supplémentaires, les tailles contradictoires
pour un même hash et les injections de chemin sont refusés. Les fichiers du
manifeste restent des entrées déclaratives : ils ne sont jamais matérialisés
dans le workspace et les commandes de fermeture ne sont pas exécutées.

## Concurrence et séparation de la promotion

Le bridge utilise le même `withTransaction` asynchrone que les services GQWF
natifs, sur l'objet de connexion `exchange.db` exposé à l'intégrateur. Les
lectures sensibles et les commits partagent son mutex réentrant ; une lecture
externe ne peut pas présenter comme durable un état temporaire d'une
transaction native ensuite annulée. Le commit compare aussi l'état lu avant
les callbacks pour refuser une transition devenue concurrente.

L'autorisation et l'expiration sont revérifiées après les traitements
asynchrones. Dans la transaction finale, le contrôle d'autorité est suivi d'une
nouvelle lecture physique du CAS, puis de la validation temporelle juste avant
les écritures des index et du reçu. La redélivrance d'un `VERIFY_WORLD` relit
également les objets après son dernier contrôle d'autorité. Une révocation peut laisser un objet CAS sans référence, mais
elle ne produit ni état vérifié ni autorisation de promotion. Une corruption
détectée n'est pas réparée par écrasement silencieux ; la réparation relève
d'une procédure distincte.

L'intégrateur qui appelle les services natifs de catalogue ou de promotion
utilise la même connexion et appelle `assertSafeCas` autour de leurs accès au
CAS. L'export des octets, l'acceptation d'une preuve et la publication d'un head
restent trois opérations distinctes. Une racine reçue n'accorde pas de droits,
ne consomme aucun budget d'exécution et n'autorise aucun effet réel.

## Validation

```text
node backend/tests/test_gqwf_exchange_transfer.js
node backend/tests/test_gqwf_exchange_transfer_safety.js
```

Les suites emploient deux bases et deux magasins physiques distincts. Elles
couvrent transfert partiel et reprise, réutilisation des seuls objets présents,
corruption avant vérification, métadonnées et index altérés, portée étrangère,
refus d'export, payloads non canoniques, jonctions de parents, feuilles liées,
révocation et isolation vis-à-vis d'une transaction native annulée. Elles ne
revendiquent aucune exécution ni attestation de sandbox de la fermeture reçue.
