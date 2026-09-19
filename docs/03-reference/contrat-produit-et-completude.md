# Contrat produit et définition de « terminé »

- **Statut du document** : référence de périmètre
- **Revue** : 2026-09-19
- **Source d'inventaire** : dépôt courant ; les statuts ci-dessous évaluent la preuve disponible, pas l'ambition des noms de services.

Ce document est le registre produit de GenOS. Une capacité n'est annoncée comme
implémentée que si son interface est appelable, son comportement déterministe est
couvert et une preuve vérifiable est citée. Les noms de capacités dans
`topologyCapabilityService.js` sont des exigences déclaratives, pas une preuve que
chaque capacité existe de bout en bout.

## 1. Statuts et preuve de complétude

| Statut | Sens dans ce contrat |
| --- | --- |
| **implémenté** | Interface disponible, comportement borné spécifié, preuves automatisées adaptées présentes. |
| **partiel** | Une tranche fonctionne, mais des chemins, intégrations ou critères annoncés manquent. |
| **expérimental** | Démonstrateur ou algorithme exécutable ; stabilité, compatibilité ou validation produit insuffisante. |
| **prévu** | Intention ou contrat seulement ; aucune preuve d'exécution suffisante. |
| **hors périmètre** | Le nom ou la métaphore ne désigne pas un comportement produit que GenOS promet. |

Une preuve doit être rejouable et liée à l'interface concernée :

1. **Unitaire** : valide règles isolées, entrées invalides et limites.
2. **Intégration** : valide dispatch, persistance, autorisations et dépendances réelles.
3. **Bout en bout (E2E)** : valide un parcours utilisateur complet et son résultat observable.
4. **Benchmark** : valide une mesure quantitative avec protocole, jeu de données, seuil et environnement publiés ; un benchmark ne remplace pas les tests de correction.
5. **Manuelle** : réservée à l'ergonomie ou à un environnement externe non simulable ; consigner version, étapes, résultat et artefact. Elle ne prouve pas seule une propriété de sûreté.

Pour une capacité « terminée », les critères d'acceptation doivent couvrir le cas
nominal, les erreurs, les limites de ressources et les autorisations. Toute sortie
de modèle doit être évaluée selon un protocole et non déclarée vraie parce que le
transport a réussi. Un statut implémenté ne généralise pas au-delà de la portée
bornée spécifiée.

## 2. Modes d'orchestration et organisations

Interface commune : `biologicalTopologyService.composeMode({db, orchestratorId,
mode, mission})`, puis coordination spécifique. Dépendances communes : backend,
orchestrateur, contrats de capacités, base/configuration lorsque requise. Critère
commun : composition et exécution renvoient membres/état cohérents, échouent de
façon explicite si une capacité requise manque, et la preuve traverse le chemin
nominal et le refus. Les services et barrières indiqués sont les points de preuve
à compléter ou à rejouer ; le tableau n'affirme pas que toutes ces preuves ont été
exécutées pour cette revue.

