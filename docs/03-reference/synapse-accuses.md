# SYNAPSE — Accusés orthogonaux et preuves historiques

- **Statut** : Implémenté, registre Node/SQLite avec sources de preuve injectées.
- **Portée** : six faits distincts concernant un contexte, un delta et son destinataire exacts.
- **Dernière revue** : 2026-11-02.

## Dimensions indépendantes

Un accusé ne se situe pas sur une échelle de compréhension. Chaque dimension
possède son propre état et sa propre preuve :

| Dimension | Fait attesté par une source de confiance |
| --- | --- |
| `transport_received` | Une livraison du message concerné a été enregistrée |
| `decoded` | Un décodeur a produit les opérations engagées sous le contexte exact |
| `state_applied` | Le destinataire a commité le résultat JSON et son reçu durable |
| `action_observed` | Une action distincte a un résultat réellement observé et lié au sujet |
| `independently_verified` | Un vérificateur a testé un prédicat précis sous un environnement et une politique identifiés |
| `human_authorized` | Une source authentifiée a confirmé une autorisation humaine portant sur ce sujet |

Il n'existe aucune implication entre ces dimensions. Une autorisation humaine
ne produit pas de preuve de test. Une application d'état ne crée pas
automatiquement un accusé de décodage ou une observation d'action externe.
`decoded` décrit une opération mécanique du codec, pas une preuve de
compréhension mentale.

Le service natif
[`communication/groundingService.js`](../../backend/src/services/communication/groundingService.js)
utilise une échelle `LEVEL_RANK`. Elle n'est pas importée comme moteur de
qualification SYNAPSE. En particulier, une ligne `human_confirmation` ne suffit
à établir ni `human_authorized`, ni `independently_verified`, ni une dimension
de rang supposé inférieur. Ses références de transport, de contexte, de preuve
et d'autorité doivent être établies séparément.

## API du registre

[`AcknowledgementLedger`](../../backend/src/services/synapseProtocol/acknowledgements.js)
reçoit les options suivantes :

```javascript
{
  dbPath, authorize, resolveSubject, clock,
  observeTransport, verifyDecoded, verifyApplied, observeAction,
  verificationContext, verifyEvidence, verifyHumanApproval
}
```

`authorize` et `resolveSubject` sont obligatoires. Chaque dimension exige son
callback dédié ; une source absente est refusée. L'intégration n'a donc pas
besoin d'inventer une source d'approbation humaine ou d'action observée pour
activer les autres dimensions.

`apply(envelope)` accepte seulement `ACK_FACT`, dont le payload est
`{ ackId, deltaId, deltaDigest, dimension, subjectDigest, evidenceRef }`.
L'émetteur doit être le destinataire du delta et l'audience le producteur du
contexte. Le callback d'autorisation confronte ces identités au canal
authentifié, à l'autorité et aux générations réelles ; un champ d'enveloppe
ou un hash ne les authentifie pas.

`query` a exactement les champs
`{ scope, missionId, conversationId, deltaId, deltaDigest }`. La portée contient
une organisation et un projet explicites. `resolveSubject(query)` consulte le
service réel de conversation et retourne `{ context, delta, receiver }`.
Le sujet engage le contexte complet, le descripteur de delta — dont
`operationsDigest`, `baseDigest` et `targetDigest` — et le destinataire figé.
`subjectDigest = digest(subject)`. Un changement de ces éléments exige un autre
sujet et une autre preuve.

Les identités de message, d'idempotence et de fait sont liées à la portée,
la mission, la conversation, l'émetteur et l'audience. Répéter exactement un
message retrouve son résultat ; réutiliser son identité avec un autre contenu
est un conflit. Une lecture avec un autre scope ou delta ne récupère pas les
faits du sujet initial.

## Sources et preuves

Les sources reçoivent une copie gelée de :

```javascript
{
  query, subject, subjectDigest, evidenceRef,
  verificationContext // uniquement pour independently_verified
}
```

`evidenceRef` est une référence permettant à la source de retrouver un fait ;
ce n'est pas un reçu fourni par le demandeur. Le callback doit lire ou vérifier
le fait réel dans sa source autoritative. Hacher une réponse fabriquée ne
remplit pas ce contrat.

Les reçus transport, décodeur, action et humain doivent porter un
`requestDigest = digest(request)` et un `receiptDigest`. Les données requises
s'ajoutent selon la dimension :

- Transport : `status: "received"`, `sourceReceiptDigest` d'une livraison réelle.
- Décodage : `status: "decoded"`, `contextDigest`, `operationsDigest` et
  `sourceReceiptDigest` du vrai résultat du décodeur.
- Action : `status: "observed"`, `actionId`, `subjectDigest`, `outcomeDigest` ;
  un résultat ambigu porte explicitement `status: "outcome_unknown"`.
- Humain : `status: "authorized"`, `approvalId`, `humanId`, `subjectDigest`,
  politique `{ policyId, version }` et `expiresAt` valide. La source doit
  authentifier la personne et l'approbation, pas reprendre un simple identifiant
  d'approbateur reçu dans le message.

Pour `state_applied`, `verifyApplied` retourne le véritable reçu du runtime
SYNAPSE, via son getter autorisé `receipt(query)`. Le registre exige tous les
champs exacts du profil `genos.synapse.state-receipt/v1` : portée et dialogue,
delta, contexte, base, résultat, générations précédente/nouvelle, message
d'application et destinataire. Un digest de reçu arbitraire, un autre résultat
ou un statut déclaré ne suffit pas. Le reçu doit déjà avoir été commité avec
l'état JSON ; le registre d'accusés n'effectue pas lui-même l'application.

