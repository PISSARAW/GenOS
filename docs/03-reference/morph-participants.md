# MORPH — Participants transactionnels

- **Statut** : Implémenté pour un état d'organisation JSON répliqué localement.
- **Portée** : préparation, application et reprise sur une base SQLite par nœud.
- **Dernière revue** : 2026-11-02.

Le module [`participant.js`](../../backend/src/services/morphProtocol/participant.js)
expose `MorphParticipant({ dbPath, participantId, authorize, verifyDecision,
verifyCheckpoint })`. Les trois callbacks sont obligatoires. `participantId`
est un acteur `{ agentId, incarnationId, trustDomain }` du roster de nœuds
`plan.participants`, distinct du roster logique `snapshot.members` des agents
du collectif. L'identité du nœud est liée à sa base ; une réouverture sous une
autre identité est refusée.

## Préparation et quiescence

`bootstrap({ scope, version }, sourceSnapshot)` provisionne l'état initial
uniquement après autorisation de confiance. Une base déjà initialisée ne peut
pas être remplacée par un ancien snapshot.

Le binding `B` est composé de `transitionId`, `planDigest`, `checkpointDigest`,
`scope`, `sourceVersion`, `targetVersion`, `missionId` et `conversationId`.
`checkpointDigest = digest(plan.sourceSnapshot)` et
`targetVersion = sourceVersion + 1`. Les générations d'incarnation et de
workspace ne sont pas assimilées à cette version de l'organisation.

`quiesce({ ...B, plan })` vérifie le contrat, la conservation, le roster du
nœud, la version locale et l'intégralité du snapshot source. Il persiste ensuite
le gel avant toute préparation. `prepare({ ...B, plan })` effectue lui-même cette
étape si nécessaire, puis appelle :

```javascript
verifyCheckpoint({
  query: B, participant: participantId,
  sourceSnapshot: plan.sourceSnapshot,
  targetSnapshot: plan.targetSnapshot
})
```

Le callback doit vérifier les références et la complétude de l'état dont ce
nœud est responsable. Il retourne
`{ status: "validated", requestDigest: digest(request), receiptDigest }`.
La présence d'une empreinte ne remplace ni cette vérification ni une identité
authentifiée. L'autorisation est réévaluée après l'attente du callback ; le CAS
local refuse une préparation devenue caduque, notamment après un abandon.

Un échec laisse le nœud gelé. L'absence de réponse ne justifie pas une reprise
spontanée de ses actions.

## Décision, application et reprise

`commit(B)` et `abort(B)` interrogent `verifyDecision(B)`, adaptateur de confiance
qui lit la décision durable du coordinateur. Son résultat doit être :

```javascript
{
  decision: "COMMIT", // ou "ABORT"
  ...B,
  decisionDigest: digest({
    profile: "genos.morph.decision/v1", decision: "COMMIT", ...B
  })
}
```

Le hash lie les champs mais n'authentifie pas le coordinateur : l'adaptateur
doit consulter une source autoritative. Une décision inconnue ou contradictoire
exige une récupération ; un timeout ne permet jamais de déduire `ABORT`.

Un `COMMIT` exige une préparation locale réussie. La nouvelle organisation,
son snapshot complet, sa version et le reçu `APPLIED` sont écrits dans une même
transaction SQLite `IMMEDIATE`, avec WAL et synchronisation `FULL`. Un échec
de persistance du reçu annule aussi le remplacement du snapshot. Un `ABORT`
fiable libère le gel en gardant le snapshot et la version source. Une transition
résolue ne peut pas être préparée de nouveau.
L'identifiant de transition est lié durablement à son binding complet dans
chaque portée ; le réutiliser avec un autre plan, une autre mission ou d'autres
versions est refusé même après résolution et redémarrage.

