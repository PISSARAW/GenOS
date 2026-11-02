# CONTINUITY — Autorité appliquée à la ressource

- **Statut** : Implémenté pour une ressource clé/valeur SQLite locale.
- **Portée** : autorité unique par organisation, projet, mission et branche.
- **Dernière revue** : 2026-11-02.

## Invariant

Un transfert validé remplace le propriétaire et augmente sa génération au point
où l'effet protégé est écrit. Après ce transfert, une ancienne incarnation est
refusée, même si elle connaît le contenu et les anciennes permissions. Le
contrôle, l'écriture de la valeur, la consommation de budget et le reçu sont
dans une seule transaction SQLite `IMMEDIATE`, avec WAL et synchronisation
`FULL`. Un simple verrou distribué ne fournirait pas cette garantie.

Le module [`fence.js`](../../backend/src/services/continuityProtocol/fence.js)
expose `FencedResource({ dbPath, authorize })`. `authorize` est un callback de
confiance obligatoire ; aucune requête entrante ne peut créer implicitement son
autorité. Il reçoit `{ action, request }` détaché et gelé et retourne exactement
`true` pour autoriser. L'intégration authentifie le canal appelant et contrôle
les droits propres à `bootstrap`, `transfer` et `execute`. L'empreinte SHA-256
ne fournit pas cette authentification.

## Contexte, droits et budget

Chaque opération porte `scope: { organizationId, projectId }`, `missionId` et
`branchId`. Un propriétaire ou acteur est
`{ agentId, incarnationId, trustDomain }`. Le contrôle compare tous ces champs
et une génération d'autorité entière sûre, distincte des générations de
workspace ou d'organisation.

`permissions` est une liste de `resourceId` autorisés. Le budget est
`{ unit, limit, spent, reserved }` : les montants sont des entiers sûrs positifs
ou nuls dans une unité fixée, avec `spent + reserved <= limit`. Ce profil local
n'utilise pas de nombres flottants pour comptabiliser les effets. L'intégration
fixe une unité entière adaptée, notamment pour les montants financiers.

## API

Les trois mutations sont asynchrones. Les entrées sont JSON strictes ; les
champs supplémentaires ou manquants sont refusés.

| Méthode | Champs propres, en plus du contexte |
| --- | --- |
| `bootstrap(input)` | `operationId`, `owner`, `generation`, `permissions`, `budget` |
| `transfer(input)` | `transferId`, `bundleDigest`, `previousOwner`, `successor`, `previousGeneration`, `newGeneration`, `permissions`, `budget` |
| `execute(command)` | `operationId`, `actor`, `generation`, `resourceId`, `key`, `value`, `cost` |
| `authority(context)` | Retourne l'autorité courante ou `null` |
| `effects(context)` | Retourne les effets persistés dans leur ordre local |
| `value(context, { resourceId, key })` | Retourne la valeur courante ou `null` |
| `close()` | Ferme la connexion |

`bootstrap` est réservé à une autorité de provisionnement contrôlée par
`authorize`. Il refuse de remplacer une autorité déjà présente.

`transfer` compare le propriétaire et la génération précédents à l'état
autoritatif, exige `newGeneration = previousGeneration + 1` et un successeur
distinct. Les permissions restent identiques ou diminuent. Le budget doit être
strictement identique au budget courant, unité et réserve comprises : une
consommation survenue après scellement du paquet impose un nouveau scellement.
Le budget et les droits ne sont pas dupliqués chez le successeur.

`execute` remplace une clé de la ressource autorisée par une valeur JSON de
65 536 octets UTF-8 au maximum. L'intégration valide le coût demandé selon son
barème dans `authorize` ; le module n'infère pas un coût à partir d'un effet
externe. La dépense nouvelle doit laisser la réserve intacte. Il ne prend pas
de callback d'effet arbitraire : la garantie atomique concerne uniquement cette
ressource SQLite, pas une écriture distante lancée depuis JavaScript.

## Reçus et reprise

Un reçu de transfert reprend exactement les champs de la requête, avec
`status: "activated"` et `receiptDigest`. Cette empreinte est calculée par
`digest({ profile: "genos.continuity.fence/receipt/v1", status: "activated", ...request })`
selon la canonicalisation EVIDENCE. `bootstrap` et `execute` utilisent le même
format avec les statuts `initialized` et `applied`.

Les identités d'opération sont cloisonnées par contexte et méthode. Une
répétition exacte retourne le reçu enregistré ; une réutilisation conflictuelle
est refusée. Pour `execute`, le propriétaire et la génération courants sont
contrôlés avant toute réponse idempotente : un ancien propriétaire est donc
refusé même lorsqu'il répète une écriture passée.

Pour `transfer`, la reprise exacte reste autorisée après activation afin de
traiter le crash entre l'effet sur la ressource et le commit du journal de
handoff, stocké dans une autre base. Ce reçu historique ne restaure jamais une
ancienne autorité et ne prouve pas qu'elle est encore courante après un autre
transfert. Le consommateur consulte `authority(context)` pour l'état actuel.

## Frontière de confiance et concurrence

L'état autoritatif est lu après le callback d'autorisation asynchrone et à
l'intérieur de la transaction. Un transfert intervenant pendant cette attente
fait donc échouer l'écriture de l'ancien propriétaire. Un échec de journalisation
annule également l'écriture, la dépense et le changement d'autorité.

Le callback d'autorisation doit s'appuyer sur une identité authentifiée hors
payload. Si ses droits externes peuvent changer pendant l'appel, l'intégration
doit fournir leur contrôle au point d'application ou les inclure dans le
fencing autoritatif ; une déclaration de droits passée ne suffit pas.

Une copie de la base ou un cache détenu par une incarnation ne devient pas la
ressource autoritative. Tous les effets réels doivent passer par la même base
protégée ou un adaptateur de ressource offrant un contrôle transactionnel
équivalent. Deux copies accessibles en écriture constitueraient deux ressources
différentes et ne fourniraient pas une autorité globale unique. Ce module ne
fournit pas de consensus multimaître, de partition réseau tolérante aux écritures
concurrentes, ni de signature cryptographique des reçus.

## Vérification

`node backend/tests/test_continuity_protocol_fencing.js` vérifie la reprise,
le refus de l'ancienne incarnation y compris sur doublon, l'absence d'augmentation
des droits, la conservation du budget et de la réserve, le cloisonnement du
contexte, une course avec transfert pendant l'autorisation et l'atomicité par
injection d'une panne de persistance SQLite.
