# Campagne de qualification — topologies, Morphogenèse et orchestrateur

- **Version** : 1.0.0
- **Statut** : protocole à exécuter ; aucun résultat de campagne n'est présumé
- **Périmètre** : huit topologies canoniques, préparateur Morphogenèse, prévol V2 en shadow et chemin simple de l'orchestrateur backend

Le plan d'implémentation de la comparaison causale est décrit dans [PLAN-IMPLEMENTATION.md](PLAN-IMPLEMENTATION.md).

Le contrat et l'inventaire initial des tâches sont versionnés dans [suite.json](suite.json), conformément à [schemas/suite.schema.json](schemas/suite.schema.json). À ce stade, seule la référence arithmétique possède un oracle indépendant; les autres tâches restent des probes de mécanisme ou des contrôles de contrat et ne sont pas admissibles à une comparaison confirmatoire.

Chaque exécution archive la provenance du commit, l'état propre/sale de l'arbre source, les empreintes de la suite, des missions et des reçus extraits, les états des workers, les temps, ainsi que la portée explicite de l'oracle. Le format de sortie est décrit par [schemas/campaign-results.schema.json](schemas/campaign-results.schema.json). Un arbre modifié est automatiquement marqué non admissible comme résultat confirmatoire.

Les preuves de mécanisme sont maintenant séparées de la vérification d'exécution. Les sessions Biome, Syncytium et Rhizome réutilisent les probes qui valident mutation/lecture d'état; Trinity, A-Team, Biocénose, Holobionte et Métapopulation restent explicitement `not-instrumented` jusqu'à l'ajout de probes propres. L'état `verified` d'une probe n'est pas une preuve de supériorité causale.

L'audit de composition A-Team compare maintenant trois paires de formulations, avec les domaines attendus définis à l'avance : `node benchmarks/topology-morphogenesis/run-ateam-composition-audit.cjs`. Il rapporte précision/rappel par formulation et la stabilité des ensembles détectés; ces attentes de domaines sont un audit d'ingénierie, pas un oracle sémantique. Pour les prédictions probabilistes, [calibration.cjs](calibration.cjs) calcule Brier uniquement avec des issues observées extérieurement et refuse les issues manquantes.

La préinscription et la randomisation des blocs appariés sont amorcées dans [comparison-plan.json](comparison-plan.json). Quatre tâches jouets ont maintenant des oracles déterministes locaux dans [oracles.cjs](oracles.cjs), décrits dans [comparison-task-set.json](comparison-task-set.json). Générer un ordre reproductible avec `node benchmarks/topology-morphogenesis/run-comparison-plan.cjs`; le résultat porte `status: assignment-only`, donc ne contient aucun résultat d'exécution. Les sept conditions causales sont déclarées, mais leurs adaptateurs restent bloqués jusqu'à la définition d’un même contrat d’exécution par condition.

Cette campagne fait progresser la preuve du contrat jusqu'à l'exécution observable. Un dispatch accepté ou une mission terminée ne suffit pas à qualifier une topologie d'opérationnelle. Il faut des opérations spécifiques observables, des livrables vérifiés, des répétitions et des contrôles négatifs réussis.

## Lancement d'une mission

Pour exécuter les douze cas dans l'ordre et conserver leurs journaux et états de workers :

```powershell
node benchmarks/topology-morphogenesis/run-campaign.cjs
node benchmarks/topology-morphogenesis/session-probes.cjs artifacts/topology-morphogenesis/<dossier-du-run>
```

Le premier programme affiche le dossier créé. Il utilise une base SQLite et un espace de travail témoin isolés, sélectionne `qwen2.5:14b` si aucun modèle local n'est configuré, et attend la fin des workers biologiques par paires afin d'observer leurs états sans saturer les copies de capsules. Le second exerce les sessions persistées Biome, Syncytium et Rhizome et écrit `session-probes.json`. `campaign-results.json` conserve les contrôles par mission et leur synthèse : les topologies échouent si un worker manque ou n'atteint pas `completed`, l'orchestrateur simple doit passer son garde et sa preuve arithmétique indépendante, et les probes de session doivent toutes être vérifiées. Le lanceur retourne un code non nul dès qu'un contrôle échoue. La qualification reste `experimental` tant que les critères de passage et les répétitions sur un même commit ne sont pas réunis. Les journaux bruts restent dans le dossier du run; un `exitCode` nul pour un dispatch indique seulement que la requête a été traitée.

