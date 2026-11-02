# GQWF Exchange — Promotion liée à la base courante

- **Statut** : Implémenté avec les racines et têtes GQWF natives.
- **Portée** : admission d'un candidat reçu, vérification indépendante et publication atomique d'une tête locale.
- **Dernière revue** : 2026-11-02.

La réception des objets, la qualification d'un monde, l'admission d'un résultat
et l'autorisation de déplacer une tête sont des décisions distinctes. Une
promotion de tête ne constitue pas une autorisation de déployer ni d'exécuter
une action métier.

## Contrat d'un candidat

`OFFER_CANDIDATE` transporte un objet `candidate` strict :

- `candidateId`, `worldId`, `worldDigest` ;
- `rootHash` et `closureHash`, identifiants SHA-256 natifs sans préfixe ;
- `headName`, `baseHash`, `baseGeneration` ;
- `environmentDigest`, `predicate`, `policy`, `evidenceRefs`.

Le prédicat comprend une commande structurée
`{ executable, arguments }` égale à la commande de la closure native, et un
résultat attendu explicite. Une chaîne reconstruite par jointure des arguments
ne suffit pas : elle pourrait confondre plusieurs listes d'arguments.

Le digest d'environnement lie commande, runtime, dépendances et environnement
déclarés dans la closure. Le callback de preuve vérifie leur applicabilité
réelle sur le destinataire. La closure conserve ses limites natives : fichiers
adressés par contenu, entrées externes seulement déclarées et sandbox non
attestée.

`REQUEST_EVIDENCE`, `PREPARE_PROMOTION` et `COMMIT` transportent
`{ candidateId, candidateDigest }`. Les enveloppes lient organisation/projet,
mission, conversation, acteur, audience, générations et autorité. Chaque
transition doit référencer causalement le dernier message appliqué au candidat.
L'idempotence des messages est cloisonnée par tous ces identifiants de contexte,
acteur et audience.

## Intégration native

[`CandidatePromotion`](../../backend/src/services/gqwfExchange/promotion.js)
reçoit :

```javascript
{
  db, workspaceId, policy,
  authorize, verifiedWorld, verifyEvidence, authorizePromotion,
  assertSafeCas, clock
}
```

La connexion `db` doit être celle du destinataire GQWF, exposant
`get/run/all/exec`, et utilisée avec le même adaptateur par les deux modules.
`workspaceId` vient de la configuration locale de confiance. La ligne native
`workspaces` doit associer cette identité à la portée organisation/projet
exacte ; un chemin du producteur n'est jamais adopté comme workspace local.
Le profil conserve le même identifiant logique de workspace entre deux bases
séparées, avec des chemins physiques locaux distincts.

Les callbacks obligatoires reçoivent des copies détachées et gelées :

| Callback | Responsabilité |
| --- | --- |
| `authorize({ action, request })` | Authentifier le canal, vérifier les droits et la portée de la commande ou de la lecture |
| `verifiedWorld(query)` | Lire le monde physiquement vérifié sur le destinataire et recontrôler les blobs, métadonnées et index CAS actuels |
| `verifyEvidence(request)` | Exécuter ou consulter indépendamment les preuves réellement applicables au sujet exact |
| `authorizePromotion(request)` | Autoriser séparément la préparation/publication sous la politique courante |
| `assertSafeCas()` | Vérifier les parents et le confinement du CAS avant les accès natifs |

La politique locale est un descripteur de confiance
`{ policyId, version, allowedOrigins, verifierRefs }`. La référence du candidat
doit correspondre à cette politique. Ni une politique autodéclarée ni un hash
de reçu ne confèrent un droit.

`initializeHead({ scope, name, rootHash })` est réservé au provisionnement
autorisé d'une tête native. Il refuse de remplacer une tête existante.
`head({ scope, name })` inspecte la tête native actuelle. Aucun état JSON
parallèle n'est utilisé comme substitut de la tête GQWF.

## Preuves et admission

`apply(envelope)` exécute la conversation suivante :

1. `OFFER_CANDIDATE` exige un monde vérifié, la qualification de son origine,
   les liaisons exactes racine/closure/environnement/politique et la base courante.
2. `REQUEST_EVIDENCE` obtient une preuve indépendante applicable. Cet état
   `verified` n'autorise aucune publication de tête.
3. `PREPARE_PROMOTION` revérifie les liaisons, les preuves et la base, puis
   demande séparément le droit de promouvoir. La tête reste inchangée.
4. `COMMIT` refait ces contrôles et applique le CAS natif.

`verifyEvidence` reçoit
`{ stage, message, candidate, candidateDigest, world, qualification,
currentHead, policy, previousReceipt }`. Il retourne
`{ status: "validated", requestDigest, receiptDigest, verifierRef }`, où
`requestDigest = digest(request)` et `verifierRef` figure dans la configuration
locale. Lors de `REQUEST_EVIDENCE`, l'intégration exécute le prédicat sur l'objet
exact. Aux étapes ultérieures, elle peut consulter un registre de preuves
indépendant plutôt que refaire une commande, à condition d'établir que le reçu
couvre toujours le même candidat, la même base, le même environnement et la
même politique. Le simple renvoi du `previousReceipt` reçu dans la requête
n'effectue pas cette vérification.

