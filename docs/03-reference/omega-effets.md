# OMEGA — Autorisation, reçu et issue inconnue des effets

- **Statut** : Implémenté pour un journal d'intentions et un récepteur clé/valeur SQLite.
- **Portée** : `CALL`/`EMIT` installés explicitement dans un adaptateur de confiance.
- **Dernière revue** : 2026-11-02.

## Séparation des décisions

[`EffectGate`](../../backend/src/services/omegaProtocol/effects.js) reçoit
`{ dbPath, authorize, verifyEvidence, dispatch, reconcile, clock }`. Les quatre
callbacks sont obligatoires. Une autorisation humaine éventuelle est contrôlée
par `authorize` selon la politique ; elle ne remplace pas `verifyEvidence`.
L'existence d'un candidat sélectionné, un hash ou un accusé réseau ne prouve
pas la propriété vérifiée de ce candidat.

La requête d'effet est un objet strict portant :

- les identifiants `effectKey`, `runId`, `planId`, `stepId`, `missionId`,
  `conversationId` et la portée `scope` organisation/projet ;
- les empreintes `planDigest`, `programDigest`, `capabilitiesDigest`,
  `policyDigest`, `baseDigest`, `environmentDigest` ;
- `runtimeId`, `runtimeGeneration`, `generations` incarnation/organisation/workspace ;
- `actor` agent/incarnation/domaine et `authority` identifiant/génération ;
- `kind` (`CALL` ou `EMIT`), `reference`, `resourceId`, `action`, `cost` ;
- le `candidate` JSON exact, son `candidateDigest`, le `proofReceipt` JSON ou
  `null`, le `budget` unité/plafond/dépense/réserve et `expiresAt`.

`candidateDigest = digest(candidate)`. `effectKey` est calculé par
`digest({ scope, missionId, conversationId, runId, planDigest, stepId })`.
Une même clé avec d'autres champs est un conflit, même si le transport a réussi.
Les empreintes suivent la canonicalisation EVIDENCE et les entiers sont sûrs,
positifs ou nuls. Le candidat est limité à 65 536 octets UTF-8.

Le runtime reconstruit ces champs depuis le plan admis et ses résolveurs de
confiance ; le demandeur ne s'accorde pas son budget ou sa capacité en les
inscrivant dans un payload. `verifyEvidence(request)` doit confronter le
prédicat, le candidat, le reçu `CHECK`, la base, l'environnement et la politique
applicables. Il retourne
`{ status: "validated", requestDigest: digest(request), receiptDigest }`.
L'empreinte lie cette vérification à la requête ; l'identité et la réalité des
preuves restent établies par l'adaptateur.

## Machine d'état

1. `requestEffect(request)` persiste `REQUEST_EFFECT`, état `requested`.
2. `authorizeEffect({ effectKey })` contrôle droits, preuves et expiration,
   réévalue les droits après l'attente et persiste `AUTHORIZE_EFFECT`.
3. `dispatchEffect({ effectKey })` refait ces contrôles et persiste
   `DISPATCH_INTENT`, état `dispatching`, **avant** d'appeler le handler.
4. Un reçu exact persiste `EFFECT_RECEIPT`, état `completed`.
5. Une exception, une réponse non liée à la requête ou une reprise avec une
   intention de dispatch sans reçu produit `effect_outcome_unknown`.

`effect(request)` compose les trois premières étapes. Une répétition avec un
reçu connu le restitue ; une issue inconnue est renvoyée sans redéclencher le
handler. Le journal d'exécution appelant conserve alors l'opération en attente
de récupération. Une reconstruction de requête lors d'un `RESUME` doit garder
les mêmes champs, notamment l'allocation de budget admise.

Le reçu du profil local est :

```javascript
{
  status: "completed", effectKey,
  requestDigest: digest(request), result,
  receiptDigest: digest({
    profile: "genos.omega.effect-receipt/v1",
    status: "completed", effectKey,
    requestDigest: digest(request), result
  })
}
```

Le récepteur fourni retourne le candidat écrit comme `result`. Un reçu n'est
accepté que s'il correspond exactement à la requête et au profil. Il atteste
un effet observé ; il ne rétablit pas une autorité révoquée et ne prouve pas
que la base ou l'environnement sont encore actuels.

## Réconciliation et expiration

`reconcileEffect({ effectKey })` utilise le callback d'observation autoritatif.
Un endpoint indisponible, une réponse inconnue ou un reçu contradictoire laisse
l'issue inconnue. Un reçu exact déjà enregistré chez le récepteur termine le
journal local sans renvoi de l'effet.

