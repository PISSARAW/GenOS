# Domaine Métapopulation

Ce dossier définit les contrats et la persistance du modèle cible. La façade
publique reste `../metapopulationCoordinationService.js`.

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

## Contrats

`contracts/` valide les sessions, patches, dèmes, propagules, corridors dirigés
et événements régionaux. Les validations rejettent les identifiants vides,
états inconnus et mesures hors bornes avec des codes d'erreur dédiés.

## Persistance

`metapopulationStore.js` persiste la session dans des colonnes dédiées, les
futurs patches/dèmes/corridors dans leurs propres tables et les transitions dans
un journal régional append-only. Une session créée avec une base reçoit un
événement `SESSION_CREATED` en révision 1 dans la même transaction. Une
composition sans base reste en mémoire et n'est pas récupérable après
redémarrage.

La migration `073-metapopulation-sessions` crée le schéma. Elle ne crée pas
encore de patches ou de dèmes : leur cycle de vie appartient aux étapes
suivantes de la feuille de route.
