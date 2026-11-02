# ALLOSTASIE — Allocations durables et réserve protégée

- **Statut** : Profil Node intégrable sur quotas SQL entiers et réservations modèle natives.
- **Dernière revue** : 2026-11-02

## Réutilisation native et périmètre

Les anciens `metabolism/resourceLedgerService`, `resourceReservationService`
et `metabolicStateService` utilisent des maps en mémoire. Leur expiration ne
constitue pas un registre durable des engagements ou des effets inconnus. Ce
profil ne les utilise pas comme autorité de réservation.

`AllostasisAllocator`, dans `allostasisProtocol/allocator.js`, conserve des
pools et allocations SQLite par unité exacte. Pour `tokens` et `micro_USD`,
il appelle réellement `modelBudgetReservationService.reserve`, puis utilise
son règlement natif via `settle`. Les tables natives et le registre protocolaire
partagent la même connexion et la même transaction. Les autres unités restent
des quotas protocolaires ; elles ne sont transformées ni en tokens ni en dollars.

## API et autorité du régulateur

Le constructeur reçoit
`{dbPath,actor,incarnationGeneration,authority,authorize,verifyRequest,observations,clock}`.
Les deux callbacks d'autorisation et de vérification sont obligatoires.
`observations` est une factory recevant exactement `allocator.db` et retournant
le registre natif qualifié `ObservationRegistry`.

| Méthode | Résultat |
| --- | --- |
| `initializePool(query,{capacity,protectedReserve,consumed})` | Déclare une dotation locale autorisée ; refuse un pool existant |
| `apply(message)` | Journalise les observations ou traite une requête de budget |
| `pool(query)` | État courant du quota typé |
| `allocation(query)` | Allocation et compteurs effectivement conservés |
| `outbox(poolQuery)` | Enveloppes `GRANT` et `REJECT` persistées par le régulateur |
| `close()` | Ferme la connexion SQLite |

Le pool est identifié par
`{scope,missionId,budgetId,unit}`. Il est partagé entre conversations et clients
de cette même dotation : changer de conversation ne crée pas de capacité.
La requête d'allocation est
`{scope,missionId,conversationId,allocationId,allocationDigest}`.

`authorize({operation,request})` doit authentifier l'appelant, son autorité et
sa portée. Les opérations locales sont `INITIALIZE_POOL`, `POOL`, `ALLOCATION`,
`OUTBOX` et `REQUEST_BUDGET`. Une dotation est une décision de l'opérateur local,
pas une instruction acceptée depuis un message client. Les callbacks sont des
lectures ou décisions sans effets de bord sur les données qu'ils évaluent.

## Observations, prévision et requête

`REPORT_STATE`, `FORECAST_NEED` et `PRESSURE` passent par le vrai registre
d'observations partagé. Les rapports sont confrontés aux états AGOW natifs et
les prévisions conservent leur qualification et leurs limites. Une pression
ou une prévision ne modifie aucun plafond et ne vaut pas autorisation de budget.

`REQUEST_BUDGET` porte
`{requestId,budgetId,unit,amount,forecastId,forecastDigest}`. Le client doit être
distinct du régulateur et viser celui-ci. Le service retrouve la prévision
enregistrée, avec la même portée, mission, conversation, unité, identité,
audience, autorité et générations. La requête doit citer son message
`FORECAST_NEED` dans ses causes.

`verifyRequest({message,pool,forecast})` consulte la politique de confiance et
vérifie les conditions d'admission. Le reçu attendu contient
`status:"validated"`, `requestDigest:digest(request)` et un `receiptDigest`
SHA-256. Ce reçu est conservé avec la décision ; la forme du reçu ne remplace
pas les contrôles réels du callback. La prévision est relue après ce contrôle
afin de refuser une source devenue inapplicable pendant l'attente.

Le régulateur produit seul le `GRANT` dans son outbox. Le service refuse un
message `GRANT` entrant qui chercherait à installer une allocation. Le client
ne peut donc pas s'accorder un budget en changeant simplement le type de son
message ou son signal de pression.

## Comptabilité entière et invariant d'admission

Les unités autorisées sont `tokens`, `bytes`, `milliseconds`, `model_calls`,
`micro_EUR` et `micro_USD`. Tous les montants sont des entiers sûrs non négatifs.
Une unité est une identité exacte ; aucune conversion implicite entre euros,
dollars, temps, mémoire ou tokens n'est effectuée.

Un pool conserve `capacity`, `protectedReserve`, `baselineConsumed`, `consumed`,
`held`, `generation` et l'identité du régulateur. Les limites et la consommation
initiale sont immuables. Le budget ordinaire disponible est :

```text
capacity - protectedReserve - consumed - held
```

Une admission exige une capacité au moins égale au montant demandé. Elle ne
réduit pas la réserve protégée. Le profil initial n'expose pas d'allocation de
récupération puisant dans cette réserve : une telle admission nécessite une
politique dédiée distincte.

