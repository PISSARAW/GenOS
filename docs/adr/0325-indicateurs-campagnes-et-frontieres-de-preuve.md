# ADR 0325 — Indicateurs, campagnes et frontières de preuve

- Date : 2026-10-06
- Statut : accepté pour les mécanismes logiciels, sans promotion scientifique

## Contexte

Le bridge des onze familles réexécutait des producteurs déjà appelés par le
runtime. Sa gate pouvait accepter des noms de preuves, et la campagne locale
annonçait des graines qui n'avaient pas toutes été exécutées. Ces raccourcis
contredisaient la séparation transport, observation et décision.

## Décision

Le bridge devient un observateur des résultats du pipeline. Il ne charge plus
l'ignition, ne décharge plus l'efférence et ne réapprend plus les transitions.
Les statuts `observed` ne prouvent ni causalité ni couverture complète.

La promotion consomme exclusivement des objets immuables produits après une
vérification indépendante en cours de processus. Leur sérialisation ou copie
ne préserve pas la confiance : les octets doivent être revérifiés. Le vérifieur
doit lier sa décision au namespace `consciousness:<indicateur>:<exigence>`, à
l'indicateur, au hash d'artefact et au triplet organisation/projet/entité.
Le `contextHash` du modèle/runtime évalué doit également correspondre au
contexte cible : une ancienne preuve ne promeut pas une nouvelle version.
Un simple checksum ou un résultat de test ne suffit pas. Les dépendances de
vérification sont propagées du rapport au collecteur.

Le modèle du monde conserve la masse de probabilité et conditionne ses
transitions sur l'état encodé, lorsqu'il est disponible. Le rollout propage
les deltas, s'arrête sur les états inconnus et reste limité à treize noeuds et
trois niveaux. Le modèle reste empirique, sans extrapolation neuronale.

La récurrence perceptive conserve les objets absents pendant un délai borné.
La précision zéro est respectée et les dimensions non observées conservent
leur prior. Les options HRL exigent initiation, politique, terminaison,
budget et autorisation à chaque action. La valence post-action exige des
mesures complètes et un identifiant d'action corrélé.

Les rapports de la phase `synthesisOnly` sont assemblés de façon déterministe
depuis les dossiers attendus. Les déclarations restent attribuées, les
contradictions et les omissions restent visibles. Le runtime local peut
produire ce rapport sans appel au modèle. Une déclaration sourcée n'est
toutefois pas une vérification indépendante.

## Campagnes

La campagne d'ignition exécute réellement les deux bras pour chaque graine,
avec snapshot cloné, budget commun, sources hashées et trajectoires conservées.
Son verdict est limité au mécanisme logiciel et à son protocole.

Le harness externe exige corpus hashé, révision source, modèle, protocole,
métrique et budget de cas. Le runner ne reçoit pas les réponses de référence.
Les erreurs restent dans le dénominateur. Les fixtures restent des fixtures :
ce harness ne remplace pas les protocoles officiels
[SAD](https://github.com/LRudL/sad) et
[MIRROR](https://github.com/Jason-Wang313/Mirror).

Les réplications réservent des graines distinctes des graines de développement
et exigent un protocole hashé enregistré avant le premier run. Les échecs,
doublons, omissions et modifications du protocole sont conservés ou rejetés.
Des graines réservées ne garantissent pas, seules, un corpus indépendant.

L'adaptateur Φ appelle uniquement PyPhi 1.2.0/IIT 3.0 sur un modèle binaire
interventionnel de un à quatre noeuds, avec hypothèse d'indépendance
conditionnelle explicite. Sans moteur compatible, il retourne `not_run`,
jamais un proxy. Voir l'[API PyPhi](https://pyphi.readthedocs.io/en/latest/api/compute.html).
Ce calcul ne représente pas Φ du runtime entier.

## Continuation : action, contrôle et réplications bornées

Le producteur `conceptActionLifecycleService` mesure deux états issus de la
télémétrie et des mémoires SQLite, corrélés à un identifiant d'action. Il
apprend un delta conditionné par l'état initial et prédit la valence avant
l'action suivante. Sans distribution complète, la prédiction reste
indisponible : une mesure post-action ne remplit pas ce manque. Les sept
variables restent des heuristiques machine, sans prétention phénoménale.
Les reçus immuables sont reconnus uniquement dans le processus producteur
et pour le même agent ; une copie JSON n'est pas une observation de confiance.

Le pont d'exécution MCP propage désormais l'identité d'acteur au transport.
L'observation post-action est branchée mais **désactivée par défaut** :
`GENOS_CONCEPT_ACTION_OBSERVATION=1` l'active explicitement. Ses délais sont
bornés et ses erreurs ne modifient pas le résultat métier ni ne relancent
l'outil. Le gateway conserve ses contrôles d'autorité, de lease, de chemins,
d'immunité, de chromatin lock et de circuit breaker.

`hierarchicalOptionService.runMcpOption` relie les options au gateway complet,
avec une identité d'acteur fixe et une lease explicite à chaque action.
Un refus de policy, un feedback indisponible ou une interruption arrête
l'option. Une interruption survenue pendant l'autorisation empêche l'action.
La récompense utilise la valence réellement mesurée, pas une valeur fournie
par la politique. Ce raccordement ne couvre pas les effecteurs hors Node.

Le lecteur de cycles observe `modeResult.executed` et la calibration réellement
renvoyée par le producteur, plutôt qu'un champ `status` inexistant.

Les campagnes de maintien perceptif, de prior descendant et d'accès au
rapport exécutent cinq paires depuis des snapshots clonés. Leurs métriques,
trajectoires, sources et environnement sont conservés. Les tests de graines
réservées enregistrent le protocole dans SQLite avant toute exécution et
rejettent une dérive de l'environnement préenregistré. Ces interventions
synthétiques bornées ne sont pas une réplication scientifique indépendante.

Le harness externe fige également les callbacks et la réponse avant scoring.
Il borne les délais, transmet un signal d'annulation et ne lance plus de
cas après timeout. Un fournisseur peut ignorer ce signal : le harness ne
garantit pas l'annulation d'un appel déjà lancé. Les cas non exécutés restent
au dénominateur. Les corpus externes ne conservent ni réponses ni erreurs
libres en clair dans les résultats ; les fixtures restent identifiées.
Les données officielles SAD, leur protection contre contamination et les
tâches procédurales nécessitent encore une intégration spécifique.

## Conséquences et limites

Le code et les tests locaux peuvent être terminés avant les campagnes
externes. Aucune famille ne devient opérationnelle à cause de ce seul lot.
Les voies d'effection hors frontière Node, le contrôle HRL complet,
l'apprentissage d'une hiérarchie générative riche et la validation causale
réservée restent des exigences distinctes. La validation de référence est
`node backend/tests/run_concept_suite.cjs` ; les gates globales du dépôt
restent obligatoires et ne sont pas remplacées par cette suite ciblée.
