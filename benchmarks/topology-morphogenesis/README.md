# Campagne de qualification — topologies, Morphogenèse et orchestrateur

- **Version** : 1.0.0
- **Statut** : pilote exécutable ; aucun résultat de campagne n'est présumé
- **Périmètre** : huit topologies canoniques, préparateur Morphogenèse, prévol V2 en shadow et chemin simple de l'orchestrateur backend

Le plan d'implémentation de la comparaison causale est décrit dans [PLAN-IMPLEMENTATION.md](PLAN-IMPLEMENTATION.md).

Le contrat P2 pré-commit est figé dans [p2-protocol.json](p2-protocol.json). Il
exige des blocs complets agent unique / GenOS fixe / GenOS adaptatif /
LangGraph / AutoGen GraphFlow ou Swarm / MASS ou EvoMAS, un corpus shadow et un
holdout disjoints, puis des intervalles appariés corrigés. Son état reste
`contract-ready-execution-blocked` tant que les adaptateurs externes et les
datasets scellés ne sont pas fournis. Même une sortie `eligible` de la porte
P2 ne vaut ni autorisation de commit ni promotion runtime.

## P3 — runner durable de campagne appariée

P3 fournit maintenant le chemin d'exécution entre ce contrat et la porte P2 :
`run-p3-campaign.cjs` exécute les six bras par blocs appariés, persiste un reçu
immuable par tentative, reprend sans rejouer un reçu terminal, récupère un bail
expiré et scelle séparément `shadow` puis `holdout`. Le holdout est refusé tant
que le shadow n'est pas scellé. La requête envoyée à un adaptateur ne contient
ni le nom du split, ni l'identité du dataset, de la tâche ou de l'oracle.

```bash
node benchmarks/topology-morphogenesis/run-p3-campaign.cjs \
  --config /chemin/vers/p3-runtime.json --phase shadow
node benchmarks/topology-morphogenesis/run-p3-campaign.cjs \
  --config /chemin/vers/p3-runtime.json --phase holdout
```

La configuration suit [schemas/p3-runtime-config.schema.json](schemas/p3-runtime-config.schema.json),
le manifeste préenregistré [schemas/p3-manifest.schema.json](schemas/p3-manifest.schema.json)
et les corpus [schemas/p3-dataset.schema.json](schemas/p3-dataset.schema.json).
Chaque adaptateur est un processus sans shell, lié au hash de son exécutable et
de son artefact. Il reçoit une clé d'idempotence stable et doit retourner un reçu
`genos.morphogenesis.p3-adapter-receipt/v1` avec métriques mesurées. Les trois
rivaux externes exigent une provenance `external-paired`, un framework autorisé
et une portée `external-framework`. Les fixtures de test portent la portée
`test-fixture` et produisent toujours `realExecution: false` : elles ne peuvent
donc pas ouvrir la porte statistique.

Le runner est implémenté mais aucune configuration de production ni aucun
corpus réel n'est livré avec le dépôt. Le statut global demeure donc
`contract-ready-execution-blocked` jusqu'à l'exécution réelle de LangGraph,
AutoGen GraphFlow/Swarm et MASS/EvoMAS sur les corpus scellés.

## P4 — audit de composition, calibration et sélection

`phase4Audit.cjs` réunit les portes de la phase 4 : partitions d'entraînement
et de holdout disjointes par tâche, famille et oracle, prédictions issues
uniquement de l'historique autorisé, résultats d'oracle externes vérifiés,
couverture et abstention de calibration, baselines de sélection, et audit
lexical A-Team. Le rapport est explicitement `observed` et conserve la portée
`lexical-sensitivity` de l'audit A-Team ; il ne peut pas déclarer une
supériorité universelle ni rendre la confirmation admissible.

```bash
node benchmarks/topology-morphogenesis/test-phase4-audit.cjs
```

Une fuite de famille/oracle, une prédiction marquée `holdout`, un résultat sans
oracle externe ou l'absence de baseline bloque l'audit. Les scores de Brier,
la couverture, le regret de sélection et les comparaisons de baseline restent
des mesures observées, pas des autorisations de promotion runtime.

## P5 — qualification confirmatoire bornée