Depuis la racine du dépôt, PowerShell :

```powershell
$mission = Get-Content -Raw benchmarks/topology-morphogenesis/missions/orchestrateur-simple.json
node backend/bin/genos-orchestrate.cjs $mission
```

Remplacer le nom de fichier par l'identifiant voulu dans la matrice ci-dessous. Chaque fichier est un payload JSON accepté par le CLI. Lancer une mission à la fois et conserver l'objet JSON retourné, les événements `GENOS_STREAM` s'ils sont activés, ainsi que les identifiants et dossiers des workers. Pour capter les événements :

```powershell
$env:GENOS_STREAM_TELEMETRY = '1'
$mission = Get-Content -Raw benchmarks/topology-morphogenesis/missions/orchestrateur-simple.json
node backend/bin/genos-orchestrate.cjs $mission 2>&1 | Tee-Object -FilePath artifacts/topology-morphogenesis/orchestrateur-simple.log
```

Créer le répertoire de sortie avant le lancement. Les missions d'orchestration et de topologie peuvent appeler des modèles configurés dans l'environnement et consommer leur budget. Les missions de dispatch démarrent des workers en arrière-plan ; leur sortie initiale `accepted` est un accusé de réception, pas un résultat.

Pour le prévol Morphogenèse V2, exécuter le cas dans un processus où le shadow est activé :

```powershell
$env:GENOS_MORPHOGENESIS_V2_SHADOW = '1'
$mission = Get-Content -Raw benchmarks/topology-morphogenesis/missions/morphogenese-shadow.json
node backend/bin/genos-orchestrate.cjs $mission
Remove-Item Env:GENOS_MORPHOGENESIS_V2_SHADOW
```

## Paliers de difficulté

| Palier | Campagne | Preuve attendue | Ce que le palier établit |
|---|---|---|---|
| 0 — référence | `orchestrateur-simple` | mission achevée, critères déterministes vérifiés et barrière de preuve satisfaite | le chemin simple peut terminer une mission contrôlée |
| 1 — couverture | huit missions `topologie-*` | mode demandé, composition et rôles retournés, workers concordants, états terminaux et provenance | le dispatch dédié de chaque topologie est adressable et observable |
| 2 — mécanismes | les mêmes huit missions | traces ou reçus des opérations spécifiques indiquées dans chaque mission, puis vérification indépendante de l'artefact | les mécanismes exercés fonctionnent pour ce scénario précis |
| 3 — plan morphologique | `morphogenese-plan` | plan et candidats enregistrés, contraintes et raisons de sélection consultables | le planner propose une morphologie pour cette entrée |
| 4 — prévol | `morphogenese-shadow` | résultat V2 `SHADOWED`, proposition validée, aucun reçu d'autorisation ni transition appliquée | le prévol peut évaluer une proposition sans la committer |
| 5 — répétition et réfutation | reprendre les cas réussis avec seeds et budgets figés, puis `garde-preuve-negative` | répétitions conformes et contrôle négatif bloqué avec motif explicite | les résultats sont reproductibles et les gates refusent une preuve insuffisante |

Les missions des paliers 1 et 2 sont réunies dans un payload par topologie : le même lancement doit d'abord démontrer la composition, puis satisfaire les critères spécifiques du palier 2. Si la session, l'opération, la preuve ou la métrique spécifique n'est pas réellement observée, classer le mécanisme comme **non démontré** même si les workers terminent.