| Élément | Statut | Interface publique | Acceptation spécifique | Dépendances | Preuve de fonctionnement |
| --- | --- | --- | --- | --- | --- |
| Trinity | partiel | `composeMode(mode: trinity)` ; `merge_trinity` | comparer dossiers non vides, refuser égalité/absence de preuve, fusion protégée | dossiers, télémétrie, barrière comparative | `trinityService`, `trinityComparativeBarrier`; test d'intégration compose→merge à publier |
| A-Team | partiel | `composeMode(mode: a_team)` | répartir domaines, tracer handoffs et arbitrage, remonter domaines manquants | coordination A-Team, capacités, workers | `aTeamCoordinationService`; scénario E2E multidomaine à publier |
| Biome | expérimental | `composeMode(mode: biome)` | allocation bornée et observation reproductible, sans prétendre à une écologie réelle | foraging, métriques, budget | `biomeCoordinationService`, `foragingScoutHarvesterService`; tests de service, scénario E2E à publier |
| Biocénose | partiel | `composeMode(mode: biocenose)` | quorum/consensus traçable, abstention et données contradictoires visibles | arène, Brier, quorum, preuves | `biocenoseService`, `arenaTaskEvaluation`; intégration consensus à publier |
| Holobionte | expérimental | `composeMode(mode: holobionte)` | hôte garde autorité, inférence locale et veto testables ; aucun droit implicite | runtime symbiote local, immunité, mémoire | `holobionteCoordinationService`, `symbioteRuntimeService`; tests de veto à publier |
| Syncytium | partiel | `composeMode(mode: syncytium)` | convergence CRDT et rejet d'invariant démontrés sous concurrence | session CRDT, cytoplasme, sandbox | `syncytiumCoordinationService`, `syncytiumCrdtService`; intégration multi-écriture à publier |
| Rhizome | expérimental | `composeMode(mode: rhizome)` | routage limité aux membres fournis ; aucune création automatique de graphe/branches | membres, bus, signaux | `rhizomeCoordinationService`; tests route/cas sans membre ; E2E à publier |
| Métapopulation | expérimental | `composeMode(mode: metapopulation)` | quorum et régénération bornés, lignage/mémoire traçables | quorum, plasticité, récupération | `metapopulationCoordinationService`; test d'intégration régénération à publier |

Les **19 organisations dynamiques** sont proposées par `dynamicOrganizationService`
(`changeOrganization`, `runStep`). Le statut partiel est commun à ce registre :
l'existence d'une entrée et de capacités requises ne démontre pas son usage effectif
par l'orchestrateur. Pour chaque entrée, l'acceptation est un `runStep` déterministe
sur fixture, avec validation de ses sorties, budgets, cas limites et dispatch par le
plan. Dépendances : `dynamicOrganizationService`, capacités déclarées et orchestration.

| Organisation | Statut | Preuve/implémentation de référence |
| --- | --- | --- |
| `specialist_expert_committee` | partiel | `dynamicOrganizationService`; test `runStep`/dispatch à référencer |
| `blind_adversarial_review` | partiel | `dynamicOrganizationService`; test `runStep`/dispatch à référencer |
| `red_blue_coevolution` | expérimental | `dynamicOrganizationService`; scénario adversarial isolé à référencer |
| `brier_weighted_consensus` | partiel | `dynamicOrganizationService`; test de pondération/calibration à référencer |
| `quorum_with_abstention` | partiel | `dynamicOrganizationService`; tests quorum/abstention à référencer |
| `stigmergy` | partiel | `dynamicOrganizationService`; test de trace et expiration à référencer |
| `flocking_boids` | expérimental | `swarmTopologyAlgorithms.js`; tests d'algorithme, pas preuve de bénéfice produit |
| `fish_school_search` | expérimental | `swarmTopologyAlgorithms.js`; tests d'algorithme, pas preuve de bénéfice produit |
| `slime_mould_network` | expérimental | `swarmTopologyAlgorithms.js`; tests d'algorithme, pas preuve de bénéfice produit |
| `grey_wolf_optimizer` | expérimental | `swarmTopologyAlgorithms.js`; tests d'algorithme, pas preuve de bénéfice produit |
| `mycelial_routing` | partiel | `dynamicOrganizationService`; routage/absence de candidat à couvrir |
| `dynamic_polyethism` | partiel | `dynamicOrganizationService`; adaptation de rôle bornée à couvrir |
| `energy_huddle` | partiel | `dynamicOrganizationService`; allocation et budget épuisé à couvrir |
| `network_silence` | partiel | `dynamicOrganizationService`; snapshot/isolation à couvrir |
| `strategy_arena` | partiel | `dynamicOrganizationService`; sélection et refus sans preuve à couvrir |
| `hierarchical_merge` | partiel | `dynamicOrganizationService`; provenance et barrière de fusion à couvrir |
| `competitive_arena` | partiel | `dynamicOrganizationService`; comparaison reproductible à couvrir |
| `isolated_recovery` | partiel | `dynamicOrganizationService`; récupération isolée et arrêt sûr à couvrir |
| `memory_compilation` | partiel | `dynamicOrganizationService`; provenance et lecture/écriture mémoire à couvrir |

