# Domaine Métapopulation

Ce dossier définit les contrats, la persistance et les services du modèle cible.
La façade publique reste `../metapopulationCoordinationService.js`.

## Ontologie

- **Métapopulation** : session régionale et frontière de persistance.
- **Patch** : contexte local disponible pour une population.
- **Dème** : population qui occupe un patch et maintient son état local.
- **Individu** : agent ou membre vivant dans un dème.
- **Corridor** : relation dirigée qui autorise des échanges entre deux dèmes.
- **Propagule** : unité transportée, qui doit être évaluée par le receveur avant assimilation.

L'invariant est : `population ≠ dème ≠ patch`. Une population ne devient pas
un patch parce qu'elle disparaît ; le patch peut rester disponible pour un autre
dème.

## Contrats et services

`contracts/` valide sessions, patches, dèmes, propagules, corridors dirigés et
événements régionaux. Les services `patches/` et `demes/` exposent la création,
la lecture, les transitions de cycle de vie, l'évaluation de convenance locale
et la mise à jour du profil d'un dème. Les transitions sont validées avant
persistance.

## Persistance

`metapopulationStore.js` persiste les sessions, patches et dèmes dans des tables
normalisées. Les créations, changements de statut et mises à jour du profil local
sont ajoutés au journal régional append-only. Les corridors et migrations ont
leurs tables, mais leur cycle de vie sera livré dans un lot ultérieur.

La migration `073-metapopulation-sessions` crée le schéma. La façade
`metapopulationCoordinationService.js` expose les opérations du modèle local.
Une session créée avec une base est récupérable après redémarrage ; une
composition sans base reste en mémoire.

## Portée des lots

Le PR3 provisionne une capsule workspace distincte par dème et conserve sa
frontière locale, ses références d'état et mémoire ainsi que son budget. Toute
écriture effectuée via `assertDemeLocalWrite` est résolue dans cette capsule et
quarantaine le dème si le chemin sort de la frontière. Ce garde s'applique aux
écritures qui passent par l'API ; il ne prétend pas intercepter un accès direct
au système de fichiers par un processus externe. `consumeDemeBudget` applique
les plafonds locaux de manière transactionnelle. Les heartbeats append-only
alimentent `inspectRegionalLiveness`, qui distingue silence sain, absence de
nouvelle preuve, déconnexion, blocage, crash et état inconnu.

Les corridors dirigés, propagules et mécanismes de reprise arrivent dans les
lots suivants.