Le dispatch biologique retourne maintenant l'identifiant et la version de toute session qu'il compose. Les missions Syncytium, Rhizome et Biome doivent reprendre ce `sessionId` dans leurs appels `genos_topology_session` et conserver les reçus de composition et d'opération. Rhizome expose `add_node` et `add_edge` afin que le cas de routage puisse construire un graphe persistant. Si l'accusé de réception ne contient aucun identifiant, classer la session comme non créée et ne pas inférer un succès à partir des workers acceptés.

## Matrice des missions

| Fichier | Voie demandée | Mécanisme propre à vérifier |
|---|---|---|
| `missions/orchestrateur-simple.json` | `orchestrate` | solution bornée, oracle déterministe, aucune dépendance à une topologie biologique |
| `missions/topologie-trinity.json` | `dispatch_trinity` | exactement trois mondes isolés, empreinte de départ commune, comparaison après clôture et décision étayée |
| `missions/topologie-a-team.json` | `dispatch_team` + `domains` et critères d'acceptation explicites | au moins deux domaines distincts, dépendances entre étapes et intégration par responsable identifié |
| `missions/topologie-biome.json` | `dispatch_biological`, `mode=biome` | niches/populations, allocation des ressources, foraging et état du biofilm observables |
| `missions/topologie-biocenose.json` | `dispatch_biological`, `mode=biocenose` | contributions distinctes, règle de consensus/quorum et abstention si les preuves divergent |
| `missions/topologie-holobionte.json` | `dispatch_biological`, `mode=holobionte` | capacités hôte/symbiotes, sortie contractuelle et décision de veto explicitement vérifiées |
| `missions/topologie-syncytium.json` | `dispatch_biological`, `mode=syncytium` | session persistée, deux mises à jour compatibles, snapshot convergent et invariants maintenus |
| `missions/topologie-rhizome.json` | `dispatch_biological`, `mode=rhizome` | graphe de capacités, dépôt stigmergique et sélection/routage vers un membre admissible |
| `missions/topologie-metapopulation.json` | `dispatch_biological`, `mode=metapopulation` | populations séparées, agrégation/quorum et comportement documenté face à un membre indisponible |
| `missions/morphogenese-plan.json` | `orchestrate` | hypothèses, contraintes, candidats topologiques et justification du choix / refus |
| `missions/morphogenese-shadow.json` | `orchestrate` avec `GENOS_MORPHOGENESIS_V2_SHADOW=1` | proposition V2 validée en shadow sans changement d'état |
| `missions/garde-preuve-negative.json` | `orchestrate` | demande de conclusion sans preuve; doit rester non vérifiée, bloquée ou escaladée |

## Critères de passage

### Référence simple

Le palier 0 passe si le résultat inclut la réponse attendue, si le vérificateur déterministe la confirme, si la mission atteint une clôture autorisée et si aucune preuve n'est remplacée par une affirmation de worker. Refaire trois fois avec le même commit, la même entrée et les mêmes budgets. Conserver aussi le coût, la durée, les tokens, la route d'exécution et les états des workers.

### Topologies

Pour chaque topologie, exiger les éléments suivants dans le dossier :

1. le mode demandé et le mode composé correspondent ;
2. les rôles/membres créés concordent avec le dispatch et leur nombre ;
3. tous les workers atteignent un état terminal explicite, sans dispatch différé ni écart inexpliqué ;
4. une trace, un reçu ou un état persistant atteste le mécanisme spécifique de la matrice ;
5. un vérificateur indépendant valide le livrable et les invariants de mission ;
6. le coût et la durée restent dans les budgets figés.

Un test d'intégration qui valide seulement le composeur, l'existence d'un outil ou l'acceptation du dispatch reste une preuve de composant/câblage. Il ne valide pas le mécanisme en exécution de bout en bout. Les missions Biome, Syncytium et Rhizome exigent une session identifiable et une mutation/lecture effectivement persistée; la seule capacité déclarée n'est pas suffisante. Pour Trinity, trois workers acceptés ne prouvent ni l'isolation ni la comparaison.

### Morphogenèse

