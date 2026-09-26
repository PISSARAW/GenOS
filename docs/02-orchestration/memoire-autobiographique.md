# Mémoire autobiographique de l'orchestrator

- **Statut** : Partiel
- **Portée** : capture, consolidation, rappel et oubli des épisodes du control plane Node.
- **Dernière revue** : 2026-09-26

Une mémoire d'expériences vécues, transformées en règles de décision conditionnelles,
prouvées, réutilisables et oubliables. Elle relie mission, perception, décision, action,
preuve, conséquence et apprentissage — et elle revient dans la boucle de décision avant
la planification.

## Ce que ce n'est pas

Ce n'est pas un journal de télémétrie de plus. La télémétrie existante
(`telemetryObserver`, événements `AGENT_*`, `STRATEGY_*`, `TRINITY_*`, `APOPTOSIS_*`)
capture tout ce qui se passe. La mémoire autobiographique ne retient qu'une fraction
saillante de ces événements, les relie causalement, les compresse en leçons, et les
oublie quand ils ne servent plus.

## L'unité de mémoire : l'épisode

Un `AutobiographicalEpisode` correspond à un moment significatif (début de mission,
changement de stratégie, création de workers, échec d'une primitive, preuve validée,
rollback, promotion, quarantaine, décision humaine, fin de mission). Il combine :

- `situation` — objectif, `worldState`, `survivalState`, `physicalState` au moment des faits.
- `decision` — stratégie choisie, alternatives écartées, raison.
- `action` — outil appelé, cible, coût (tokens, latence, risque).
- `outcome` — statut, preuves, incertitudes.
- `lesson` — résumé exploitable, conditions de réutilisation/évitement (renseigné à la consolidation).

Persistance : table `autobiographical_episodes`
(migration `backend/src/db/migrations/migrateAutobiographicalMemory.js`), gérée par
`backend/src/services/autobiographicalMemory/episodeStore.js`.

## Saillance : tous les événements ne méritent pas un souvenir

`backend/src/services/autobiographicalMemory/salience.js` calcule un score
`salience = Σ poids_i × signal_i` sur sept signaux (échec, réussite avec preuve,
changement de stratégie, coût élevé, risque élevé, surprise, décision humaine). Un
événement ne devient un épisode que si `salience >= 0.3` (`DEFAULT_SALIENCE_THRESHOLD`).

## Capture automatique

`backend/src/services/autobiographicalMemory/captureService.js` s'abonne au bus
`telemetryObserver` (`attachAutobiographicalCapture`, câblé au boot dans `server.js` sur
le worker désigné, via `GENOS_AUTOBIOGRAPHICAL_MEMORY_ENABLED`). Chaque événement
télémétrique dont le type est reconnu (`EVENT_KIND_MAP`) est scoré, et transformé en
épisode s'il franchit le seuil de saillance.

L'activation, l'abonnement du worker responsable et la reconnaissance du type
d'événement sont des conditions distinctes. Un événement non reconnu ou reçu
hors du worker désigné n'est pas réputé capturé.

## Consolidation en leçons

`backend/src/services/autobiographicalMemory/lessonService.js` regroupe les épisodes
par (`kind`, stratégie/outil), sépare succès et échecs, et ne produit une
`AutobiographicalLesson` que si au moins deux occurrences soutiennent la conclusion — un
seul épisode reste une anecdote, pas une leçon. Chaque leçon porte une confiance bornée,
les épisodes qui l'appuient et ceux qui la contredisent, des conditions de réutilisation,
et une action recommandée (`reuse_strategy_first` / `avoid_strategy_before_retry`).

Persistance : table `autobiographical_lessons`. La consolidation tourne dans le même
cycle de sommeil que la mémoire vectorielle (`runMemoryConsolidationOnce` dans
`backend/src/services/jobWorkerOrchestrator.js`), qui appelle aussi l'oubli.

## Rappel avant décision

