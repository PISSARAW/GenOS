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

Le PR4 expose un graphe de corridors dirigés et ses politiques ring,
stepping-stone, star, small-world, fully-connected, source-sink, hierarchical
et adaptive. La qualité combine compatibilité, qualité/accessibilité des deux
patches et risque d'homogénéisation ; la capacité découle de la capacité
minimale des patches et de cette qualité. La régénération du graphe désactive
les corridors retirés et conserve leurs compteurs et historiques.

Le PR5 place les propagules offertes en quarantaine chez le dème receveur.
Seul un adaptateur enregistré pour le type concerné peut valider localement
le payload puis l'assimiler. Un rejet de validation est journalisé ; une
assimilation acceptée exige un reçu avec provenance. Les adaptateurs reçoivent
l'identifiant de migration comme clé d'idempotence afin qu'une reprise après
erreur ne duplique pas leurs effets. Les déclencheurs adaptatifs arrivent dans
les lots suivants.

Le PR6 fournit les stratégies `elite`, `novelty`, `rescue`, `complementary`,
`counterexample`, `cultural` et `founder`. Le plan push répartit les candidats
par dème receveur ; une requête pull peut cibler une source, des types, des
seuils de preuve ou des lignées exclues. Ces fonctions planifient la sélection ;
les offres restent soumises à la capacité du corridor et à la quarantaine PR5.

Le PR7 évalue des déclencheurs de stagnation, amélioration et génération,
puis applique les plafonds de coût, de risque de synchronisation et de budget.
La décision rend ses motifs et ses blocages explicites pour le runtime appelant.

Le PR8 classe les dèmes source/sink à partir de leur fitness et de la connectivité
active, calcule la couverture de capacités distinctes et marque les dèmes à
protéger quand ils portent une capacité régionale unique.