Le palier 3 passe lorsque le plan enregistré expose candidats, contraintes dures, coûts/risques utilisés et motif de sélection, ou un refus fermé si les entrées sont insuffisantes. Le palier 4 passe seulement lorsque la trace montre l'évaluation V2 en shadow et l'absence de transition appliquée. Une exécution historique `prepareMorphology` seule valide uniquement le préparateur historique et doit être rapportée séparément du planner Morphogenèse et du runtime V2.

Ne pas demander une transition avec commit pour cette campagne. Le commit Morphogenèse V2 dépend des adaptateurs d'adjudication du noyau et de gouvernance; une proposition shadow n'autorise aucune modification. Toute qualification ultérieure d'une transition opérationnelle doit utiliser une campagne séparée, isolée, avec reçu d'adjudication, approbation et vérification de rollback.

### De « experimental » à « operationnel »

Attribuer la maturité **opérationnelle pour le périmètre testé** uniquement si, pour le même commit et la même configuration :

- chaque cas requis passe trois fois de suite avec seeds et budgets consignés ;
- toutes les preuves du tableau sont issues des traces/états runtime, et les livrables passent un oracle indépendant ;
- le contrôle négatif échoue fermé comme attendu et une défaillance d'un worker n'est pas comptée comme succès ;
- les incidents, échecs, reprises et métriques sont conservés ;
- aucune capacité partielle ou proposée n'est présentée comme opérationnelle.

Sinon, garder le statut **expérimental** ou **partiel**, en nommant le palier réellement atteint et les preuves manquantes. Cette qualification porte sur les mécanismes et scénarios exécutés; elle ne prouve ni performance générale, ni disponibilité de production, ni comparaison favorable entre topologies.

## Fiche de campagne à remplir

Pour chaque mission, archiver : `suite_version`, `git_commit`, `mission_id`, `seed`, `mode/action`, version/configuration du runtime, modèle/provider demandé et servi, budgets prévus/réels, durée, identifiants des workers et états terminaux, traces et reçus spécifiques, vérifications indépendantes, verdict de clôture, incidents et verdict du palier. Utiliser `null` pour une mesure absente, jamais zéro. Un résultat sans provenance est **inconclusif**.

| Mission | Répétition 1 | Répétition 2 | Répétition 3 | Contrôle négatif | Verdict / preuves manquantes |
|---|---|---|---|---|---|
| Orchestrateur simple | | | | | |
| Trinity | | | | | |
| A-Team | | | | | |
| Biome | | | | | |
| Biocénose | | | | | |
| Holobionte | | | | | |
| Syncytium | | | | | |
| Rhizome | | | | | |
| Métapopulation | | | | | |
| Morphogenèse planner / V2 | | | | | |

## Limites connues à garder dans le rapport

Les huit composeurs canoniques sont adressables par des dispatchs dédiés, mais le chemin principal `orchestrate` n'exécute pas uniformément les huit topologies. Le planner qui joint des candidats morphologiques, le préparateur historique et le prévol V2 sont trois preuves différentes. Les six modes biologiques acceptent leur payload via `dispatch_biological`; Trinity et A-Team utilisent des dispatchs dédiés. Les variants marqués partiels restent partiels même si une mission de composition passe.

## Compte rendu — 2026-09-25

Cette première exécution est **partielle** et ne fait passer aucune topologie à l'état opérationnel.

