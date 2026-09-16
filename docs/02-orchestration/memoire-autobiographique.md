# Mémoire autobiographique de l'orchestrator

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

## Oubli

`episodeStore.forgetStaleEpisodes` marque `is_forgotten = 1` les épisodes anciens
(> 90 jours par défaut) et peu saillants (`salience < 0.5`) : la ligne reste (piste
d'audit), mais elle cesse d'alimenter le rappel ou la consolidation. On oublie le détail
brut, pas la structure causale déjà condensée en leçon.

## Relation avec le modèle de soi

Le modèle de soi de l'orchestrator (`selfModelService.js`,
[theorie-du-soi-orchestrator.md](theorie-du-soi-orchestrator.md)) reste la synthèse
comportementale calibrée à partir des exécutions de stratégie. La mémoire
autobiographique en est le substrat épisodique : elle explique *pourquoi* un biais existe
(quels épisodes l'ont produit), là où le modèle de soi ne fait que le mesurer.