`phase5Qualification.cjs` transforme la sortie de la porte de campagne appariée
en rapport publiable par famille de tâches, par condition/topologie et au niveau
global. Il conserve le nombre de tentatives, les vérifications, les échecs, le
score moyen, le coût moyen et les dépassements de budget. La qualification
exige simultanément un holdout scellé, un arbre source propre, des adaptateurs
externes et une preuve de mécanisme vérifiés, la séparation entraînement / test,
les répétitions prescrites et une porte P3 éligible. Une porte bloquée expose
chaque motif manquant; elle ne peut pas être convertie en succès par un simple
transport ou une mission terminée.

```bash
node benchmarks/topology-morphogenesis/test-phase5-qualification.cjs
```

Le rapport porte uniquement sur la campagne observée :
`causalAdvantage` peut être vrai lorsque la comparaison appariée satisfait son
plan, tandis que `universalGeneralization` et `runtimePromotionAuthorized`
restent toujours faux. Les résultats négatifs, inconclusifs, les surcoûts et les
échecs de budget restent visibles dans les agrégats; aucune supériorité
universelle ni promotion runtime n'est déduite de cette qualification.

## P6 — robustesse bornée et validation externe

`phase6Validation.cjs` ajoute une porte après P5. Elle exige une couverture
multi-seed et multi-famille, des reçus d'exécution réels pour les déploiements
externes et les workers Trinity/A-Team, une parité distribuée observée sur
plusieurs topologies réseau, ainsi qu'un toolchain Rust vérifié (NASM visible,
MSVC prêt et compilation passée). Les effets sont évalués par environnement
avec leurs intervalles, coûts et garde-fous.

```bash
node benchmarks/topology-morphogenesis/test-phase6-validation.cjs
```

La sortie `eligible` signifie que la porte est satisfaite pour les
environnements, familles et seeds fournis. Elle conserve
`universalGeneralization: false` et `runtimePromotionAuthorized: false` : les
reçus Kubernetes/cloud, la parité réseau et la compilation Rust doivent être
réels et archivés dans une campagne pour produire une observation; le test du
dépôt ne constitue qu'une vérification du contrat de la porte.

## P7 — réplication indépendante et revue de mise en production

`phase7ReleaseGate.cjs` ferme la chaîne de preuve avant une revue de release.
Il exige deux réplications indépendantes sur le même commit, des artefacts
immutables rejouables, un exercice de rollback vérifié, des contrôles négatifs
réussis, aucun incident ouvert et les revues de preuve, sécurité et
reproductibilité. La sortie `reviewable` ouvre une revue gouvernée; elle ne
déclenche aucune transition Morphogenèse et ne vaut pas autorisation runtime.

```bash
node benchmarks/topology-morphogenesis/test-phase7-release-gate.cjs
```

Les fixtures du test vérifient le câblage de la porte. Une release réelle doit
fournir les reçus des opérateurs et environnements indépendants, les artefacts
rejoués et le journal de rollback. `universalGeneralization` reste faux même
lorsque la revue est éligible.

## P8 — observation post-release et dérive

`phase8OperationalGate.cjs` vérifie les canaries après la revue P7. Il exige
plusieurs fenêtres d'observation et environnements, des métriques de succès,
d'erreur, latence, coût et dérive sous les seuils préinscrits, une télémétrie
vérifiée, des règles d'alerte chargées et l'absence d'incident ouvert. Toute
défaillance de canary ou dérive excessive bloque la poursuite.

```bash
node benchmarks/topology-morphogenesis/test-phase8-operational-gate.cjs
```

La sortie `observed` autorise seulement la poursuite de l'observation sur le
périmètre et les fenêtres fournis. Elle ne crée ni autorisation de promotion
continue ni preuve de stabilité indéfinie; `universalGeneralization` et
`runtimePromotionAuthorized` restent faux.

Le contrat et l'inventaire initial des tâches sont versionnés dans [suite.json](suite.json), conformément à [schemas/suite.schema.json](schemas/suite.schema.json). À ce stade, seule la référence arithmétique possède un oracle indépendant; les autres tâches restent des probes de mécanisme ou des contrôles de contrat et ne sont pas admissibles à une comparaison confirmatoire.

Chaque exécution archive la provenance du commit, l'état propre/sale de l'arbre source, les empreintes de la suite, des missions et des reçus extraits, les états des workers, les temps, ainsi que la portée explicite de l'oracle. Le format de sortie est décrit par [schemas/campaign-results.schema.json](schemas/campaign-results.schema.json). Un arbre modifié est automatiquement marqué non admissible comme résultat confirmatoire.