## 3. Capacités transverses

Interface générique : contrat machine lisible `topologyCapabilityService` et
application de lease `toolLeasePolicy`; une capacité n'est publiquement appelable
que si elle possède aussi l'API, l'outil MCP ou le point d'entrée documenté. Critère
commun : exigence déclarée → dispatch réel → résultat/erreur testés → preuve
persistée ou inspectable. Dépendances indiquées ci-dessous ; les références aux
services orientent l'audit. « Test de service/intégration dédié à référencer »
signale que le contrat global ne trouve pas encore une preuve publique assez
précise : ce manque interdit le statut implémenté.

| Capacité | Statut | Interface/point d'entrée | Acceptation et dépendances | Preuve |
| --- | --- | --- | --- | --- |
| `STRATEGY_PORTFOLIO` | partiel | plan d'autonomie / registre stratégie | stratégie sélectionnée parmi options valides ; dépend du plan et de l'évaluateur | tests stratégie à référencer |
| `STRATEGY_ADAPTATION` | expérimental | `dynamicOrganizationService`, `runStep` | adaptation bornée et reproductible ; dépend des signaux et du budget | test algorithme à référencer |
| `ARENA_COMPETITION` | partiel | `arenaTaskEvaluation` | classement depuis critères et preuves, égalité explicite ; dépend des résultats workers | suite qualité/intégration à référencer |
| `PROMOTION_GATE` | partiel | barrières de promotion/fusion | aucun candidat sans preuve valide n'est promu ; dépend tests, provenance et gouvernance | `docs/03-reference/preuves-produit-et-safe-debugging.md` et tests associés |
| `TOKEN_ECONOMY` | partiel | `tokenAllocationService` | budgets initiaux/continuation bornés et épuisement géré ; dépend configuration modèles | tests token/budget; benchmark n'est pas critère de correction |
| `EVIDENCE_BARRIER` | partiel | `agentFleetService`, barrières topology | preuve manquante/échouée bloque promotion ; dépend tests et télémétrie | safe-debugging proof et tests de barrières |
| `EPISTEMICS_BRIER` | expérimental | organisations Brier/évaluation | score calculé sur labels connus, calibration définie ; dépend observations étiquetées | test de score + benchmark de calibration à publier |
| `HALLUCINATION_MONITORING` | expérimental | monitor de sortie/évaluateur | détection évaluée sur corpus/version précisés ; dépend références externes | benchmark publié requis, sinon ne pas revendiquer de détection générale |
| `OUTPUT_GOVERNOR` | partiel | `chaperoneAgentOutput` et garde sortie | sortie invalide/refusée sans contournement ; dépend schémas et règles | tests d'intégration de validation à référencer |
| `PROVENANCE` | partiel | dossiers d'évidence/télémétrie | chaque preuve reliée à mission, branche et source ; dépend store | tests persistance à référencer |
| `GRAPH_MEMORY` | partiel | services mémoire/graph | écriture, lecture et isolation de tenant vérifiées ; dépend DB | tests mémoire à référencer |
| `VECTOR_MEMORY` | expérimental | service vectoriel | indexation/recherche mesurées et filtrées ; dépend moteur vectoriel | intégration + benchmark retrieval à publier |
| `EPISODIC_MEMORY` | partiel | service mémoire épisodique | rappel lié à session/provenance ; dépend store/migrations | test multi-session à référencer |
| `SYNAPTIC_PLASTICITY` | expérimental | service plasticité | mise à jour bornée et résultat reproductible ; dépend observations | tests d'algorithme à référencer |
| `SIGNALING_BUS` | partiel | `genos_worker_publish` / inbox | publication/réception authentifiées, ordre et échec définis ; dépend lease MCP et store | `docs/03-reference/outils-mcp.md`, tests MCP |
| `LIGAND_RECEPTOR` | expérimental | handoff A-Team / signal typé | signal apparié au destinataire et refus invalide ; dépend bus | tests coordination à référencer |
| `STIGMERGY` | expérimental | service stigmergique | traces bornées, expiration et lecture de population ; dépend store | tests service à référencer |
| `SWARM_METRICS` | expérimental | `swarmMetricsService` | métriques définies et calculées depuis population observée ; dépend télémétrie | test calcul + benchmark protocole à publier |
| `QUORUM` | partiel | services de consensus/quorum | seuil, poids et abstention explicites ; dépend votes et provenance | tests consensus à référencer |
| `GENOME_EPIGENETICS` | partiel | AgentDNA/runtime et manifestes | compilation/chargement/version validés ; dépend CLI et schémas | tests Rust/CLI à référencer |
| `EVOLUTION_REPRODUCTION` | expérimental | services reproduction/replication | descendants isolés, parent et limites conservés ; dépend snapshot/workspace | E2E reproduction à référencer |
| `IMMUNE_SYSTEM` | partiel | garde de sortie/veto hôte, outils sécurité | règle de refus traçable et non contournable ; dépend gouvernance et leases | tests sécurité/MCP à référencer |
| `CONSCIENCE_HOMEOSTASIS` | hors périmètre | aucune interface produit de conscience | la mesure d'état ou stabilité ne constitue pas conscience ; dépendance non applicable | concept documentaire seulement |
| `RESILIENCE_RECOVERY` | partiel | `workerFailureRecoveryService` | échec classé, reprise bornée, boucle interrompue ; dépend orchestration/snapshots | suite recovery à référencer |
| `CHAOS_ENGINEERING` | expérimental | outils/scénarios de chaos | injections contrôlées et résultats reproductibles ; dépend isolation et recovery | benchmark chaos existant, protocole/critères produit à publier |
| `CRDT_SHARED_STATE` | expérimental | `syncytiumCrdtService` | convergence et conflit démontrés ; dépend session et persistance | tests de convergence/concurrence à référencer |
| `VFS_SANDBOX` | partiel | workspace/outils de fichier MCP | confinement de chemin, refus hors scope ; dépend workspace et policy | tests sécurité + MCP |
| `CAPSULES_SNAPSHOTS` | partiel | `genos_snapshot`, replay | snapshot/restauration cohérents et permissions contrôlées ; dépend store/workspace | tests MCP/replay à référencer |
| `MODEL_ROUTING` | partiel | `inferenceGatewayService` / providers | routage vers provider configuré, erreurs et fallback définis ; dépend secrets/provider | suite providers |
| `LOCAL_INFERENCE` | expérimental | `symbioteRuntimeService.engineFor` / moteur local | exécution sans provider distant démontrée sur plateformes listées ; dépend moteur et ressources | intégration runtime local à publier |
| `INFERENCE_GATEWAY` | partiel | gateway inference backend | équité/limites/annulation testées ; dépend queue et providers | tests concurrence/providers |
| `OBSERVABILITY` | partiel | télémétrie, health endpoints | événements corrélés, rétention et endpoints vérifiés ; dépend backend/store | tests API/health à référencer |
| `GOVERNANCE_APPROVAL` | partiel | scopes API et flux d'approbation | opération protégée refuse sans autorisation ; dépend auth/tenancy | tests validation/tenancy |
| `COMPLIANCE` | prévu | aucun contrat de conformité complet | exigences, juridictions et audit à définir avant annonce ; dépend politique externe | aucune preuve ; retrait du contrat commercial |
| `WEB_FORAGING` | expérimental | outils `genos_browser_act`, `genos_optimal_foraging` | handlers testés séparément ; parcours observation-action complet nécessaire ; dépend navigateur/MCP | tests scout/foraging; E2E à publier |
| `FOVEAL_PERCEPTION` | expérimental | `genos_foveal_crop` | crop conforme et utile sur corpus défini ; dépend image/browser | tests foveal; benchmark qualité à publier |
| `COMPUTER_USE` | expérimental | contrôleur bureau | plan, observation, action, reprise et consentement vérifiés sur environnement défini ; dépend UI runtime | E2E manuel versionné requis |