`authorizePromotion` reçoit les mêmes champs ainsi que `verification` et doit
retourner exactement `true`. Les droits généraux sont contrôlés à nouveau
après les attentes, puis dans la transaction avant son commit final.

## Publication et atomicité

La publication appelle réellement
[`gqwf/roots.publishCandidate`](../../backend/src/services/gqwf/roots.js).
Le vérificateur natif lie workspace, tête, ancienne racine, génération attendue,
racine candidate et identifiant de preuve. Le CAS exige simultanément la bonne
racine et la bonne génération ; l'incrément ne peut pas être obtenu en fournissant
seulement un hash de base connu.

La tête, l'événement natif `gqwf_head_events`, le reçu de promotion et l'état de
conversation sont persistés dans la **même transaction SQLite**, grâce au
callback natif `persistReceipt`. Une panne d'insertion du reçu ou une révocation
observée dans cette transaction annule aussi le déplacement de tête. La closure
et le CAS du destinataire sont recontrôlés avant la fin de l'opération.

Le checkpoint du catalogue natif est utilisé après la mutation, comme dans le
fabric GQWF. Il ne remplace pas le commit de la base. Un incident de catalogue
après ce commit exige une inspection du reçu et la récupération du catalogue ;
il ne faut pas en déduire que la publication n'a pas eu lieu.

Le wrapper de catalogue contrôle le CAS avant le premier accès natif et
immédiatement avant le checkpoint, y compris lorsque la mutation a échoué.
Une jonction dans un shard de métadonnées non utilisé par le candidat ne doit
donc pas devenir une destination d'écriture du catalogue. Ces guards couvrent
aussi les shards hexadécimaux existants sous `blobs` et `metadata/objects`.

Toutes les mutations et lectures sensibles partageant cette connexion utilisent
le même mutex transactionnel `withTransaction`. Une lecture indépendante ne
doit pas voir une tête encore non commitée ; un transfert concurrent ne doit
pas accuser un sous-commit ensuite annulé par la promotion englobante.
L'initialisation d'une autre tête attend elle aussi ce mutex ; elle ne peut
pas accuser une insertion encore inscrite dans la transaction d'une promotion
susceptible d'être annulée.

La frontière finale ordonne les lectures de monde et callbacks de politique,
puis l'autorisation courante, puis une relecture physique locale du CAS et des
index sans callback d'autorisation, et enfin l'expiration avant les écritures
SQL. Une mutation de blob au dernier callback ne peut ainsi être masquée par
un reçu vérifié avant ce callback. Une préparation qui attend le mutex doit
également retrouver la base et les droits courants avant d'être admise.

## Changement de base et reprise

Deux candidats peuvent être vérifiés et préparés sur la même base. Si le premier
est publié, le second échoue : ses tests passés ne prouvent pas son applicabilité
à la nouvelle base. Une nouvelle offre lie explicitement le candidat à la base
et à la génération actuelles, avec une nouvelle vérification. Ce profil ne
réalise pas automatiquement une fusion ou un rebase des fichiers ; cette
transformation reste une opération distincte, vérifiable avant l'offre.

Le reçu de publication contient notamment la portée, la mission, la conversation,
le candidat et son digest, le monde et son digest, workspace/tête, ancienne et
nouvelle racines, génération publiée et identifiant de preuve. Il conserve
l'origine du monde et sa qualification, avec
`externalEffectsAuthorized: false`. Son empreinte utilise le profil
`genos.gqwf.exchange/promotion-receipt/v1`.

`state({ scope, missionId, conversationId, candidateId })` et `receipt(query)`
sont des lectures autorisées explicites. Le reçu est historique : rejouer un
ancien commit après une publication ultérieure retourne son reçu, sans remettre
l'ancienne tête en place. `head(...)` indique la tête actuelle. Ces interfaces
contiennent des métadonnées du candidat et doivent être protégées selon la
portée et les droits d'audit ; elles ne constituent pas une API publique sans
contrôle d'accès.

## Limites et origine

Une observation en environnement réel, une copie isolée, une simulation et une
hypothèse non exécutée restent distinctes. La politique décide quelles origines
elle accepte. Même si le destinataire exécute de nouvelles vérifications, la
promotion ne réécrit pas l'origine ni n'améliore automatiquement l'attestation
de sandbox ou des entrées externes.

Le CAS physique doit rester privé à ses propriétaires système autorisés. Les
contrôles rejettent notamment les parents redirigés et les objets non privés ;
ils ne constituent pas une sandbox résistante à un attaquant capable de
remplacer arbitrairement les fichiers et parents entre deux instructions.

Le commit déplace une tête native adressée par contenu. Il ne rollback pas le
filesystem actif, ne déploie pas le code, ne produit pas d'effet métier et ne
remplace pas les leases, les gates de promotion existants ou l'autorisation
distincte d'une action réelle.

## Vérification reproductible

`node backend/tests/test_gqwf_exchange_promotion.js` et
`node backend/tests/test_gqwf_exchange_promotion_races.js` utilisent un véritable
CAS, les tables/têtes natives et un prédicat Node exécuté indépendamment. Ils
couvrent les préparations concurrentes, la nouvelle base, un prédicat qui
échoue malgré un transfert vérifié, les doublons, l'expiration, la révocation,
la corruption CAS et le rollback tête/reçu. Un test suspend également une
transaction native pour vérifier l'absence de lecture non commitée ou d'accusé
de transfert annulable par un autre commit.
