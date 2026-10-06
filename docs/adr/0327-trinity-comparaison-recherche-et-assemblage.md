# ADR 0327 — Comparaison commune, recherche et assemblage Trinity

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Trinity, preuves, recherche expérimentale

## Contexte

Le superviseur et la barrière intégrée appliquaient des contrôles différents.
Le comparateur exigeait trois mondes même pour les seize cellules factorielles,
et l'hypervolume additionnait des rectangles qui se recouvrent. Le dispatch direct
ne persistait pas le snapshot et les plans nécessaires à la promotion.

## Décision

Les deux chemins utilisent `trinityComparisonRuntime`. La comparaison conserve
les plans de vérification, la configuration du jury et les seuils de mission.
Le dispatch direct prépare un snapshot commun, lie chaque worker à cette
expérience et vérifie son empreinte avant exécution. Les marqueurs de gestion
`.genos-epoch` et `.genos-vfs.json` sont exclus de l'empreinte des artefacts.
Ils ne constituent pas le contenu d'une solution.

Le nombre de mondes attendu dépend du plan : trois initialement, seize pour le
factoriel, puis les réplicas explicitement exécutés. Chaque monde garde une
identité distincte. Les dimensions optionnelles sans références vérifiées sont
inconnues. L'hypervolume mesure l'union exacte des rectangles de dominance.

Le concepteur accepte un modèle de recherche explicite : espace des solutions,
couverture par hypothèse, falsifiabilité déclarée, coût et latence. Il optimise
les triplets admissibles sous budget. Un ensemble de matrices de vraisemblance
permet de choisir un protocole par réduction attendue de l'entropie. Ces valeurs
sont des estimations du modèle déclaré, pas des observations.

La calibration logistique nécessite au moins trente observations distinctes,
des reçus HMAC de vérificateurs enregistrés liés au contenu des observations,
deux issues en entraînement et un jeu de validation séparé. Le modèle reçoit
le statut `calibrated` seulement si son Brier sur ce jeu bat le prior constant.
Cela reste une qualification sur ce corpus, pas une garantie hors distribution.
La corrélation nécessite dix observations et une variance non nulle.

L'examen sémantique compare des propositions typées déjà vérifiées. Les
contradictions détectées bloquent la synthèse ; l'analyse ne confère aucune
autorité de promotion et ne prétend pas interpréter tout texte libre.

La synthèse exige un manifeste borné de fichiers, avec monde d'origine et
SHA-256, et une correspondance entre chaque claim et ses fichiers. L'assembleur
rejette traversées de chemins, secrets, liens symboliques et collisions. Le
candidat reste isolé et subit de nouveau les contrôles d'intégration et les
vérifications indépendantes de tous ses claims avant la transaction finale.

Le journal SQLite fige les rapports initiaux et les résultats de chaque étape.
Ses empreintes détectent une corruption ; elles ne remplacent pas les reçus des
vérificateurs. Les verrous enregistrent propriétaire, hôte et PID : un autre
propriétaire vivant bloque une exécution concurrente. Un PID disparu sur le même
hôte permet la reprise. Les identifiants déterministes des réplicas empêchent
leur redispatch quand le worker existe déjà. Une configuration modifiée exige
une nouvelle expérience. Un propriétaire d'un autre hôte requiert une résolution
opérateur plutôt qu'une reprise spéculative.

La politique séquentielle exécute des workers isolés avec un budget réservé de
3 à 48 réplicas et une allocation Thompson. Son gain d'information correspond
à l'entropie attendue bêta-Bernoulli, exprimée en bits. La correction par fréquence
d'allocation empirique reste descriptive ; elle ne prouve pas une absence de
biais causal. La diversité est contrôlée sur la provenance des événements de
complétion runtime, pas sur une déclaration du modèle. Les niveaux de modèle
factoriels doivent correspondre à deux modèles réellement distincts. La même
hypothèse de base est conservée entre cellules pour limiter les facteurs confondus.

La promotion dispose de son propre verrou. Une reprise vérifie l'empreinte du
candidat et la référence signée avant de retourner une promotion existante.
Le contenu est réempreint avant et après la création de la référence AgentGit.
Un résultat déjà promu conserve son statut lors d'une nouvelle journalisation.

La récursion réserve au plus 30 % des tokens du parent pour une mission enfant.
Le transfert de budget cognitif est atomique et n'est pas répété lors d'une reprise.
Le runner lit l'enveloppe réelle du dispatch et attend une promotion enfant dont
l'intégrité est revérifiée, plutôt que le seul arrêt de ses workers. Les sous-problèmes
possèdent des identités de contenu stables et leurs ancêtres sont transmis. La borne
de coût inclut la prochaine récursion. Une limite atteinte reste un arrêt borné
explicite ; elle n'est pas décrite comme une résolution du sous-problème.

Les réserves sont retirées du pool worker après calcul de sa part, afin de
préserver le budget orchestrateur. Les workspaces privés héritent de l'organisation
et du projet de leur origine. Leur création et le rattachement agent/monde sont
transactionnels et idempotents ; un monde absent provoque un rollback complet.

Le schéma des axes MCP dérive du registre des politiques implémentées.
Un test compare ce registre aux catalogues canonique et embarqué, afin que
les options exécutables ne restent pas cachées derrière une liste historique.

## Conséquences et validation

Les mécanismes de recherche deviennent exécutables avec leurs données requises.
L'absence de corpus conserve `insufficient_data` ; l'absence de modèle admissible
ou de manifeste conserve un refus explicite. Les tests locaux ne mesurent pas
un avantage causal sur les modèles réels et ne requalifient pas la campagne R3.

La suite `node backend/tests/run_trinity_suite.js` couvre les régressions et
les nouveaux chemins de recherche et d'assemblage. Les trois gates du dépôt
restent nécessaires avant toute déclaration de validation globale.
