# EVIDENCE — Conversations persistantes

- **Statut** : Implémenté comme bibliothèque Node intégrable ; transport et authentification à fournir.
- **Dernière revue** : 2026-11-02
- **Contrat** : [protocole EVIDENCE](protocole-evidence.md).

## API

`EvidenceConversation` est exportée par
`backend/src/services/evidenceProtocol/conversation.js`. Le constructeur reçoit
un objet `{dbPath, authorize, verifyEvidence, acceptPolicy, clock}`. `dbPath`
désigne une base SQLite dédiée ; sans chemin, la base reste en mémoire.
Les trois callbacks sont obligatoires et peuvent être asynchrones.

| Méthode | Résultat |
| --- | --- |
| `apply(message)` | Promesse du résultat de la transition après commit atomique |
| `claim(claimId)` | Copie de l'état durable, ou `null` |
| `history()` | Messages et résultats ordonnés avec leur séquence durable |
| `canPromote(request)` | Booléen d'applicabilité locale des preuves |
| `close()` | Fermeture de la connexion SQLite |

La conversation suit `ASSERT → REQUEST_EVIDENCE → VERIFY → ACCEPT_UNDER_POLICY`.
Chaque étape après `ASSERT` doit citer le message précédent dans `causalRefs`.
`ASSERT` lie `provenance.producerId` à `sender.agentId` et exige des dépendances
déjà connues dans la même organisation, le même projet, la même mission, la
même conversation et les mêmes générations. Le statut est respectivement
`asserted`, `evidence_requested`, `verified`, puis `accepted`.

## Vérification et admission

`authorize(message)` doit retourner strictement `true` après authentification
de l'émetteur, de son incarnation et de son domaine de confiance, puis contrôle
de sa portée et de son autorité pour le type de message demandé. L'enveloppe
seule ne réalise aucune de ces vérifications.

`verifyEvidence({claim,message})` consulte ou exécute les vérifications réelles.
Son reçu doit porter `status: "validated"`, `claimDigest: digest(claim)`,
`subject`, `policy` et un `receiptDigest` SHA-256. L'objet, sa base,
l'environnement et la politique doivent correspondre exactement à la claim.
Le digest de la claim couvre également son prédicat, sa provenance et ses
dépendances. Un reçu fourni dans le payload ne remplace jamais ce callback.

`acceptPolicy({claim,receipt,message})` doit retourner strictement `true` selon
la politique de l'intégrateur. Les paramètres des callbacks sont des copies
profondément gelées. Le runtime n'interprète pas une sortie de commande ou une
politique métier à leur place.

`canPromote` exige `{claimId,subject,policy,generations,scope,missionId,conversationId}`.
Ces valeurs doivent venir de l'état courant de confiance chez l'appelant. Il
compare tous les champs à l'acceptation conservée et exige des dépendances
transitivement acceptées. Une nouvelle base, un nouvel environnement ou une
nouvelle génération rend le résultat inapplicable. Cette méthode ne délivre
aucune autorisation d'effet externe et ne remplace pas les gates existantes.

## Persistance et concurrence

SQLite utilise WAL, un journal append-only au niveau de l'API et une transaction
immédiate regroupant état et événement. La redélivrance exacte d'un message
retourne son résultat initial ; une réutilisation du même identifiant ou de la
même clé d'idempotence avec un contenu différent échoue. L'autorisation est
revérifiée à chaque livraison. Un message expiré échoue même s'il a déjà été vu.

Après un callback asynchrone, l'expiration est revérifiée et le commit refuse
toute modification concurrente du journal depuis le début de la transition.
L'autorité est également réévaluée juste avant le commit. L'autorité sur une
ressource externe exige toujours son contrôle au point d'application de l'effet.
L'appelant peut ensuite réessayer. Ce contrôle est conservateur : une écriture
indépendante dans la même base peut provoquer un retry.

## Limites et validation

Les méthodes de lecture sont destinées à un intégrateur de confiance ; elles
ne constituent pas une API multi-tenant exposable directement au réseau. Il
n'existe ici ni transport réseau prêt à déployer, ni signature automatique,
ni liaison automatique avec les routes HTTP/MCP de promotion. Un service qui
intègre cette bibliothèque reste responsable de ses contrôles de lecture et
d'écriture, de l'autorité et de la synchronisation de ses révisions.

Commandes ciblées :

```text
node backend/tests/test_evidence_protocol_conversation.js
node backend/tests/test_evidence_protocol_concurrency.js
```

La reprise après redémarrage, les doublons, les conflits, les reçus mal liés,
la concurrence pendant la vérification, l'expiration et les frontières de
portée et de confiance sont exercés par ces tests.
