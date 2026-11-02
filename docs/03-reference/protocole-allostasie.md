# Protocole ALLOSTASIE v1

- **Statut** : Profil expérimental Node ; qualification, allocations durables et consommation implémentées
- **Portée** : Besoins déclarés, prévisions et engagements de ressources
- **Dernière revue** : 2026-11-02

Le [schéma commun](../../shared/allostasisProtocol.v1.schema.json) définit
`genos.allostasis/v1`. Le
[validateur](../../backend/src/services/allostasisProtocol/contract.js) expose
`createMessage`, `validateMessage`, `validateReport`, `validateForecast` et
`validateAllocation`. Les constantes `UNITS` et `LEVELS` décrivent le profil.

## Enveloppe et messages

L'enveloppe reprend les champs de la famille : identité du message et de
l'opération, mission, conversation, acteur, audience, organisation/projet,
références causales, générations, autorité, idempotence, production, expiration,
digest du payload et contenu. Les générations d'incarnation, d'organisation
et de workspace restent distinctes des versions d'un pool ou d'une allocation.

Les identifiants refusent les blancs initiaux ou finaux. Les dates futures,
expirées ou non représentables sont rejetées lorsqu'elles prétendent porter
une observation actuelle. Les validateurs acceptent `{ now }`, date ou
millisecondes Unix. Une empreinte cohérente ne prouve aucune autorité.

| Type | Payload strict |
| --- | --- |
| `REPORT_STATE` | `report` |
| `FORECAST_NEED` | `forecast` |
| `REQUEST_BUDGET` | `requestId`, `budgetId`, `unit`, `amount`, `forecastId`, `forecastDigest` |
| `GRANT` | `allocation`, `allocationDigest` |
| `REPORT_USAGE` | `allocationId`, `allocationDigest`, `operationId`, `receiptId`, `cumulativeAmount`, `status`, `unit`, `evidenceRef` |
| `RELEASE` | `allocationId`, `allocationDigest`, `releaseId`, `reason`, `evidenceRef` |
| `PRESSURE` | `budgetId`, `unit`, `reason` |
| `PREEMPT` | `allocationId`, `allocationDigest`, `reason` |
| `REJECT` | `requestId`, `requestDigest`, `budgetId`, `unit`, `reason` |

Les rapports et prévisions précèdent la demande qui les cite. `GRANT` doit
provenir du régulateur autorisé ; le demandeur ne s'accorde pas une allocation
en présentant un objet de forme correcte. `PRESSURE` reste un signal.
`PREEMPT` exige aussi l'autorité du régulateur et ne prouve pas qu'une opération
déjà partie a été annulée.

## Unités et quantités

| Unité | Sens |
| --- | --- |
| `tokens` | Nombre entier de tokens sous le contrat du fournisseur |
| `bytes` | Octets |
| `milliseconds` | Durée ; le metricId distingue notamment `activeTimeMs` et `wallTimeMs` |
| `model_calls` | Nombre d'appels modèle |
| `micro_EUR` | Millionièmes d'euro |
| `micro_USD` | Millionièmes de dollar américain |

Les quantités sont des entiers non négatifs représentables exactement, bornés
à `Number.MAX_SAFE_INTEGER`. Les bridges peuvent imposer une borne inférieure.
Les additions, débits et réservations doivent aussi vérifier leurs bornes.
Il n'existe aucune conversion implicite EUR/USD, octets/tokens ou durée/CPU.
Le ledger natif annonce des millisecondes actives ou écoulées, pas une mesure
de CPU attestée.

`ratio_ppm` est réservé aux diagnostics : une fraction entre zéro et un est
représentée en millionièmes avec sa valeur native et les bornes floor/ceil.
Cette unité est refusée dans une demande ou allocation de ressources.
Une quantité monétaire ou un compteur de tokens ne peut pas être arrondi
par cette quantification de ratios.

## Rapports d'état

Un `report` contient `reportId`, `status`, `scope`, `missionId`, `subject`,
`observedAt`, `validUntil`, `measurements`, `nativeSnapshot` et `reasons`.
`subject` contient `level` (`agent`, `topology`, `mission`, `organization`)
et `subjectId`.