## 4. MCP, services philosophiques et connecteurs

| Famille | Statut | Interface publique | Critère d'acceptation | Dépendances | Preuve |
| --- | --- | --- | --- | --- | --- |
| MCP JS stdio | implémenté | `mcp/index.js`, protocole stdio | liste conforme au lease ; appel direct revalidé ; arguments sûrs | Node, backend/CLI, catalogue | `backend/tests/test_mcp_direct_call_enforcement.js`, `test_mcp_server_parity.js` |
| MCP Rust | partiel | `crates/genos-mcp`, serveur/outils Rust | même contrat de noms/schémas et refus que JS ; parité complète à atteindre | Rust, catalogue | `test_mcp_server_parity.js` couvre la parité minimale seulement |
| MCP backend dispatch | implémenté | `mcpExecutor`, registre/dispatcher | lease, validation, breaker et transport appliqués à chaque appel | backend, configuration | `test_mcp_direct_call_enforcement.js`, suites MCP |
| Outils MCP individuels | partiel | catalogue JS/Rust et `shared/toolDefinitions.json` | chaque outil doit avoir schéma, lease, handler et test nominal/refus ; statut outil par outil non attesté par le seul catalogue | handlers correspondants | `docs/03-reference/outils-mcp.md`; preuve à fournir par outil |
| Services philosophiques analytiques | partiel | routeur/services et registre `SERVICE_MATURITY` | calcul borné conforme aux entrées, aucun verdict factuel ou droit runtime implicite | registre concepts, données déclarées | tests du service correspondant ; statut détaillé ci-dessous |
| Ontologie runtime | partiel | services `ontology*`, relations persistées | opérations/relations validées et persistées, sans inférence d'autorité | DB/schema et routeur | `test_philosophy_registry_health.js` plus tests services ontologie |
| Connecteur IDE | expérimental | `integrations/ide/genos-extension-contract.json` | installation et parcours IDE réels, compatibilités/version déclarées | client IDE et backend | contrat seul insuffisant ; validation manuelle IDE à publier |
| Connecteurs externes supplémentaires | hors périmètre | aucun catalogue/contrat vérifié dans `integrations/` | ajouter seulement avec adaptateur, auth, versions, tests d'intégration | système tiers nommé | aucune preuve connue dans le dépôt |