Les reçus `ready`, `applied` et `aborted` reprennent `B` et
`participant: participantId`. Leur `receiptDigest` est
`digest({ profile: "genos.morph.participant/receipt/v1", status, ...B, participant })`.
`receipt(B)` retourne le reçu appliqué, ou à défaut le reçu prêt ;
`readyReceipt(B)` conserve l'accès au reçu prêt historique. Une répétition
exacte de commit/abort retourne le reçu durable, sans réappliquer le snapshot.
Un reçu historique ne prouve pas que sa version est encore courante.

`status({ scope })` expose l'état courant, notamment `phase` (`active`,
`quiesced` ou `prepared`), `version`, `snapshot` et la transition en attente.
Les lectures administratives d'état et de reçus sont réservées à l'intégration
de confiance ; elles ne constituent pas une API publique de lecture des agents.

## Audiences et qualification des vérificateurs

`readMessage({ scope, reader, messageId })` exige que `reader` soit un membre
actuel et qu'il figure exactement dans l'audience figée de ce message. Un
membre recruté lors d'une morphogenèse ne gagne donc pas l'accès aux messages
anciens. Le résultat est uniquement la métadonnée d'audience et son empreinte :
le profil ne stocke pas le payload brut des messages. Les lectures réelles du
transport doivent appliquer la même règle et confronter le contenu à cette
empreinte.

`canVerify({ scope, claimId, verifierIds, minimumIndependentGroups })` calcule
une qualification déclarative du roster historique de la claim. Il exige que
`claim.content.verifierIds` corresponde à la liste demandée. Le sous-profil
interprète `provenance[].content` comme
`{ origins: [string], executionId, methodId }` et
`dependencies[].content.agentIds` comme un groupe corrélé. Un format inconnu
refuse la qualification. Les dépendances sont fermées transitivement, y compris
à travers un agent intermédiaire absent du roster de vérificateurs.

Le résultat publie `allowed`, `independentGroups`, les `methodGroups` si
disponibles et `statisticalIndependence: "not_established"`. Les groupes reposent
sur les origines, l'exécution et les dépendances déclarées ; partager une
méthode reste visible séparément. Ils ne prouvent pas une indépendance
statistique. Passer de Syncytium à Trinity conserve ces métadonnées et ne peut
donc pas convertir des clones en confirmations indépendantes.

Cette méthode est un contrôle d'admissibilité, pas une vérification exécutée
de la claim. Elle ne produit pas de preuve nouvelle et n'autorise aucune
promotion.

## Actions et frontières d'intégration

`act({ scope, actor, version, operationId, content })` est un append local
protégé utilisé pour rendre le gel vérifiable : l'acteur doit appartenir au
roster courant, sa version doit être actuelle et la phase doit être `active`.
L'admission et l'append sont transactionnels et les répétitions sont idempotentes.
Il ne fournit pas de callback d'effet externe et ne modifie pas le snapshot
organisationnel. Les adaptateurs d'actions réelles doivent imposer le même gel
à leur propre point d'application et transférer leurs effets encore inconnus.

`authorize({ action, request, participant })` reçoit une copie gelée. Il doit
authentifier le demandeur hors payload, vérifier la portée et distinguer
provisionnement, coordination et lectures d'agents. Les callbacks de checkpoint
et de décision doivent aussi confirmer la couverture réelle des membres par
les nœuds participants. Un plan ne peut pas inventer des votes en inscrivant
des acteurs arbitraires.

Ce module ne crée pas de consensus réparti, ne rollback pas des effets externes,
ne déduit pas une autorité de l'existence d'un snapshot et ne contourne ni les
gates P0/canary ni les leases des intégrations existantes.

## Vérification

`node backend/tests/test_morph_protocol_participant.js` et
`node backend/tests/test_morph_protocol_participant_races.js` couvrent la reprise
après quiescence et application, les doublons, l'interdiction de rollback après
commit, une panne de journalisation, la révocation pendant un checkpoint, un
abandon concurrent, les audiences figées et les dépendances historiques.
