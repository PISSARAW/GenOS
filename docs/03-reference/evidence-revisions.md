# EVIDENCE — Réfutations et accusés d'application

- **Statut** : Implémenté comme extension locale persistante des conversations.
- **Dernière revue** : 2026-11-02
- **Prérequis** : [conversations persistantes](evidence-conversations.md).

## Installation et messages

`EvidenceRevision`, dans `backend/src/services/evidenceProtocol/revision.js`,
reçoit `{conversation, verifyCounterexample}`. Le vérificateur indépendant est
obligatoire et peut être asynchrone. Le constructeur installe les handlers
sur la conversation ; les messages passent ensuite par `conversation.apply`.

| Message | Payload et conditions |
| --- | --- |
| `CHALLENGE` | `{claimId}` ; cite `lastMessageId` ; suspend immédiatement l'applicabilité |
| `COUNTEREXAMPLE` | `{claimId,counterexampleResultId,domainFingerprint}` ; cite le challenge |
| `RETRACT` | `{claimId}` ; cite `lastMessageId` ; réservé au producteur authentifié |
| `INVALIDATE_DEPENDENTS` | `{claimId,revisionMessageId}` ; cite le contre-exemple ou la rétractation |
| `ACK_APPLIED` | `{claimId,revisionMessageId}` ; cite le message `INVALIDATE_DEPENDENTS` effectivement appliqué |

Une claim réfutée, rétractée, invalidée ou suspendue ne peut pas redevenir
acceptée par un nouveau challenge ou par une vérification rejouée. Une nouvelle
conclusion exige un nouvel identifiant et une nouvelle conversation de preuve.
Le journal garde les messages antérieurs et leurs résultats.

## Contre-exemples et propagation

Le callback reçoit `{targetId,counterexampleResultId,domainFingerprint}` et
doit consulter la preuve indépendamment. Son résultat doit contenir ces trois
champs exacts, `status: "validated"` et `receiptDigest` au format SHA-256.
La propagation réutilise le `CounterexamplePropagator` existant.

Un contre-exemple valide passe la cible à `refuted`, les descendants du même
domaine à `invalidated`, et ceux dont le recouvrement est inconnu à `suspended`.
Ces changements et leur événement sont atomiques dans la base locale. La
vérification de promotion traverse aussi les dépendances : elle refuse donc
un descendant dès que sa source est seulement contestée. Une rétractation
passe la cible à `retracted` et suspend tous ses descendants.

Le profil v1 ne transporte pas de déclaration de disjonction des domaines.
Deux empreintes différentes sont traitées comme une relation inconnue.

## Accusé et reprise

`INVALIDATE_DEPENDENTS` confirme dans le journal local l'ensemble concerné et
conserve son identifiant d'application. `ACK_APPLIED` n'est accepté qu'après
cette étape, avec la même référence de révision et sa cause exacte. Son contenu
est une déclaration opérationnelle authentifiée par le callback d'autorisation.
Un accusé reçu d'une machine distante ne constitue pas une preuve indépendante
de ses effets internes. L'adaptateur doit le produire depuis son consommateur
local après commit, puis le transmettre avec l'identité de ce consommateur.

Après redémarrage, les révisions et applications conservées permettent de
redélivrer les mêmes messages sans supprimer l'historique. Le runtime ne fournit
pas de synchronisation réseau automatique : pendant une partition, un nœud
ignorant la réfutation conserve son ancien état. L'intégrateur doit imposer une
barrière de rattrapage avant toute promotion fondée sur l'état distant ; aucune
garantie de fraîcheur globale n'est déduite d'une simple reconnexion.

## Validation

```text
node backend/tests/test_evidence_protocol_revision.js
```

Le test vérifie propagation transitive, domaines inconnus, contre-exemple
falsifié, rétractation, refus d'un accusé anticipé et reprise sur base distincte
après fermeture puis réouverture de la connexion.