Sous le mutex et la transaction SQLite, le service réserve le montant demandé,
avance la génération du pool et conserve l'allocation, la décision, le message
et l'enveloppe de réponse. Deux clients demandant simultanément la dernière
capacité ne peuvent pas chacun l'obtenir. Le CAS vérifie aussi l'état du pool
après les callbacks ; une révocation ou une expiration tardive annule la
réservation native et les écritures protocolaires dans la même transaction.
Après la dernière autorisation, le service vérifie encore au même instant
local les échéances de la requête, du message de prévision, du rapport et de
la prévision. Une enveloppe client plus longue ne prolonge pas sa source.

La protection porte sur les admissions et sur les compteurs du régulateur.
Si un exécuteur externe consomme réellement plus que sa quote, le registre
de règlement conserve cette dette et interdit les admissions supplémentaires.
Il ne tronque pas une consommation observée pour afficher artificiellement
l'invariant. Le respect physique d'un plafond par un fournisseur, un processus
ou une machine exige un adaptateur d'exécution qui impose ce plafond.

## Liaison aux réservations modèle

Pour `tokens`, le montant devient une vraie réservation `reserved_tokens`.
Pour `micro_USD`, il devient une vraie réservation `reserved_cost_usd` après
division par un million. Le pont est borné à `10^12 micro_USD` pour l'admission
et vérifie le retour exact vers l'entier d'origine. Le quota entier reste
autoritatif, indépendamment des flottants utilisés par le service modèle natif.

Le plafond natif de la cohorte est
`capacity - protectedReserve - baselineConsumed`. La consommation de départ
est une donnée locale explicite ; elle n'est pas fabriquée sous forme d'une
fausse observation de facture. Les IDs natifs sont dérivés du pool et de
l'allocation, puis leur portée, leur action, leurs plafonds et leur état sont
revérifiés. Une réservation native préexistante sans allocation protocolaire
correspondante n'est pas adoptée silencieusement : elle exige une réconciliation.

`native.syncHeld(pool,allocation)` maintient la réservation native active ou
incertaine à `spent + held`. Les consommations déjà connues restent ainsi
comptées quand une partie inutilisée est rendue. Le service natif ne possède
pas d'API de réduction partielle ; le pont effectue cette réduction par une
mise à jour conditionnelle de sa vraie ligne, sous la même transaction, sans
réduire la consommation ni les expositions non closes.

`native.settle(pool,allocation,outcome)` n'est admis qu'après fermeture de la
capacité et des expositions. Pour des tokens, la quantité consommée est connue
mais un coût fournisseur absent reste `null`. Pour des micro-dollars, le coût
consommé est connu mais un nombre de tokens absent reste `null`. Si une seconde
dimension manque, le service modèle conserve son statut `uncertain` ; le pont
n'invente pas un zéro pour obtenir artificiellement `settled`.

Une preuve de non-appel ne peut être utilisée que si aucune consommation ni
exposition n'existe. Une annulation ne rembourse jamais une inférence déjà
facturée. Les observations compatibles sont inscrites séparément par le vrai
ledger métabolique du règlement, avec leur provenance.

Une consommation réelle dépassant la plage exacte du pont USD est conservée
dans le registre entier avec son dépassement. Le pont retourne explicitement
`bridge_unavailable` et conserve la réserve native précédente ; il ne fait
ni faux règlement exact ni rollback du fait observé. Le pool typé bloque toute
nouvelle allocation. Les erreurs SQL ordinaires restent des erreurs et ne
sont pas masquées sous ce diagnostic.

## Reprise, idempotence et limites

Les réservations ne disparaissent pas automatiquement quand une échéance
d'admission expire. Un effet inconnu reste engagé jusqu'à une réconciliation
de confiance ; aucune purge TTL d'une map ne recrédite la capacité durable.
Un redémarrage relit les mêmes allocations et réponses. Une redélivrance exacte
ne crée pas de nouvelle réserve. Réutiliser un identifiant logique de requête
avec un autre montant, une autre unité ou un autre contexte d'autorité échoue.

La connexion `allocator.db`, les primitives du store et le pont natif sont
destinés aux services de confiance, notamment au règlement. Ils ne sont pas
des endpoints exposables directement. Le profil n'installe ni authentification
réseau, ni ordonnanceur physique, ni cgroups, ni permission de morphogenèse.
`GRANT` autorise l'engagement de capacité du registre ; il n'autorise pas à lui
seul un effet externe.

## Validation

```text
node backend/tests/test_allostasis_allocator.js
node backend/tests/test_allostasis_allocator_races.js
```

Les suites exécutent le pipeline d'observations AGOW natif, des requêtes
concurrentes, les vraies réservations modèle tokens/USD, le redémarrage, les
replays et les unités indépendantes. Elles injectent révocation, expiration,
changement de source et réservation native orpheline. Elles vérifient aussi
qu'une consommation réelle hors plage reste inscrite et qu'une dimension
native inconnue n'est pas déclarée réglée.