Maturité des services philosophiques selon
`backend/src/philosophy/serviceMaturity.js`. Interface : routeur/service
philosophique correspondant ; dépendances : définitions de concepts et données
déclarées. Pour tous, l'acceptation est une réponse bornée et déterministe sur
entrées déclarées, tests de cas invalide, et absence d'effet sur permission,
promotion ou vérité factuelle. La preuve annoncée par le registre est `tests` ;
les tests nommés doivent être liés à chaque service avant toute promotion au statut
implémenté dans ce contrat.

| Services | Statut produit | Preuve/limite |
| --- | --- | --- |
| `propositionalLogicService`, `metalogicService`, `paradoxAnalysisService`, `ontologyCore`, `ontologyAttributes`, `ontologyModes`, `aestheticsService`, `artTheoryService`, `interpretationService`, `playNarrativeService`, `cinemaMusicService`, `visualCultureService` | partiel | adaptateur déclaré implémenté/testé dans le registre ; couverture publique par service à relier. « Implémenté » ne signifie pas théorie entière. |
| `modalLogicService`, `deonticDynamicLogicService`, `nonClassicalLogicService`, `knowledgeService`, `rationalityNormsService`, `inferenceService`, `probabilityService`, `scientificMethodService`, `truthSkepticismService`, `socialEpistemologyService`, `epistemologyService`, `cartesianService`, `reliabilityService`, `ontologyIdentity`, `personOtherService`, `continuityService`, `possibleWorldService`, `speculativeRealismService`, `metaphysicsService`, `consciousnessService`, `propertyService`, `phenomenologyService`, `causalityService`, `identityService` | partiel | tranche exécutable déclarée ; hypothèses/observations fournies, résultats interprétatifs et révisables. |
| `mindModelsService`, `consciousnessMetricsService` | hors périmètre | conceptuel/non exécutable ; les métriques ne prouvent pas d'expérience subjective. |
| `cognitionService` | prévu | pas d'adaptateur exécutable déclaré. |