| Voie | Résultat observé | Verdict |
|---|---|---|
| Orchestrateur simple | le worker local s'est arrêté sur `deadlock_collapse`; clôture refusée, invariant `mission_outcome_success` non satisfait | échec palier 0 |
| Trinity | trois mondes acceptés, mais les trois restent `queued`; aucun agent worker correspondant | composition acceptée, exécution non démontrée |
| Six modes biologiques | Biocénose, Biome, Holobionte, Métapopulation, Rhizome et Syncytium ont chacun retourné quatre membres `accepted`; aucun de leurs workers n'apparaît dans `agents` | composition acceptée, exécution non démontrée |
| A-Team | payload initial refusé sans domaines et critères explicites; payload corrigé accepté, run toujours `RUNNING`, membres `PLANNED`, sans identifiants worker persistés | contrat exercé, dispatch non terminé |
| Sessions Biome, Syncytium, Rhizome | allocation Biome puis foraging réussi après retrait d'un identifiant de population inconnu; application/snapshot/historique Syncytium réussis avec avertissement de champ non typé; dépôt Rhizome réussi, routage `unreachable` | opérations partielles; reçus dans `artifacts/topology-morphogenesis/session-operations-1.json` |
| Planner historique | mission arrêtée par deadlock; événement `MORPHOGENESIS_COMPLETED` indique `parallel_forks`, `commitId: null`; candidats du planner non établis | palier 3 non passé |
| V2 shadow | décision `SHADOWED`, `committed: false`, erreurs vides, autorité noyau/gouvernance en attente; mission entière bloquée par `evidence_report` manquant | preuve shadow réussie; mission incomplète |
| Contrôle négatif | gate de clôture bloqué avec `evidence_missing`; runtime également arrêté sur deadlock | refus observé, scénario incomplet |

Les dispatchs ont produit 30 identifiants worker dans les reçus examinés, mais aucune ligne `agents` correspondante; les mondes Trinity restent en attente et le run A-Team reste en cours. La campagne a rencontré `ENOSPC` pendant les copies concurrentes de workspaces. J'ai supprimé uniquement la première racine de capsules de cette campagne pour récupérer de l'espace; les runs suivants ont recréé des capsules, conservées pour le GC différé du runtime. Journaux et reçus restent sous `artifacts/topology-morphogenesis/`.

Les répétitions ne sont pas engagées : aucun scénario complet n'a passé sa barrière de mission. Le seul passage spécifique confirmé est l'évaluation non committante V2 shadow. Aucun statut opérationnel global ne peut être attribué sur cette exécution.

Voir aussi [Topologies et contrat de capacités](../../docs/02-orchestration/topologies-et-capacites.md), [Orchestration](../../docs/02-orchestration/orchestration.md) et [Catalogue des variants morphologiques](../../docs/02-orchestration/topologies/variants-morphologiques.md).

## Relance instrumentée — 2026-09-25

Le lanceur a parcouru les douze missions et conservé les sorties dans `artifacts/topology-morphogenesis/campaign-2026-09-25T08-57-24-523Z/`. Les corrections de câblage ont fait passer les workers biologiques de `idle` à des états d'exécution observables. Cette relance est **exploratoire** : le code et `HEAD` ont changé pendant son exécution, et elle ne vaut donc pas répétition d'un même commit.

| Voie | Observation | Verdict limité |
|---|---|---|
| Orchestrateur simple | délai atteint, aucun reçu de réussite | palier 0 non passé |
| Trinity et A-Team | trois workers Trinity terminaux; A-Team a un worker en erreur et un worker de récupération encore actif | composition/exécution partielles, comparaison et intégration non prouvées |
| Six modes biologiques | quatre workers persistés et exécutés par mode; certains sont `terminated` | dispatch observable, mécanismes à qualifier séparément |
| Biome | allocation de 6 unités entre trois niches et foraging inscrits dans la session | opérations de session vérifiées; mission complète non prouvée |
| Syncytium | deux mises à jour conservées dans l'historique et le snapshot; aucune définition d'invariant dans la session | convergence observée, critère d'invariant non vérifié |
| Rhizome | trois nœuds, deux arêtes, dépôt et route vers `schema-validator` persistés | routage de session vérifié; reçu d'exécution de la validation absent |
| Planner et V2 shadow | planner refusé par la clôture; V2 a émis `SHADOWED`, `committed: false` | prévol shadow observé, transition opérationnelle non autorisée |
| Contrôle négatif | délai de campagne atteint sans verdict de gate | inconclusif |

Le moteur local a échoué ou s'est arrêté dans plusieurs workers; aucun résultat de dispatch ne remplace une preuve de livrable. La qualification reste **expérimentale**. Une nouvelle campagne doit être lancée sur un commit figé avec un moteur capable de terminer les missions et avec les invariants Syncytium définis, puis répétée trois fois avant toute promotion du périmètre testé.
