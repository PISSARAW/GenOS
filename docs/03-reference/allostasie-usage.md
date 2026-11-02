# ALLOSTASIE — usage, libération et préemption

Le module `allostasisProtocol/usage.js` comptabilise une consommation observée
sur une allocation réelle. Une annulation ou une préemption libère une capacité
inutilisée ; elle ne rembourse jamais des tokens, un appel ou un coût déjà
consommés. Une issue inconnue reste une dette d'observation, jamais un zéro.

## Registre et connexions natives

`AllostasisUsage` reçoit l'instance `AllostasisAllocator` et utilise exactement
sa connexion SQLite et son mutex transactionnel. Les compteurs du pool,
l'allocation, les opérations, les observations et les réponses idempotentes
sont committés ensemble. Une erreur d'écriture annule la transaction entière.

Le registre typé conserve six unités entières distinctes : `tokens`, `bytes`,
`milliseconds`, `model_calls`, `micro_EUR` et `micro_USD`. Aucune conversion de
bytes en tokens, ni d'EUR en USD, n'est implicite. `ratio_ppm` est une unité de
diagnostic et n'accorde aucun quota.

Le bridge de l'allocateur réutilise réellement
`modelBudgetReservationService` pour les tokens et les micro-USD. Une
réservation native active ou incertaine retient `spent + held`, et non le seul
solde non consommé. Le bridge ne clôture pas une réservation native à chaque
rapport partiel. Les conversions vers les USD flottants natifs sont bornées
et doivent préserver le montant entier lors du retour en micro-unités.
Un dépassement réellement observé hors plage native reste comptabilisé dans
le registre entier, avec le diagnostic `nativeBridge: bridge_unavailable`.
L'ancienne rétention native demeure en place ; l'indisponibilité du bridge ne
transforme pas cette dette en capacité libre. Un delta monétaire impossible
à représenter fidèlement reçoit une métrique native `unavailable`, tandis
que son montant entier exact reste dans ALLOSTASIE.

Le service `metabolicLedgerService` reçoit les deltas mesurés compatibles avec
ses métriques : `billableTokens`, `runtimeCostUsd`, `activeTimeMs` ou
`wallTimeMs`. Un temps en millisecondes exige un `metricId` explicite et stable
par opération ; un temps mural n'est pas présenté comme du temps CPU. Les
autres unités gardent leurs observations typées dans le registre ALLOSTASIE,
sans inventer de métrique native équivalente.

Si la mesure est déjà inscrite dans le ledger natif, la source peut fournir
`nativeObservationId`. Le bridge vérifie cette observation immuable : scope,
mission, opération, métrique, delta et source doivent correspondre exactement.
Il réutilise alors le reçu sans compter la consommation une seconde fois.
L'attribution durable lie aussi l'identifiant du reçu de consommation : un
échantillon ne peut pas justifier un second incrément, même sur la même
allocation et la même opération. Un pipeline cumulatif choisit un writer canonique et des
deltas cohérents ; ce mécanisme n'est pas une déduplication heuristique entre
deux rapports de consommation différents.

Les anciens `resourceLedgerService`, `resourceReservationService` et
`metabolicStateService` reposent sur des `Map` en mémoire. Ils ne sont pas
l'autorité durable de ce profil, notamment parce qu'une purge TTL ne peut
attester la fin d'une consommation distante.

## API et source des observations

```js
const usage = new AllostasisUsage({
  allocator,
  authorize,   // obligatoire : principal authentifié, scope et opération
  verifyUsage, // obligatoire : lecture de la source de consommation réelle
  clock,
});
await usage.ready;
```

La requête d'allocation est exacte :

```js
{ scope, missionId, conversationId, allocationId, allocationDigest }
```

Elle doit retrouver l'allocation immuable et le pool correspondants dans le
registre. Le digest d'une allocation ne prouve pas l'identité de son émetteur.
L'autoriseur doit relier le canal authentifié aux acteurs, à l'autorité, aux
générations et aux droits courants. `verifyUsage` doit retrouver une mesure
réelle liée à cette allocation et à l'opération, pas approuver un montant
simplement déclaré par le client.

Avant tout appel susceptible de consommer :

```js
await usage.expose({ query, operationId, maximumAmount, purpose: 'work' });
```

Cette méthode écrit une intention durable et réserve l'exposition dans le
montant déjà alloué. Elle n'exécute aucun fournisseur et retourne
`effectDispatched: false`. Un crash immédiatement après cette écriture laisse
une exposition à réconcilier. L'intégration doit imposer ce passage avant
l'effet ; ce module ne peut pas intercepter un appel externe qui le contourne.
La borne de consommation doit être applicable au fournisseur ; elle n'est pas
une mesure de consommation.
Un rejeu d'intention retourne `exposure_existing` et indique qu'une observation
est nécessaire si l'opération n'est pas finale. Il n'autorise jamais un nouvel
appel : `newDispatchAuthorized` reste `false`, y compris au premier passage.

