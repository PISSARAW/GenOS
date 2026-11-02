# CONTINUITY — Reconnaissance d'identité

- **Statut** : Implémenté comme API locale expérimentale Node/SQLite
- **Portée** : Reconnaissance bornée, sans transfert de permissions
- **Dernière revue** : 2026-11-02

La [conversation](../../backend/src/services/continuityProtocol/recognition.js)
applique `PRESENT → CHALLENGE → ATTEST → CONTINUITY_PROOF`. Un résultat reconnu
établit seulement ce que le vérificateur de confiance a confirmé. Il ne suffit
pas à autoriser une action sur une ressource ou à activer une autre incarnation.

## API

`RecognitionConversation(options)` exige `authorize` et `verifyAttestation`,
deux callbacks asynchrones. `dbPath` sélectionne le magasin SQLite ; sans ce
paramètre, le magasin est en mémoire et ne survit pas au processus. `clock`
retourne une date RFC 3339 ou des millisecondes Unix. `maxChallengeTtlMs` borne
le défi, à 300 000 millisecondes par défaut. `newNonce()` crée un nonce aléatoire
de 256 bits à transmettre dans `CHALLENGE`.

| Méthode | Résultat |
| --- | --- |
| `apply(message)` | Valide et applique une transition ou rejoue son résultat exact |
| `state({scope, missionId, conversationId})` | Copie détachée de la session ou `null` |
| `history()` | Journal local ordonné, jamais remplacé par une restauration |
| `close()` | Ferme le magasin |

Les méthodes de lecture sont destinées au code local de confiance. Un éventuel
endpoint doit imposer sa propre autorisation de lecture et sa portée.

## Frontières de confiance

`authorize(message)` reçoit une copie profondément figée du message. Il doit
retourner exactement `true` après confrontation au contexte authentifié, à la
portée et aux autorités courantes. Il est rappelé après une vérification
asynchrone, avant le commit. Une révocation ou une expiration survenue pendant
un callback annule la transition.

`verifyAttestation(request)` reçoit les messages complets et figés :

```javascript
{
  presentation: presentMessage,
  challenge: challengeMessage,
  attestation: attestMessage
}
```

Le reçu doit contenir exactement les liaisons suivantes pour être recevable :

```javascript
{
  status: 'validated',
  requestDigest: digest(request),
  proofDigest: request.attestation.payload.proof.proofDigest,
  historyRetained: true
}
```

`digest` provient de la canonicalisation EVIDENCE. Le callback doit examiner la
preuve réelle, l'origine, le défi et l'histoire ; fabriquer les valeurs de ce
reçu à partir des seules données reçues ne réalise aucune vérification.
Le reçu lie les métadonnées complètes, donc l'audience, la portée, la mission,
les générations et les incarnations, en plus du contenu des messages.

L'API n'est pas raccordée automatiquement au registre d'identité existant
(`identity/ledger`, incarnations et checkpoints), à un fournisseur de certificats
ou à une frontière réseau. Une intégration doit faire vérifier ces états par
les callbacks, avec leur authentification réelle. Les tests injectent des
vérificateurs déterministes ; ils valident la mécanique et ses refus, sans
attester une identité extérieure.

## Relations reconnues

| Relation | Invariants locaux |
| --- | --- |
| `continuation` | Même individu, nouvelle incarnation, même mission et branche |
| `restore` | Même individu, nouvelle incarnation, même mission et branche, histoire conservée |
| `fork` | Nouvel individu, nouvelle incarnation et nouvelle branche |
| `succession` | Nouvel individu, nouvelle incarnation, mission et branche conservées |

La présentation doit être émise par l'identité présentée et viser un acteur
distinct. La mission d'enveloppe correspond à cette identité. Le candidat émet
`PRESENT` et `ATTEST` ; le destinataire émet `CHALLENGE` et `CONTINUITY_PROOF`,
avec les audiences inversées. La génération d'incarnation de chaque rôle reste
constante. Les générations d'organisation et de workspace sont communes à
toute la conversation et ne deviennent pas des générations d'autorité.

Toute relation exige `historyRetained: true` dans le reçu lié. Le journal garde
la présentation du prédécesseur et les événements suivants ; le service ne
réinitialise jamais l'histoire sur la seule base d'un checkpoint. La réalité
de cette conservation dans le registre d'identité demeure une obligation du
vérificateur de confiance.

Chaque résultat expose `permissionsInherited: false` et
`authorityTransferred: false`, y compris après `CONTINUITY_PROOF`. Une
succession reconnue doit encore achever un handoff et franchir le contrôle
d'autorité de la ressource avant de produire des effets protégés.

## Défis, idempotence et reprise

Le défi doit référencer la présentation exacte. Son expiration est limitée par
le plafond local et les expirations des enveloppes de présentation et de défi.
Un `ATTEST` doit reprendre le nonce, la référence du défi et l'empreinte du
payload de présentation. La preuve finale reprend l'attestation exacte et
l'empreinte vérifiée. Chaque étape cite le message précédent dans `causalRefs`.

Les nonces sont uniques dans le magasin et conservés après consommation. Le
commit de l'attestation consomme le nonce atomiquement avec la mise à jour de
session et le journal. Une attestation rejetée ne modifie pas la session et ne
consomme pas le nonce. Un second défi ne peut pas réutiliser ce nonce dans une
autre conversation, y compris après redémarrage du magasin.

Le magasin SQLite WAL conserve messages, résultats et empreintes. Une reprise
exacte rend le résultat enregistré sans réappliquer la transition ; une même
identité de message ou clé d'idempotence réutilisée avec un autre contenu est
rejetée. Une écriture concurrente pendant un callback rend l'état attendu
obsolète et exige une reprise sur l'état courant. Les callbacks doivent être
des vérifications sans effet externe irréversible.

Après expiration du défi, une nouvelle reconnaissance exige une nouvelle
conversation et un nouveau nonce. Une lecture d'un ancien résultat ou un
rejeu de résultat n'atteste pas une autorité courante. Aucun état reconnu ne
doit servir de cache permanent de permissions.

## Validation

Depuis la racine : `node backend/tests/test_continuity_protocol_recognition.js`.
Le test couvre les quatre relations, la reprise SQLite, les nonces, les reçus
mal liés, les audiences, les générations, les messages hors ordre, l'expiration,
la révocation pendant un callback et l'absence de droits hérités.

Voir le [contrat commun](protocole-continuity.md) et
l'[ADR](../adr/2026-11-02-protocole-continuity.md).