Chaque mesure contient `metricId`, `unit`, `value`, `uncertainty`,
`provenance` et `quantization`. Une valeur indisponible vaut `null`.
L'incertitude est `{kind:'unknown'}` ou un intervalle entier
`{kind:'interval',lower,upper}` contenant la quantité. Un intervalle de
quantification numérique ne constitue pas un intervalle de confiance empirique.

La provenance lie `sourceId`, `sourceDigest`, `evidenceRefs` et `method`.
Le snapshot natif conserve service, sourceAgentId, niveau, namespace de stockage,
état brut et lecture normalisée du vrai service AGOW. Une référence d'évidence
reste une référence à vérifier ; elle ne certifie pas son contenu.

Un rapport `available` exige des mesures présentes et une fenêtre actuelle.
Un rapport `unavailable` conserve ses raisons et peut montrer des timestamps
anciens ou absents, sans prétendre fournir une mesure actuelle. L'absence de
mesure n'est jamais normalisée à zéro.

## Prévisions

Un `forecast` lie son identifiant au rapport et à son digest, à la portée,
la mission et au sujet. Il contient unité, montant déclaré, horizon, production,
expiration, incertitude, provenance, candidat natif et assessment natif.

`demandSource: 'declared'` est explicite. La demande de ressources n'est pas
déduite d'une utility ou présentée comme un coût observé. Le forecast natif
actuel exprime un horizon en cycles, entre 1 et 100. Le contrat peut représenter
des millisecondes pour un autre adaptateur ; le qualificateur AGOW ne convertit
pas les cycles en durée fictive.

Les candidats et leur origine épistémique sont conservés. Une prédiction
contrefactuelle ne devient pas une observation réelle et un avis de préemption
AGOW ne devient pas une autorité d'allocation ou de morphogenèse.

## Allocations et consommation

Une `allocation` lie `allocationId`, la demande et son digest, le budget,
l'unité, le montant, le client, le régulateur, la prévision et son digest,
ainsi que l'expiration. `allocationDigest` couvre cet objet exact.

`REPORT_USAGE.status` vaut `known` avec un cumul entier, ou `unknown` avec
`cumulativeAmount:null`. Le ledger garde alors la consommation confirmée
antérieure et la couverture de l'exposition inconnue. Il ne remplace pas cette
inconnue par zéro.

`RELEASE.reason` vaut `complete`, `cancel` ou `preempt`. Une annulation ne
recrédite pas une consommation déjà observée. Une réserve exposée à une issue
inconnue exige une preuve de clôture avant libération. Les réserves protégées
de terminaison/récupération demeurent distinctes de la partie librement allouable.

## Validation et limites

Les erreurs de forme et d'intégrité utilisent `AllostasisProtocolError` avec
des codes `ALLOSTASIS_*`. Les validateurs distinguent notamment JSON, schéma,
dates, intégrité, état de rapport et intervalle d'incertitude invalides.
La qualification de source peut lever `ALLOSTASIS_QUALIFICATION_INVALID`.

Depuis la racine : `npm --prefix backend run test:allostasis-protocol` lance les
neuf fichiers de tests. Le contrat seul se lance avec
`node backend/tests/test_allostasis_protocol_contract.js`.
Les [vecteurs communs](../../shared/allostasisProtocol.v1.vectors.json) incluent
micro-unités et absence explicite de cumul, avec hashes calculés en Python.

La réservation native modèle concerne tokens et USD. Les autres unités peuvent
être des quotas locaux exacts sans prétendre à un enforcement OS ou à un
exécuteur natif. Le protocole n'ajoute pas automatiquement un endpoint réseau,
un outil MCP, une extension A2A ou une implémentation Rust. Voir la
[qualification](allostasie-qualification.md) et
l'[ADR](../adr/2026-11-02-protocole-allostasie.md).
Les [allocations durables](allostasie-allocations.md) et la
[consommation](allostasie-usage.md) décrivent les ponts natifs, la réserve
protégée et les issues inconnues. Le
[démonstrateur à quatre processus](../06-qualite-preuves/allostasie-processus-2026-11-02.md)
vérifie la contention, la perte d'observation, la préemption et la reprise.
