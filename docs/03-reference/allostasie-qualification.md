# ALLOSTASIE — Mesures, prévisions et registre d'observations

- **Statut** : Implémenté comme API locale Node/SQLite
- **Portée** : Qualification de sources natives sans autorité d'allocation
- **Dernière revue** : 2026-11-02

Le [qualificateur](../../backend/src/services/allostasisProtocol/qualification.js)
expose `createStateQualifier(options)` et `StateQualifier`. Il utilise réellement
`agow/allostaticScopeService`, `agowStatePersistenceService`,
`candidateValidationService` et `allostaticRegretAdapter`.

## Configuration locale pinnée

Les options contiennent `db`, `sourceAgentId`, `scope`, `missionId`,
`subjectBindings`, `metricBindings`, `maxAgeMs`, `clock` et éventuellement
`loadCandidate`. Les identités et bindings sont copiés et gelés localement.
Les arguments des méthodes ne peuvent pas remplacer le sourceAgentId,
la portée ou les sujets.

`subjectBindings` fixe les identités d'agent, topologie, mission et organisation.
Les bindings agent/mission/organisation doivent être cohérents avec la
configuration de source et de portée. Les états natifs de ces quatre niveaux
restent stockés sous leurs namespaces AGOW et le sourceAgentId configuré.
Lire ce namespace n'établit pas à lui seul une agrégation indépendante de toute
l'organisation ; l'association logique est une responsabilité de la source
et de l'intégration autorisée.

Chaque binding de métrique contient `metricId`, `level`, `field`, `unit` et
`kind`. `integer` exige un entier natif non négatif et une unité exacte de
ressource. `ratio` exige une fraction native finie entre zéro et un et l'unité
`ratio_ppm`. Aucun taux de change ou facteur de conversion monétaire n'est
inféré d'un nom de champ.

## API

| Méthode | Résultat |
| --- | --- |
| `capture({reportId,level})` | Rapport de la source réelle, avec disponibilité et raisons |
| `qualifyReport(report)` | Relecture et comparaison exacte avec le rapport fourni |
| `captureForecast(input)` | Prévision liée à un vrai candidat et à des mesures actuelles |
| `qualifyForecast(forecast)` | Relecture du candidat, des mesures et de l'assessment natifs |

Les méthodes retournent `allocationAuthorized:false`. Les captures de rapports
retournent `available`, `report`, `reportDigest`, `reasons` et les niveaux natifs.
Un rapport indisponible reste explicite, avec valeurs `null` et raisons. Une
prévision indisponible peut retourner `forecast:null`.

## Mesures natives et disponibilité

La capture appelle `allostaticScopeService.resolve` sans override `provided`.
Elle recharge aussi l'état brut du niveau choisi et compare la normalisation
native pour détecter une source devenue incohérente. Les lectures partagent
la même transaction SQLite via `withTransaction`.

Le timestamp doit provenir du champ natif `measuredAt` et être représentable
exactement. S'il manque, s'il est futur ou si la fenêtre de fraîcheur est
dépassée, la mesure demeure indisponible. Le service ne remplace pas ce
timestamp par la date de lecture.

Une variable absente, fractionnaire pour un compteur entier ou hors du domaine
d'un ratio reste `null`. La valeur brute reste visible dans `nativeSnapshot`.
Pour un ratio, le rapport conserve la valeur native, le facteur d'un million
et ses bornes floor/ceil. Cette trace indique la quantification numérique,
sans inventer une précision de capteur ni une incertitude statistique.

Le service natif ne fournit pas systématiquement d'incertitude calibrée ; le
rapport annonce donc `unknown`. Son statut de disponibilité signifie que
la déclaration persistée a pu être lue et qualifiée sous ce contrat, pas
qu'un capteur physique ou une preuve indépendante a été attesté.

## Prévisions natives et besoins déclarés

`captureForecast` attend `forecastId`, `reportId`, `level`, `unit`, `amount`,
`candidateId` et éventuellement `uncertainty`. Le callback de confiance
`loadCandidate` reçoit la portée, la mission, la source, le sujet et l'identifiant
dans une copie gelée. Il doit seulement lire la source autorisée.

Le vrai candidat doit satisfaire `validCandidate`, correspondre à la source
pinnée et être encore valide. Sa `viabilityForecast` doit couvrir le niveau
annoncé. Une ancienne prévision sans composantes de scope reste limitée au
niveau agent. Les scopes annoncés par une prévision multiniveau doivent tous
avoir des mesures fraîches ; une composante périmée ne disparaît pas
silencieusement de l'évaluation.

L'assessment est réellement produit par `allostaticRegretAdapter.evaluate`.
Le candidat complet, son origine, ses hypothèses, sa confiance et le résultat
natif restent visibles. Une indication native `preempt` reste un avis.
La quantité de ressources demeure séparément déclarée et marquée comme telle.
Changer cette quantité produit un autre digest de prévision ; cela ne transforme
pas la prédiction de viabilité en mesure d'un coût réel.

Les mesures sont relues après le callback de candidat pour refuser un changement
de source pendant l'attente. Les fournisseurs externes restent des lectures de
confiance ; les mutations de configuration et les autorisations doivent partager
un mutex ou une génération de source sous contrôle de l'intégration. Aucun
ensemble de callbacks asynchrones arbitraires ne constitue une transaction
distribuée sur le monde extérieur.

## Registre exécutable d'observations

[`ObservationRegistry`](../../backend/src/services/allostasisProtocol/observations.js)
reçoit `{db,authorize,qualifyReport,qualifyForecast,clock}`. Il partage la connexion
et le mutex du régulateur. Les providers reçoivent une copie gelée contenant
`message`, `query` et le `report` ou `forecast` concerné. Les adapters peuvent
appeler les méthodes du qualificateur natif correspondant au client authentifié.

`apply(message)` journalise `REPORT_STATE`, `FORECAST_NEED` et `PRESSURE`.
Une prévision doit référencer causalement son rapport exact, avec les mêmes
acteurs, audience, générations et autorité. Un rapport indisponible ne peut
pas qualifier une prévision. Le registre ne modifie aucun pool et ne crée
aucun grant.

`forecast({scope,missionId,conversationId,forecastId,forecastDigest})` renvoie
la prévision, le rapport, le message source et sa qualification actuelle.
La source est requalifiée à la demande avant admission d'un budget. Une
ancienne référence n'est pas automatiquement considérée encore applicable.

L'autorisation et l'expiration sont revérifiées après les attentes asynchrones.
Les identités de messages et clés d'idempotence sont cloisonnées par portée,
mission, conversation, acteur et audience. Un replay exact ne réapplique pas
la transition ; un autre contenu sous la même identité est refusé. Le rapport
ou la prévision et leur événement sont écrits dans la même transaction, donc
un échec du journal annule leur admission.

## Validation et limites

Depuis la racine :

```text
node backend/tests/test_allostasis_protocol_qualification.js
node backend/tests/test_allostasis_protocol_observations.js
```

Les tests utilisent les vraies migrations, la persistance et les candidats
AGOW. Les valeurs de fixtures sont annoncées comme telles : elles ne prétendent
pas être des mesures de performance physique. Les suites couvrent absence et
expiration, source modifiée, unités entières, quantification traçable, prévision
native, causalité, portée, révocation et atomicité du journal.

La qualification d'observations ne valide pas causalement un algorithme
d'allocation et n'autorise ni préemption, ni transition Morphogenèse, ni dépense
externe. Ces décisions restent dans leurs composants d'autorité respectifs.