Les preuves de mécanisme sont séparées de la vérification d'exécution. Le manifeste distingue les probes `component-smoke-only` des observations `session-mechanism-observation`; aucune des huit probes actuelles n'est admissible à la vérification de mission et leurs oracles sont absents. L'état `verified` d'une probe de portée limitée n'est pas une preuve de supériorité causale.

Périmètre d'oracle déclaré : seule `orchestrateur-simple` dispose d'un oracle de résultat de mission indépendant (`simpleMissionProof.cjs`) ; les huit scénarios de topologie n'ont aucun oracle de résultat (`oracle.status: missing`) et les missions Morphogenèse et de contrôle négatif n'ont qu'un contrat runtime (`runtime-contract-only` / `gate-refusal`). Les probes (`component-smoke-only`, `session-mechanism-observation`), les tests d'intégration et un dispatch `accepted` ne qualifient jamais une mission de bout en bout réussie : sans oracle `mission-outcome` indépendant et vérifié, une fin de mission reste `inconclusive` (aucun reçu) ou `unverified` (reçu partiel), jamais `verified`. Les campagnes historiques partielles sont relues avec cette règle (`qualifyHistoricalCampaign` dans [campaignQualification.cjs](campaignQualification.cjs)).

L'audit de composition A-Team compare maintenant trois paires de formulations, avec les domaines attendus définis à l'avance : `node benchmarks/topology-morphogenesis/run-ateam-composition-audit.cjs`. Il rapporte précision/rappel par formulation et la stabilité des ensembles détectés; ces attentes de domaines sont un audit d'ingénierie, pas un oracle sémantique. Pour les prédictions probabilistes, [calibration.cjs](calibration.cjs) calcule Brier uniquement avec des issues observées extérieurement et refuse les issues manquantes.

L'évaluation du choix Morphogenèse dans [selection-evaluation.cjs](selection-evaluation.cjs) interdit les tâches communes entre entraînement et holdout, puis rapporte l'accord exact avec la sélection oracle et le regret d'utilité sur les issues observées. `node benchmarks/topology-morphogenesis/check-phase-readiness.cjs` écrit une porte de qualification dans les artefacts; chaque topologie doit déclarer une probe de portée `mission-outcome`, admissible à la vérification, et un oracle indépendant. Changer l'identifiant de la probe ne peut pas satisfaire ces exigences. La porte refuse `ready` tant qu'un oracle de mission manque (`mission-oracle-missing`) et rejette toute probe `component-smoke-only` ou `session-mechanism-observation` présentée comme preuve de mission (`component-smoke-not-mission-outcome`). La porte reste aussi bloquée tant qu'un adaptateur, une hypothèse d'affectation ou un arbre source figé manque. Une porte `ready` ne constitue pas à elle seule un résultat positif.

La préinscription, les blocs appariés et leurs graines sont dans [comparison-plan.json](comparison-plan.json). Les quatre tâches de [comparison-task-set.json](comparison-task-set.json) sont des fixtures jouets de pilote, pas des tâches inédites. Leurs oracles déterministes servent seulement à vérifier chaque sortie de pilote. Ce comparatif général reste un pilote sur quatre tâches jouets : aucune supériorité causale générale n'est établie.

## Pilote comparatif exécutable

Lancer `node benchmarks/topology-morphogenesis/run-comparison-campaign.cjs --mode pilot` avec un serveur Ollama joignable et le modèle chargé. `GENOS_COMPARISON_MODEL` choisit le modèle (défaut `qwen2.5-coder:7b`) et `GENOS_COMPARISON_OLLAMA_URL` l'endpoint. Le harnais apparie chaque tâche et graine, randomise l'ordre des conditions, isole les bases et espaces de travail GenOS, impose le même plafond de tokens et de latence, puis vérifie les réponses avec l'oracle indépendant local. Cet appariement est interne aux conditions locales uniquement ; il ne constitue pas une exécution appariée avec un framework concurrent. Le coût mesuré est le nombre total de tokens rapporté par l'exécuteur; la latence est mesurée de bout en bout. Le coût monétaire n'est pas calculé sans tarif configuré.