Le vocabulaire de conscience, esprit, âme, instinct, immunité, génome ou biologie
reste une analogie ou une organisation du code tant qu'un comportement technique
borné n'est pas spécifié. Sont **hors périmètre produit** : conscience subjective,
volonté, compréhension garantie, vérité produite par un score philosophique,
biologie simulée au sens scientifique, immunité absolue et conformité universelle.

## 5. Plateformes et environnements de la version complète

Périmètre cible de la version « complète » de ce dépôt, fondé sur les scripts et
artefacts présents :

| Environnement | Cible de support | Critère d'acceptation |
| --- | --- | --- |
| Linux x86_64, Docker | image backend `node:22-bookworm-slim` épinglée ; SQLite sur volume local ; REST et gRPC | build propre, migration, health/readiness, scénario API+gRPC, redémarrage avec persistance |
| Windows x86_64, hôte natif | Windows 10/11 64 bits ; PowerShell ; installateur/CLI si fournis | installation propre, démarrage backend/CLI, chemins/sandbox, migrations et désinstallation vérifiés |
| macOS | **hors cible de support complète** dans ce contrat | support à ajouter après CI/build Rust+Node, installation et parcours E2E natifs |
| Node.js | 22.12+ (aligné sur le prérequis dépôt) ; Node 20.19+ seulement si pipeline dédié le maintient | dépendances natives installées et suites backend/MCP ciblées réussies sur chaque version annoncée |
| Rust | stable 1.88+ | `cargo build/test --workspace` sur Linux et Windows x86_64 ; préciser la cible distribuée |
| SQLite | version du lockfile/dépendance backend, WAL ; fichier sur stockage local fiable, instance propriétaire unique | migrations depuis DB vide et version supportée précédente ; persistance/recovery validés |
| IDE, navigateur, modèle distant/local | non universels : versions des clients, moteurs et fournisseurs doivent être listées par intégration avant statut implémenté | test d'intégration versionné ; pas de promesse de compatibilité implicite |

La version complète ne promet pas de haute disponibilité multi-nœuds : le backend
documenté utilise SQLite et une instance propriétaire de la base. macOS, clusters
distribués, conformité générale, connecteurs tiers non inventoriés et modes
expérimentaux ne font pas partie du contrat complet tant qu'un ADR, une cible CI et
des preuves dédiées ne les ajoutent pas.

## 6. Définition de la version complète

Une version GenOS est **complète** lorsque chaque élément inclus au périmètre est
marqué implémenté, dispose d'une interface et de critères acceptés, a des preuves
rejouables (unitaire + intégration, et E2E pour un parcours utilisateur), passe les
cibles Linux/Docker et Windows ci-dessus, et que ses dépendances/versions sont
publiées. Les éléments partiels, expérimentaux, prévus et hors périmètre restent
visibles dans le registre et ne peuvent être présentés comme livrés. Les preuves
E2E, benchmarks et validations manuelles doivent conserver commande/protocole,
version et résultat ; les références « à publier/référencer » ci-dessus sont des
écarts de preuve ouverts, pas des réussites présumées.

## Références

- [Topologies et capacités](../02-orchestration/topologies-et-capacites.md)
- [Outils MCP](outils-mcp.md)
- [Preuves produit et safe debugging](preuves-produit-et-safe-debugging.md)
- [Registre philosophique](registre-philosophique.md)
- [Déploiement](../04-exploitation/deploiement.md)