`backend/src/services/autobiographicalMemory/recallService.js` expose
`recallForSituation({ agentId, missionId, kind, goal })` : il classe les épisodes récents
par pertinence (recouvrement lexical avec l'objectif courant, puis saillance), sélectionne
les leçons dont les conditions de réutilisation s'appliquent, et renvoie :

- un résumé texte prêt à injecter dans le contexte de décision ;
- des `adjustments` (`riskDelta`, `evidenceStrictnessDelta`, `confidenceBoost`) que
  l'appelant est censé répercuter sur le budget, la tolérance au risque ou les portes de
  preuve — ce n'est pas un rappel décoratif.

L'intégration runtime est effectuée par
`backend/src/services/autobiographicalMemory/orchestratorRecall.js`, appelé depuis
`buildAutonomyPlanForMission` dans `backend/src/services/agentAutonomyPlanService.js`,
après le chargement du modèle de soi et avant la régulation du plan. Les ajustements sont
bornés (`riskDelta` ±0,5, `evidenceStrictnessDelta` +0,5 max, `confidenceBoost` +0,25 max),
copiés dans `autobiographicalAdjustments`, propagés à la politique de décision —
y compris `confidence` de l'état — et tracés par les événements `AUTOBIOGRAPHICAL_RECALL_*`.
Le rappel attache aussi deux instantanés d'audit : `integrationProxy` (proxy
d'intégration du circuit de lignée) et `attentionAudit` (validité du champ
attentionnel et fidélité des rapports). Ils ne peuvent ni accorder une
permission d'outil ni contourner les portes de preuve.

L'ajustement du rappel est un signal de planification, pas une décision autonome.
L'absence de souvenirs pertinents doit rester un rappel vide : elle ne prouve
pas qu'une stratégie n'a jamais échoué ou réussi. Une recommandation mémorisée
doit être revalidée contre le workspace, le budget et les preuves de la mission
courante.

## Oubli

`episodeStore.forgetStaleEpisodes` marque `is_forgotten = 1` les épisodes anciens
(> 90 jours par défaut) et peu saillants (`salience < 0.5`) : la ligne reste (piste
d'audit), mais elle cesse d'alimenter le rappel ou la consolidation. On oublie le détail
brut, pas la structure causale déjà condensée en leçon.

## Capture : réafférence, ignition, télémétrie

Depuis que `telemetryObserver.emitEvent` émet aussi sur le bus `telemetry`, la
capture souscrite (`attachAutobiographicalCapture`, branchée dans `server.js`)
tourne réellement en production : tout événement typé est évalué, seuls les
saillants (≥ 0,3) deviennent épisodes.

La saillance de capture est modulée multiplicativement, dans l'ordre :

1. saillance de base (`computeSalience`, 7 signaux) ;
2. décharge corollaire (`efferenceCopyService.discharge`) : événement auto-causé
   (prédiction d'action correspondante) × 0,5, cause externe × 1 ;
3. ignition (`ignitionService.charge`, integrate-and-fire par agent) : sous le
   seuil (1,0) × 0,9, burst × 1,5 avec remise à zéro et réfractaire 5 s (× 0,8),
   fuite de 1,0 par minute ; résultat clampé dans $[0,1]$.

Un événement auto-causé et sous-seuil a donc quatre fois moins de chances de
devenir épisode qu'une surprise externe en burst. Tous les modules sont
best-effort : leur échec rend la saillance non modulée, jamais d'événement perdu.

## Consolidation offline par agent (SHY)

Le cycle synaptique global (`sleepCycle.runSleepCycle`, sur demande) est complété
par [backend/src/services/sleepConsolidationService.js](../../backend/src/services/sleepConsolidationService.js) :
renormalisation proportionnelle `salience × 0,9` par agent (ordre relatif
préservé, signature SHY), oubli sous epsilon 0,05, rapport
`{renormalized, forgotten, meanBefore, meanAfter}`. Déclenché best-effort à
chaque fin de mission (`finalizeChildClose`, fenêtre idle). Les leçons
(règles falsifiables) ne décroissent jamais silencieusement.

## Relation avec le modèle de soi

Le modèle de soi de l'orchestrator (`selfModelService.js`,
[theorie-du-soi-orchestrator.md](theorie-du-soi-orchestrator.md)) reste la synthèse
comportementale calibrée à partir des exécutions de stratégie. La mémoire
autobiographique en est le substrat épisodique : elle explique *pourquoi* un biais existe
(quels épisodes l'ont produit), là où le modèle de soi ne fait que le mesurer.

## Cycle, audit et vérification

```text
événement reconnu -> score de saillance -> épisode -> consolidation (>= 2 cas)
  -> rappel conditionnel -> ajustement borné du plan -> oubli des épisodes périmés
```

Les épisodes oubliés restent conservés pour la piste d'audit, mais ne participent
plus au rappel ni à la consolidation. Les leçons consolidées conservent leurs
épisodes de soutien et de contradiction ; leur confiance bornée ne remplace pas
une preuve d'exécution.

Le contrat est exercé par
[`backend/tests/test_autobiographical_memory.js`](../../backend/tests/test_autobiographical_memory.js).
Il couvre la capture, la consolidation, le rappel et les ajustements. Le test ne
prouve pas que chaque catégorie de télémétrie est reconnue en production : cette
couverture dépend du mapping des événements et de l'activation au démarrage.