Les adaptateurs actuellement exécutables sont tous des configurations locales (`provenance: local-config`, `externalFramework: none`) : le modèle seul (`local-baseline`), une équipe fixe (`local-baseline`), un routeur conditionnel à profil de requête (`local-baseline`), une équipe à communications réduites (`local-baseline`) et le runtime GenOS complet (`local-runtime`). Aucune comparaison directe avec des systèmes concurrents n'est établie : aucun adaptateur `external-paired` avec protocole commun (mêmes tâches/graines/budgets/oracle, exécution réelle via le framework concurrent) n'est enregistré. Toute allégation de comparaison inter-frameworks est refusée par le garde `assertExternalComparisonAllowed` tant que ce protocole n'est pas satisfait. Le plan ([comparison-plan.json](comparison-plan.json), champ `externalProtocol`) contient seulement le squelette de ce protocole commun, et l'adaptateur `external-paired-pending` échoue fermé avec un message explicite. Le bras de communications réduites fait produire trois réponses indépendantes avant une unique synthèse; l'équipe fixe transmet les réponses successives au worker suivant. Les deux utilisent le même modèle, les mêmes consignes de tâche, aucun outil externe, le même budget global et le même oracle. Le reçu compte les appels modèle/messages et les tokens totaux. Le routeur choisit soit le modèle seul, soit l'équipe fixe selon le profil déclaré de la tâche; c'est un baseline de routage explicite local, pas MaAS ni une politique apprise.

La campagne n'affirme pas que les adaptateurs locaux modèle/équipe exécutent une topologie GenOS. Le bras historique `morphogenesis-historical-frozen` appelle l'orchestrateur GenOS avec l'orchestration autonome explicitement désactivée (`autonomous: false`, comportement figé pour préserver la comparabilité des pilotes passés) ; il ne prouve pas l'orchestration autonome et son inclusion ne prouve pas qu'une transition morphogénétique a été sélectionnée ou exercée ; les preuves de mécanisme du reçu doivent être inspectées séparément. Ce bras historique est exclu de toute preuve confirmatoire : le mode `confirmatory` refuse tant qu'un bras non autonome est présent ou sélectionné. Toute utilisation effective d'outil, différence de modèle servi, budget dépassé ou coût non mesuré marque la tentative comme non vérifiée. Les bras de topologie adaptée figée et de mauvaise topologie sont désormais exécutables via `genos-full` avec topologie figée par tâche et sélection adaptative désactivée ; seule la sélection oracle reste `pending` faute d'issues d'entraînement établies, et le mode `confirmatory` refuse tant que ce bras `oracle-selection` reste `pending`. Les bras GenOS partagent le même plafond de tokens/latence que les autres conditions, avec une calibration d'échelle (`minimumWorkerTokens`, `workerShare`) et un workspace/racine de capsules/base isolés par tentative.

Le pilote peut être lancé avec un sous-ensemble, par exemple `--conditions model-alone,simple-multi-agent,communication-light`. Une campagne `confirmatory` ne consomme jamais ces résultats pilote : elle exige un fichier externe identifié (`datasetId`, `source`, split `holdout`) avec des IDs et familles disjoints de l'inventaire d'entraînement, un modèle tenu à l'écart et des modules d'oracle versionnés/hashés sous `benchmarks/topology-morphogenesis/holdout-oracles/`. Chaque module doit exporter `verify(candidate)` et avoir un `oracleId` qui n'est ni utilisé par le pilote ni par l'entraînement. Sans cet inventaire, une tâche inédite et cet oracle indépendant, le lanceur refuse le mode confirmatoire. Le lanceur refuse aussi le mode `confirmatory` si une tâche jouet pilote est détectée, si le bras `oracle-selection` est `pending`, ou si un bras non autonome (`autonomous: false`, dont `morphogenesis-historical-frozen`) est présent ou sélectionné. Un résultat prêt à analyser ne constitue toujours pas une preuve d'avantage causal, et aucune supériorité causale générale n'est établie à ce stade.

## Campagne de changement de régime à mi-mission

Le protocole `regime-change-plan.json` (figé, 30 tâches holdout + 6 d'entraînement, Qwen `qwen2.5-coder:7b`) teste une réorganisation à mi-mission : travail indépendant puis contrainte révélée exigeant de réorganiser la collaboration. Trois conditions GenOS à budgets/outils/modèle identiques et ordre randomisé : `genos-adaptive` (transition admise), `genos-frozen` (topologie figée par famille, sélectionnée sur l'entraînement) et `genos-wrong` (topologie imposée inadéquate). Lancement :

```powershell
$env:GENOS_COMPARISON_OUTPUT_ROOT='D:\GenOS-campaigns'
$env:GENOS_ADMIN_PASSWORD='mot-de-passe-local-de-test'
node benchmarks/topology-morphogenesis/run-regime-change-campaign.cjs --stage all
```