## Vérification indépendante

`verificationContext({ query, subject, subjectDigest })` consulte une
configuration de confiance et retourne
`{ environmentDigest, policy: { policyId, version }, predicateDigest }`.
La portée est incluse pour éviter une résolution implicite dans le mauvais
projet ou la mauvaise mission.

`verifyEvidence` doit réellement tester le prédicat ou consulter sa preuve
indépendante autoritative pour le résultat exact. Son reçu porte
`status: "verified"`, `requestDigest`, `receiptDigest`, `subjectDigest`, les
trois champs de qualification ci-dessus, `verifier` comme acteur et :

```javascript
independence: {
  execution: true, provenance: false, method: false,
  statisticalIndependence: "not_established"
}
```

Au moins une séparation observable doit être établie ; l'acteur producteur ne
peut pas être son propre vérificateur indépendant. L'intégration doit justifier
ces séparations. Les noms d'acteurs différents ne prouvent pas à eux seuls une
indépendance de provenance ou de méthode. Le registre conserve la qualification
exacte et refuse d'annoncer une indépendance statistique démontrée.

Le contexte de vérification est relu après la preuve et lors de l'admission
transactionnelle. Un changement observable d'environnement ou de politique
pendant l'attente refuse le fait. Cela n'étend pas une ancienne preuve à un
nouveau contexte.

## Persistance, lecture et action ambiguë

Le fait, son reçu et son événement d'observation sont écrits atomiquement dans
le registre SQLite, avec WAL et synchronisation `FULL`. L'admission attend le
mutex transactionnel, contrôle l'autorisation, puis relit le sujet et le
contexte de preuve. Il contrôle enfin les preuves et l'expiration avant
d'inscrire le résultat. Les paramètres et preuves des
callbacks sont détachés des données persistées.

`facts(query)` retourne les six dimensions, leurs indicateurs `established` et
`outcomeUnknown`, ainsi que les reçus. `implicationRules` reste vide,
`externalActionsAuthorized` vaut `false` et `currentApplicability` vaut
`not_evaluated`. Les reçus portent `applicableAt`, `historicalFactOnly: true`,
le sujet exact, la référence au reçu source et la qualification utile —
vérificateur et séparations, ou personne/politique/date d'approbation.

Ce sont des faits historiques : leur présence ne prouve pas qu'une ancienne
autorisation humaine est encore valide ou qu'un autre environnement satisfait
aujourd'hui le prédicat. Une nouvelle décision doit évaluer son contexte et
ses droits actuels.

`receipt({ ...query, ackId })` lit le reçu courant d'un fait et
`history({ ...query, ackId })` conserve les observations successives.
`reconcileAction({ ...query, ackId })` relit seulement la source d'observation
d'une action ambiguë. Il ne déclenche pas cette action. Un ancien message
idempotent conserve sa réponse initiale, tandis que l'historique rend visible
la résolution ultérieure de l'incertitude. Si une source est indisponible,
aucune observation positive n'est admise.

Les lectures sont autorisées avant et après l'attente du mutex. Le profil
initial utilise un fichier de registre d'accusés distinct de celui de la
conversation lorsque ses callbacks interrogent une autre connexion SQLite.
Il n'annonce pas de transaction répartie entre les deux registres : le reçu
d'application lu appartient à un commit réel antérieur. Deux connexions au
même fichier, interrogées réciproquement pendant une transaction, doivent être
évitées ou coordonnées par une intégration transactionnelle commune.

Les getters de sujet et de qualification sont des observations de confiance :
ils ne doivent modifier ni les droits ni l'environnement qu'ils décrivent.
Les callbacks d'autorisation sont aussi des décisions sans mutation des droits
ou du contexte pendant leur évaluation ; une mise à jour de configuration est
une opération distincte coordonnée par le verrou ou la génération applicables.
Un service distant pouvant changer indépendamment après sa dernière lecture
nécessite un adaptateur avec génération commune ou verrou autoritatif pour
garantir une admission simultanée. Le mutex du registre ne verrouille pas ces
services distants.

## REFLEX et absence d'action implicite

Le sous-profil exécutable `SYNAPSE/REFLEX` reste hors de cette première version.
Le service natif
[`signalReceptorService.js`](../../backend/src/services/signalReceptorService.js)
peut notamment réveiller un worker, modifier un agent ou changer une organisation.
Sa fonction de dispatch n'est pas appelée par ce registre. Aucun accusé, aucune
réception et aucune observation n'accorde implicitement le droit de déclencher
ces actions.

Une extension REFLEX devrait ajouter une inbox durable avec signaux typés,
priorité, expiration et déduplication, puis une autorisation séparée au point
d'action. Elle devrait conserver une intention d'effet avant dispatch et
traiter les issues inconnues avec réconciliation, comme le profil OMEGA. Un
simple appel à `matchAndDispatch` ne fournirait pas ces garanties. Aucun faux
dispatcher ou acquittement d'action n'est publié pour simuler cette extension.

## Vérification

`node backend/tests/test_synapse_acknowledgements.js` et
`node backend/tests/test_synapse_acknowledgements_races.js` couvrent notamment
l'approbation humaine de fixture sans vérification implicite, le véritable
prédicat JSON exécuté dans un processus séparé, le refus d'un niveau de
grounding comme preuve, les observations ambiguës, les doublons, les portées,
les courses de contexte et les transactions annulées. Les approbations humaines
des tests sont des fixtures explicites, jamais une approbation réelle de
l'utilisateur pour une action métier.