La réconciliation reste possible après `expiresAt` sous une autorisation
d'audit actuelle : observer une ancienne action n'en autorise pas une nouvelle.
Une expiration n'efface pas un effet déjà appliqué. Les contrôles de fraîcheur
restent obligatoires pour tout nouveau dispatch et pour une nouvelle tentative.

Le récepteur peut retourner une attestation `not_applied`, liée à la requête,
avec `retrySafe: true` et une empreinte du profil
`genos.omega.effect-reconciliation/v1`. Pour ce récepteur SQLite, elle signifie
qu'aucun commit n'est actuellement enregistré et que sa déduplication durable
protège une répétition **de la même clé et du même contenu**, même si le premier
envoi arrive en retard. Un adaptateur externe ne doit émettre cette attestation
que s'il peut garantir une sécurité équivalente, notamment sur les opérations
encore en vol.

Cette attestation ne déclenche rien automatiquement. `retryEffect({ effectKey })`
exige cet état, une nouvelle autorisation explicite, les preuves applicables et
une fenêtre encore valide. Une absence de réponse ou un simple timeout ne vaut
jamais `not_applied`.

## Récepteur atomique avec fencing

[`OmegaEffectResource`](../../backend/src/services/omegaProtocol/resource.js)
reçoit `{ dbPath, authorize, verifyEvidence, clock }`. Ces deux callbacks sont
obligatoires et le récepteur refait ses propres vérifications ; il ne déduit
pas un droit d'un reçu hashé présenté par l'émetteur.

`bootstrap({ scope, actor, authority, budget, permissions })` est réservé au
provisionnement autorisé. Une permission installée est
`{ resourceId, reference, action, cost }`. Le tarif ne provient donc pas du seul
`cost` envoyé. Une base initialisée ne peut pas être remplacée par une copie
ancienne. `fenceAuthority({ scope, previousActor, previousAuthority, actor,
authority })` exige un CAS propriétaire/génération et un avancement exact d'une
génération, en conservant budget et permissions.

`execute(request)` vérifie l'identité et la génération actuelles, les droits
et le tarif installés, la fraîcheur et le budget, après les callbacks et au
point d'écriture. La valeur `candidate`, le reçu/dedup par `effectKey` et la
dépense réelle sont inscrits dans une transaction SQLite `IMMEDIATE`, WAL,
synchronisation `FULL`. Le contrôle du fencing précède même une réponse de
déduplication d'exécution ; une ancienne incarnation est refusée.

L'allocation jointe à la requête garde l'unité, le plafond et la réserve admis.
Sa dépense initiale peut être antérieure au compteur autoritatif courant, jamais
supérieure. Chaque effet nouveau consomme son coût sur ce compteur réel et
préserve la réserve. Deux doublons ne consomment pas deux fois le budget.

`reconcile(request)` observe ce journal atomique sans imposer la fraîcheur de
l'ancienne autorisation d'effet, sous les droits d'audit actuels.
`authority(scope)`, `effects(scope)` et
`value({ scope, resourceId, action })` servent aux intégrations administratives.

## Frontières et limites

`authorize({ action, request })` reçoit une copie gelée et doit authentifier
l'appelant à partir du canal et de sa politique, pas du seul champ `actor`.
Les lectures directes `EffectGate.state/history` contiennent le candidat et
restent réservées au code de confiance. Un endpoint de protocole doit vérifier
la portée, l'acteur et l'audience avant d'exposer ces données ou une réconciliation.

Un handler externe peut appliquer l'effet puis perdre sa réponse. Le journal
local ne peut pas le rollback ; il conserve explicitement l'incertitude.
Les garanties de ce récepteur local ne constituent pas un « exactement une
fois » générique sur Internet. Les capacités `durable_intent`, `idempotency`,
`reconciliation` et `fencing` ne peuvent être annoncées que pour un adaptateur
installé qui les fournit réellement. La présence de callbacks seule ne les
prouve pas.

Une copie d'une base ou un ancien cache n'est pas la ressource autoritative.
Tous les effets protégés doivent passer par cette ressource unique, ou par un
endpoint qui fournit les mêmes contrôles atomiques. Le module ne remplace pas
les leases, le contrôle d'effets externes Ω, la politique de promotion ou une
signature cryptographique.

## Vérification

`node backend/tests/test_omega_protocol_effects.js` et
`node backend/tests/test_omega_protocol_effects_races.js` couvrent la coupure
après commit distant, la reprise sans redispatch, l'endpoint indisponible, la
réconciliation après expiration, une attestation négative suivie d'une tentative
explicitement autorisée, le fencing, les budgets, les collisions de contenu,
les portées distinctes et le rollback d'une panne de persistance du reçu.