Le succès exige une transition attestée (diagnostic avant changement, admission, `transitionId`, workers affectés, reçu scellé) puis un taux adaptatif supérieur aux deux contrôles sur tâches appariées, avec intervalle à 95 % entièrement positif et sans dépassement de budget. Une transition vérifiée sans gain prouve le mécanisme, pas son utilité. Une seule répétition par couple tâche-condition : preuve de niveau pilote, pas confirmatoire.

Le holdout de ce protocole sépare les instances, paramètres et identifiants d'oracle, mais partage volontairement les familles avec l'entraînement pour sélectionner une topologie figée par famille. Il ne valide donc pas la généralisation hors famille exigée par le calibrateur. `oracle-selection` reste en attente et aucune campagne modèle n'est revendiquée tant que les artefacts d'un run complet ne sont pas disponibles.

Le protocole actuel reste pilote (`evidenceGrade: pilot`, non confirmatoire) : une seule répétition par couple tâche-condition, familles communes entre entraînement et test, contrainte de phase 2 déjà contenue dans le prompt (pas d'injection temporelle externe). Le garde exécutable `regime-change-qualification.cjs` compare les valeurs réelles (seeds, familles, `revealSpec`) à la barre déclarée (`requiredRepetitions: 3`, `familyDisjointness: required`, `revealMechanism: external-temporal-injection`) et refuse le label `confirmatory` tant qu'elle n'est pas atteinte ; le lanceur (`run-regime-change-campaign.cjs --claim confirmatory`) et l'analyse exigent cette qualification. La voie confirmatoire suppose un plan-v2 avec 3 répétitions par couple tâche-condition, des familles train/test disjointes et une injection temporelle externe, sans générer de fausses tâches.

L'adaptateur comparatif reconnaît désormais seulement un `transitionId` porté
par un reçu morphogénétique scellé valide et distingue la résolution vérifiée
du même identifiant. Le [producteur d'issues appariées](../../docs/adr/0566-lier-les-issues-appariees-aux-transitions.md)
peut dériver et stocker gain et surcoût lorsque les deux tentatives, la
prédiction antérieure et la paire portent des reçus d'oracle indépendants.
Le harnais actuel n'émet pas ces reçus ; ses rapports ne sont pas importés
automatiquement dans la calibration.

`run-comparison-plan.cjs` conserve son rôle limité de générateur d'affectations (`assignment-only`); il n'exécute pas les modèles.

Cette campagne fait progresser la preuve du contrat jusqu'à l'exécution observable. Un dispatch accepté ou une mission terminée ne suffit pas à qualifier une topologie d'opérationnelle. Il faut des opérations spécifiques observables, des livrables vérifiés par un oracle de résultat indépendant, des répétitions et des contrôles négatifs réussis. Les sondes de composants et les tests d'intégration (câblage, existence d'un outil, acceptation du dispatch) restent des preuves de composant : ils n'établissent ni le mécanisme en exécution ni la mission de bout en bout.

## Lancement d'une mission

Pour exécuter les douze cas dans l'ordre et conserver leurs journaux et états de workers :

```powershell
node benchmarks/topology-morphogenesis/run-campaign.cjs
node benchmarks/topology-morphogenesis/session-probes.cjs artifacts/topology-morphogenesis/<dossier-du-run>
```

Le premier programme affiche le dossier créé. Il utilise une base SQLite et un espace de travail témoin isolés, sélectionne `qwen2.5:14b` si aucun modèle local n'est configuré, et attend la fin des workers biologiques par paires afin d'observer leurs états sans saturer les copies de capsules. Le second exerce les sessions persistées Biome, Syncytium et Rhizome et écrit `session-probes.json`. `campaign-results.json` conserve les contrôles par mission et leur synthèse : les topologies échouent si un worker manque ou n'atteint pas `completed`, l'orchestrateur simple doit passer son garde et sa preuve arithmétique indépendante, et les probes de session doivent toutes être vérifiées. Toute fin de mission sans oracle indépendant vérifié est classée `inconclusive` ou `unverified`, jamais `verified`, et bloque toute qualification confirmatoire (`unverified-mission-marked-verified` dans [campaignQualification.cjs](campaignQualification.cjs)). Le lanceur retourne un code non nul dès qu'un contrôle échoue. La qualification reste `experimental` tant que les critères de passage et les répétitions sur un même commit ne sont pas réunis. Les journaux bruts restent dans le dossier du run; un `exitCode` nul pour un dispatch indique seulement que la requête a été traitée.

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