`apply(envelope)` accepte `REPORT_USAGE`, `RELEASE` et `PREEMPT`.
`reconcile(envelope)` accepte seulement un nouveau `REPORT_USAGE` : c'est une
observation, sans relance de l'effet. `state(query)` expose le compte courant,
les opérations et l'historique sous autorisation.

Un rapport contient :

```js
{
  allocationId, allocationDigest, operationId, receiptId,
  cumulativeAmount, status: 'known' | 'unknown', unit, evidenceRef
}
```

La source de confiance reçoit une copie gelée :

```js
{ query, allocation: immutableGrant, report: payload }
```

Elle renvoie une preuve typée :

```js
{
  requestDigest, receiptDigest, evidenceRef,
  status: 'known' | 'unknown',
  cumulativeAmount: integerOrNull,
  final: boolean,
  source: 'exact' | 'provider_receipt' | 'unavailable',
  metricId // activeTimeMs ou wallTimeMs pour milliseconds
}
```

`requestDigest` doit couvrir exactement la requête. Ce contrôle d'intégrité
complète le callback de confiance ; il ne transforme pas un hash fourni par
un client en reçu authentique.

Un usage connu exige un entier mesuré, une source `exact` ou
`provider_receipt`, et une finalité explicite. Une estimation ne clôture pas
une exposition. Un usage inconnu exige `cumulativeAmount: null`,
`source: 'unavailable'` et `final: false`. Le cumul confirmé précédent reste
conservé ; le registre ne le remplace pas par zéro.

## Cumul, conservation et dépassement réel

Les consommations sont cumulatives par opération. Le registre inscrit
uniquement l'augmentation depuis le dernier cumul confirmé. Une baisse est
refusée. Les identifiants de reçu et de message détectent un contenu divergent
et un rejeu exact n'ajoute pas une seconde consommation.

Pour une opération non terminée, l'exposition restante vaut
`max(maximumAmount - cumulativeAmount, 0)`. Le compteur `unknownExposure`
additionne ces expositions, y compris les intentions encore `pending`.
Seul un reçu final connu peut lever cette exposition. Un timeout, une
préemption, une échéance d'allocation ou l'absence d'un reçu ne suffisent pas.

Une consommation réelle supérieure à la prévision est inscrite intégralement
et signalée par `overBudget`. L'allocation devient `overdrawn` et refuse une
nouvelle exposition. Le registre conserve aussi les expositions des autres
opérations ; le dépassement d'une opération ne rend pas leurs montants libres.
Il ne peut pas annuler une facturation externe déjà produite.

Le ledger métabolique natif reste append-only : une ancienne observation
`unavailable` n'est pas effacée lors de sa résolution. Son agrégat historique
peut donc rester incomplet. Le compte courant ALLOSTASIE et l'historique des
preuves rendent la réconciliation visible séparément.

## Libération et réserve protégée

`RELEASE` contient `allocationId`, `allocationDigest`, `releaseId`,
`reason: 'complete' | 'cancel' | 'preempt'` et `evidenceRef`. `PREEMPT` porte
les identifiants d'allocation et une raison ; son enveloppe fournit
l'identité idempotente de la commande. Une préemption provient du régulateur
et vise le client ; les autres rapports et libérations vont du client au
régulateur. L'autoriseur conserve la décision d'admission réelle.

Le montant libérable est `max(held - unknownExposure, 0)`. Le montant `spent`
ne diminue jamais. Après préemption, les nouveaux appels sont refusés, mais
les rapports de consommation tardifs et la réconciliation restent possibles.
Une nouvelle libération peut rendre le solde devenu observablement inutilisé.

La réserve `protectedReserve` du pool reste hors des allocations de travail.
Elle n'est jamais libérée ou consommée implicitement par une préemption. Ce
profil refuse `purpose: 'recovery'` : son usage exige une politique et une
allocation dédiées, non implémentées par ce point. Il protège la capacité de
récupération sans prétendre disposer d'un exécuteur de récupération complet.

La clôture native ne reçoit jamais `providerCalled: false` déduit d'une
annulation. Si une dimension native complémentaire reste inconnue, le service
natif peut conserver son état `uncertain`, même après résolution de l'unité
ALLOSTASIE. Cette rétention conservatrice ne fabrique pas une absence de coût.

`PRESSURE` n'est pas une entrée de consommation ni une autorisation de
budget. Aucun reçu de ce module n'autorise une transformation morphogénétique.

## Limites de confiance

Les callbacks de source sont des lectures seules. Les changements de droits
et de configuration exigeant une garantie au commit doivent partager le
mutex, une génération ou une frontière autoritative avec le registre. Une
suite de callbacks externes arbitrairement mutables ne constitue pas une
transaction distribuée.

Les enveloppes expirées sont refusées ; une nouvelle enveloppe peut rapporter
une consommation ancienne sur une allocation expirée. L'expiration interdit
une nouvelle exposition, pas l'observation d'une dette déjà créée.
