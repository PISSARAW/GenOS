# Audit de complétude des concepts canoniques — sections 8 à 15

**Périmètre.** 205 entrées de l'inventaire transmis : 24 + 15 + 45 + 9 + 19 + 37 + 33 + 23. Les composantes citées dans la description d'une topologie sont évaluées avec cette topologie. L'inventaire canonique du dépôt confirme ces domaines, mais prévient qu'un nom catalogué ne constitue pas une promesse d'exécution ([`canonicalConceptInventory.js`](../../backend/src/services/ontogenesis/canonicalConceptInventory.js#L3-L20)). La matrice de capacités est explicitement déclarative ([`topologyCapabilityService.js`](../../backend/src/services/topologyCapabilityService.js#L3-L9)). Les références de concepts `worker_runtime` et `worker_lifecycle` y sont même signalées `executable: false` ([`canonicalConceptRegistry.js`](../../backend/src/services/ontogenesis/canonicalConceptRegistry.js#L102-L117)).

**Lecture des verdicts.** Colonnes `I / V / Dé / U / Do` : implémenté, vérifié, démontré, utilisable, documenté. `O` = oui sur le périmètre borné indiqué ; `P` = partiel ; `N` = non, absence ou impossibilité observée ; `?` = preuve insuffisante pour trancher. « Vérifié » exige un contrôle exécuté avec résultat, et « démontré » un scénario rejouable dont le résultat est observable, distinct d'un test unitaire. Une documentation ancienne ou un fichier de test non exécuté à ce checkout ne donne au plus que `P`. **Complet** exigerait cinq `O` pour la même portée.

**Contrôles exécutés pendant cet audit (12 octobre 2026).** `node backend/tests/test_organization_algorithms.js` : PASS ; `node backend/tests/search/test_search_pressure.js` : PASS ; `node backend/tests/search/test_natural_search_runtime_e2e.js` : PASS (sélection, pression 0,766, reçu `GENOME_MUTATED`). `node backend/tests/test_nce_workflows_e2e.js` a d'abord échoué dans le sandbox après « Culture to phenotype persistence with SQLite: PASS » à l'assertion ligne 111 (`error` au lieu de `success`), puis a **PASS** hors sandbox avec Node 22.23.3 : Play sur snapshot réel, POET avec vérification et refus de télémétrie terminale périmée. L'échec initial est conservé comme observation d'environnement, sans le présenter comme défaut produit. `node backend/tests/test_worker_native_matrix.js` : 14 types PASS, puis `EPERM realpath` du répertoire temporaire sandbox au `recovery_worker` ; ce résultat ne réfute pas le worker. `npm test` hors sandbox sous Node 24 a ensuite échoué à `medical_worker` (`ORACLE_BUDGET_EXPIRED`) ; le test natif ciblé sous Node 22.23.3 a échoué à `verifier_worker` avec le même code. La [qualification historique des workers](qualification-workers.md#campagne-exploratoire-du-2026-10-11) rapporte 19/19 missions C2/C3 sur tâches bornées et 23/24 cas mesurés, mais ses rapports sont hors dépôt et son checkout était modifié ; la qualification complète n'est pas reproduite sur ce checkout.

**Références abrégées.** `R` : [NCE](../../backend/src/services/topologyNCEService.js#L89-L109), [Natural Search](../../backend/src/services/search/naturalSearchRuntime.js#L138-L145), [Active Query](../../backend/tests/test_agow_active_query.js), [méristème](../../backend/src/services/morphogenesis/capabilities/epistemicMeristem.js), [spirale](../../backend/src/services/morphogenesis/capabilities/spiralRuntime.js), [chronotaxie](../../backend/src/services/morphogenesis/capabilities/chronotaxis.js), [documentation NCE](../01-concepts/natural-creative-ecology.md), [recherche](../01-concepts/natural-search-control-plane.md). `P` : [physique Rust](../../crates/genos-orchestrator/src/physics.rs#L96-L191), [tests Rust](../../crates/genos-orchestrator/src/physics_tests.rs), [ressources hôte](../../backend/src/services/hostEnvironment.js#L157-L183), [guide](../01-concepts/physique-computationnelle.md). `O` : [produit et limites](../03-reference/contrat-produit-et-completude.md#2-modes-dorchestration-et-organisations), [jobs](../../backend/src/services/jobWorkerOrchestrator.js), [stratégies](../../backend/src/services/strategyExecutionService.js), [WAL](../../crates/genos-store/src/continuation_wal.rs), [AgentGit](../../backend/src/services/agentGitService/index.js), [releases](../04-exploitation/releases-et-rollouts.md). `T` : [contrats topologiques](../../backend/src/services/topologyCapabilityService.js#L26-L72), [état produit des huit modes](../03-reference/contrat-produit-et-completude.md#2-modes-dorchestration-et-organisations). `G` : [algorithmes](../../backend/src/services/organizationAlgorithms.js#L162-L178), [service d'organisation](../../backend/src/services/dynamicOrganizationService.js#L21-L42), [tests exécutés](../../backend/tests/test_organization_algorithms.js), [limitations produit](../03-reference/contrat-produit-et-completude.md#2-modes-dorchestration-et-organisations). `C` : [registre des capacités](../../backend/src/services/topologyCapabilityService.js#L12-L72), [évaluation des capacités](../03-reference/contrat-produit-et-completude.md#3-capacités-transverses). `W` : [19 types et familles](../../backend/src/services/agents/workerKindService.js#L3-L38), [registre natif](../../backend/src/services/agents/workerExecutorRegistry.js), [qualification](qualification-workers.md). `L` : [cycle Rust](../../crates/genos-worker/src/cycle.rs#L1-L158), [références de cycle](../../backend/src/services/ontogenesis/canonicalConceptAliases.js#L283-L295), [cycle natif](../../backend/src/services/agents/workerNativeLifecycle.js).

## 8. Imagination, créativité et recherche — 24 entrées

| Concept | I | V | Dé | U | Do | Preuve et manque décisif |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Natural Creative Ecology | P | O | P | P | O | R : Play/POET E2E passent hors sandbox sous Node 22 ; portée et bénéfice scientifique généraux non démontrés. |
| Créativité émergente | P | ? | N | P | P | R : mécanismes de génération ; émergence mesurée et falsifiée absente. |
| Nouveauté | P | ? | N | P | P | R : candidats et métriques ; oracle de nouveauté indépendant manquant. |
| Affordance | P | ? | N | P | P | R : mémoire d'affordance ; effet utilisateur non démontré. |
| Exploration | P | P | P | P | O | R : chemins NCE et Natural Search ; preuve transverse incomplète. |
| Recombinaison | P | P | P | P | O | R : assemblage de candidats dans les scénarios NCE bornés ; qualité générale non démontrée. |
| Fragment | P | ? | N | P | P | R : unité conceptuelle ; cycle autonome du fragment non montré. |
| Divergence | P | ? | N | P | P | R : variantes ; diversité utile non validée. |
| Candidat créatif | O | P | P | O | O | R, W : artefact typé `creative_candidate` ; originalité générale non établie. |
| Falsification créative | P | ? | N | P | P | R : test de falsification exigé par contrat ; oracle indépendant manquant. |
| Recherche naturelle | O | O | O | P | O | R : E2E exécuté avec reçu `GENOME_MUTATED` ; exposition et généralisation à d'autres tâches à qualifier. |
| Pression de recherche | O | O | P | P | O | R : test de pression PASS ; mesure de gain causal en mission ouverte absente. |
| Progrès causal | P | P | P | P | O | R : suivi causal ; borne de vérité externe à qualifier. |
| Active Query | P | P | N | P | O | R : test dédié trouvé, pas rejoué ; résultat mission non constaté. |
| Simulation prospective | P | ? | N | P | P | R : composant de recherche ; fidélité prédictive non vérifiée. |
| Recherche adaptative | P | P | P | P | O | R : sélection de processus démontrée pour fixture E2E, pas toutes adaptations. |
| Arène de stratégies | P | P | N | P | O | R, G : sélection/compétition ; promotion comparative non démontrée. |
| Méristème épistémique | P | ? | N | P | O | R, [guide](../02-orchestration/meristeme-epistemique.md) : pont d'expérience ; campagne discriminante absente. |
| Expérience discriminante | P | ? | N | P | O | R : modèle d'expérience ; couverture indépendante non constatée. |
| Spirale de déblocage | P | P | N | P | O | R, [guide](../02-orchestration/spirale-de-deblocage.md) : runtime/test disponible ; résultat de déblocage rejouable absent. |
| Chronotaxie apériodique | P | ? | N | P | O | R, [guide](../02-orchestration/chronotaxie-aperiodique.md) : politique de calendrier ; couverture en exécution non rejouée. |
| Observation déphasée | P | ? | N | P | O | R : calcul de phase ; observation effective non démontrée. |
| Couverture temporelle | P | ? | N | P | O | R : agrégation de fenêtres ; preuve longitudinale absente. |
| Conservation des contre-exemples | P | P | P | P | O | R : mémoire négative ; preuve de réutilisation en campagne plus large absente. |

## 9. Physique computationnelle — 15 entrées

| Concept | I | V | Dé | U | Do | Preuve et manque décisif |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Inertie | O | P | P | P | O | P : état/seuil Rust ; exemple `mission_physics`, non exécuté ici. |
| Friction | O | P | P | P | O | P : terme de score Rust ; mesure en mission réelle absente. |
| Entropie | O | P | P | P | O | P : état Rust ; calibration opérationnelle absente. |
| Seuil | O | P | P | P | O | P : régimes et décision ; qualification des seuils absente. |
| Pression | O | P | P | P | O | P : paramètres Rust ; effet hôte à relier. |
| Matériau computationnel | O | P | P | P | O | P : `Material`, classification ; exemple `mission_material` non rejoué. |
| Résistance | O | P | P | P | O | P : changement selon matériau ; étalonnage empirique absent. |
| Coût | O | P | P | P | O | P : fonction d'utilité ; charge réelle non mesurée ici. |
| Énergie | O | P | P | P | O | P : état/score ; unité physique et relevé réel à préciser. |
| Dégradation | P | ? | N | P | O | P : variable de modèle ; dégradation durable non démontrée. |
| Blast radius | P | P | P | P | O | [VFS](../../backend/src/services/vfsSandboxService.js), [guide](../02-orchestration/workspaces-contrefactuel.md) : score d'impact ; couverture des effets externes inconnue. |
| Gating décisionnel | P | P | P | P | O | P : seuil de décision ; liaison à toutes actions non prouvée. |
| Contraintes physiques de calcul | P | P | N | P | O | P : modèles/coûts ; borne effective sur tout le runtime absente. |
| Ressources de l’environnement hôte | P | P | P | P | O | P : `hostEnvironment` échantillonne ; cas d'intégration limités. |
| Régulation CPU, disque et mémoire | P | P | N | P | O | P : CPU/mémoire/disque répartis entre services ; régulation unifiée démontrée absente. |

## 10. Orchestration et exécution — 45 entrées

| Concept | I | V | Dé | U | Do | Preuve et manque décisif |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Orchestrateur | O | P | P | O | O | O : CLI/API et coordination ; preuve de toutes topologies non acquise. |
| Mission | O | P | P | O | O | O : contrat et persistance ; succès dépend de l'oracle de la mission. |
| Tâche | O | P | P | O | O | O : unité de plan ; couverture métier non générale. |
| Run | O | P | P | O | O | O : exécution suivie ; répétabilité interenvironnements à mesurer. |
| Workflow | O | P | P | O | O | O : workflow/jobs ; certains chemins multiétapes non qualifiés. |
| Job | O | P | P | O | O | O : `jobWorkerOrchestrator` ; reprise sous faute à étendre. |
| Graphe d’états | O | P | P | P | O | O : états persistés ; invariants E2E globaux non démontrés. |
| Transition | O | P | P | P | O | O : transitions bornées ; tous refus non rejoués. |
| Worker | O | P | P | O | O | W : 19 types qualifiés historiquement, validation actuelle partielle. |
| Sous-orchestrateur | O | P | P | O | O | W : `coordinate_children` démontré historiquement avec deux enfants. |
| Fan-out | O | P | P | O | O | O : délégation ; budget/agrégation sur tous modes non qualifiés. |
| Survivant | P | ? | N | P | P | O : sélection de candidat ; critère universel de survie non établi. |
| Préféré | P | ? | N | P | P | O : préférence de plan ; résultat causal non démontré. |
| Branches d’exécution | O | P | P | O | O | O : forks/workspaces ; isolation et fusion selon mode à qualifier. |
| Stratégie | O | P | P | O | O | O : service d'exécution ; registre complet non vérifié ici. |
| Portfolio de stratégies | P | P | N | P | O | O, C : sélection déclarée ; avantage comparatif non démontré. |
| Adaptation de stratégie | P | P | P | P | O | O : service d'adaptation ; efficacité et limites à qualifier. |
| Contrat de méthode | O | P | P | O | O | W : méthode/artefact typés ; méthodes supplémentaires inégalement qualifiées. |
| Contrat de stratégie | O | P | P | O | O | O : contrat validé ; cohérence sur tout registre à vérifier. |
| Contrat d’exécution | P | P | P | P | O | O : budgets/autorité ; preuve intersurfaces incomplète. |
| Contrat de mission | O | P | P | O | O | O : normalisation et gates ; oracles propres à chaque mission. |
| Sélection | O | P | P | O | O | O : choix de route/worker ; qualité du choix non générale. |
| Arbitrage | P | P | P | P | O | O : arbitrages locaux ; oracle multiobjectif absent. |
| Escalade | O | P | P | O | O | L : issue de revue ; escalade humaine bout en bout non établie. |
| Terminaison | O | P | P | O | O | L : arrêt borné ; quiescence distribuée à qualifier. |
| Reprise | P | P | P | P | O | O, WAL : plusieurs mécanismes ; recovery global sous crash non général. |
| Retry | O | P | P | O | O | O : `jobWorkerRetry` ; idempotence externe à vérifier. |
| Backoff avec jitter | P | P | N | P | O | O : politique de retry ; distribution/timing non mesurés ici. |
| Dead-letter state | P | P | N | P | O | O : état de refus ; vidage et réintégration non démontrés. |
| Checkpoint | O | P | P | O | O | WAL : point de reprise ; intégrité multi-service non prouvée. |
| WAL | O | P | P | O | O | WAL : journal et tests ; recovery de toutes dépendances à qualifier. |
| Rejeu causal | P | P | P | P | O | [service](../../backend/src/services/syncytium/causality/causalReplayService.js) : rejouage borné ; fidélité générale non démontrée. |
| Bisection causale | P | P | P | P | O | [AgentGit bisect](../../backend/src/services/agentGitService/bisect.cjs) : algorithme ; cas réel audité manquant. |
| Rollback atomique | P | P | P | P | O | O : transaction locale ; atomicité interservices non établie. |
| Restauration | O | P | P | O | O | WAL, W : fichiers/checkpoints ; cohérence collective à qualifier. |
| Capsule | O | P | P | O | O | [store](../../crates/genos-store/src/capsule.rs) : artefact durable ; chaîne complète de reprise à qualifier. |
| Workspace contrefactuel | O | P | P | O | O | [guide](../02-orchestration/workspaces-contrefactuel.md) : snapshots/restore ; isolation hôte à qualifier. |
| Git agentique | P | P | P | P | O | AgentGit : opérations ; politique de fusion/promotion non complète. |
| AgentGit | O | P | P | P | O | AgentGit : API du graphe ; usage produit intégré partiel. |
| Trajectoire | O | P | P | P | O | O : lignage/events ; replay sémantique non général. |
| Lignage | O | P | P | O | O | O : référence parent/enfant ; contrôle de tout descendant non établi. |
| Campagne d’évaluation | P | P | P | P | O | O : campagnes spécialisées ; protocole commun et corpus à publier. |
| Benchmark | P | P | P | P | O | [guides](../06-benchmarks/README.md) : scénarios dispersés ; mesure comparative générale absente. |
| Progressive delivery | P | P | P | P | O | O, [rollouts](../04-exploitation/releases-et-rollouts.md) : canary/A-B ; qualification production absente. |
| Chargeback | P | P | N | P | O | O, [route](../04-exploitation/releases-et-rollouts.md#6-rollback-et-chargeback) : agrégation de coûts ; réconciliation réelle non démontrée. |

## 11. Huit topologies et Garage Fabric — 9 entrées

Les sous-capacités mentionnées dans l'inventaire (juge, quorum, veto, CRDT, niches, routage, dèmes, etc.) sont incluses dans le verdict de chaque ligne ; l'existence d'un profil dans `T` ne les valide pas. La [référence produit](../03-reference/contrat-produit-et-completude.md#2-modes-dorchestration-et-organisations) qualifie les huit modes de **partiels** ou **expérimentaux** ; aucun n'est conclu complet ici.

| Concept | I | V | Dé | U | Do | Preuve et manque décisif |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Trinity | P | P | P | O | O | T : dispatch/merge ; campagne corrigée nominale et barrière comparative à requalifier. |
| A-Team | P | P | P | O | O | T : exécution/DAG ; expertise générale non qualifiée. Sous-runs multiteam qualifiés par le runner de programme (`test_ateam_multiteam_subrun.js`) ; dispatch générique reste refusé. |
| Biocénose | P | P | P | O | O | T : communauté/votes ; preuve de consensus et veto minoritaire intégrés incomplète. |
| Holobionte | P | P | P | O | O | T : hôte/symbiontes ; veto immunitaire et inférence locale bout en bout non qualifiés. |
| Syncytium | P | P | P | O | O | T : état causal/variants ; convergence distribuée et campagne LLM complète à publier. |
| Biome | P | P | P | O | O | T : niches/foraging ; résultat écologique et biofilm non qualifiés. |
| Rhizome | P | P | P | O | O | T : ramification/routage ; croissance admise et routage E2E publiés (`test_rhizome_growth_routing_e2e.js`, 36 suites PASS). |
| Métapopulation | P | P | P | O | O | T : dèmes/reprise ; qualification externe et globale manquante. |
| Garage Fabric | P | P | P | O | O | [garage](../../backend/src/services/workerGarageService.js), [tests](../../backend/tests/test_garage_fabric.js) : admission/leases ; sélection multi-stratégies en mission à qualifier. |

## 12. Organisations dynamiques — 19 entrées

`G` prouve qu'il existe un service de changement d'organisation et des algorithmes de guidage. Son test unitaire a réussi pendant cet audit, mais il ne vérifie que la présence des 15 pas et certaines sorties ponctuelles ; les quatre algorithmes d'essaim ne sont pas exercés. Le [contrat produit](../03-reference/contrat-produit-et-completude.md#2-modes-dorchestration-et-organisations) indique que chaque organisation demeure partielle ou expérimentale : la sortie d'un algorithme ne prouve ni dispatch des workers ni effet de mission. Les quatre algorithmes d'essaim absents de `organizationAlgorithms.js` sont définis dans [`swarmTopologyAlgorithms.js`](../../backend/src/services/swarmTopologyAlgorithms.js).

| Organisation | I | V | Dé | U | Do | Preuve et manque décisif |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| `specialist_expert_committee` | P | P | N | P | O | G : hub/spokes testés ; intégration et arbitrage non démontrés. |
| `blind_adversarial_review` | P | P | N | P | O | G : paires anonymes testées ; indépendance effective non démontrée. |
| `red_blue_coevolution` | P | P | N | P | O | G : groupes red/blue testés ; coévolution sur cycles absente. |
| `brier_weighted_consensus` | P | P | N | P | O | G : calcul sur vérité résolue testé ; calibration longitudinalement absente. |
| `quorum_with_abstention` | P | P | N | P | O | G : votes/abstentions testés ; mission communautaire absente. |
| `stigmergy` | P | P | N | P | O | G : choix de trace testé ; expiration/persistance à qualifier. |
| `flocking_boids` | P | P | N | P | O | G : algorithme d'essaim ; bénéfice de coordination non démontré. |
| `fish_school_search` | P | P | N | P | O | G : algorithme d'essaim ; recherche collective non démontrée. |
| `slime_mould_network` | P | P | N | P | O | G : algorithme d'essaim ; réseau adaptatif en mission non démontré. |
| `grey_wolf_optimizer` | P | P | N | P | O | G : algorithme d'essaim ; convergence/budget en mission non démontrés. |
| `mycelial_routing` | P | P | N | P | O | G : routage par capacité testé ; dispatch effectif absent. |
| `dynamic_polyethism` | P | P | N | P | O | G : gradient de fitness testé ; réallocation de rôle persistée absente. |
| `energy_huddle` | P | P | N | P | O | G : allocations testées ; consommation réelle non démontrée. |
| `network_silence` | P | P | N | P | O | G : indicateur/buffer testé ; isolement réseau réel non démontré. |
| `strategy_arena` | P | P | N | P | O | G : liste de compétiteurs testée ; tournoi avec reçus absent. |
| `hierarchical_merge` | P | P | N | P | O | G : arbre calculé ; fusion sous gate absente. |
| `competitive_arena` | P | P | N | P | O | G : même guidance que `strategy_arena` ; comparaison factuelle absente. |
| `isolated_recovery` | P | P | N | P | O | G : liste isolée/plan calculés ; restauration effective absente. |
| `memory_compilation` | P | P | N | P | O | G : renvoie des faits ; écriture/lecture mémoire prouvées absentes. |

## 13. Capacités du contrat topologique — 37 entrées

La présence d'une constante dans `C` établit l'exigence d'une topologie, jamais la capacité exécutée. Les verdicts ci-dessous portent sur les services transverses repérables dans le dépôt et sur l'usage par les huit modes. Le [registre produit](../03-reference/contrat-produit-et-completude.md#3-capacités-transverses) décrit la plupart des capacités comme partielles ou expérimentales et fixe leurs acceptations manquantes.

| Capacité | I | V | Dé | U | Do | Preuve et manque décisif |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Portfolio de stratégies | P | P | N | P | O | C, O : plan/registre ; sélection supérieure en campagne absente. |
| Adaptation de stratégie | P | P | N | P | O | C, O : adaptation bornée ; utilité comparative non démontrée. |
| Compétition d’arène | P | P | N | P | O | C, G : comparaison locale ; tournoi de mission avec preuve absente. |
| Gate de promotion | P | P | P | O | O | C : gates multiples ; parité de toutes surfaces non démontrée. |
| Économie de tokens | P | P | P | O | O | C : budget/allocation ; coût réel de tous modèles non réconcilié. |
| Barrière d’évidence | P | P | P | O | O | C : services worker/fleet ; propagation de tous refus à qualifier. |
| Brier épistémique | P | P | N | P | O | C, G : calcul avec issue résolue ; calibration externe manquante. |
| Monitoring des hallucinations | P | ? | N | P | O | C : moniteur/contrat ; corpus et taux d'erreur publiés absents. |
| Gouverneur de sortie | P | P | P | P | O | C : validation sortie ; parcours tous providers absent. |
| Provenance | P | P | P | O | O | C : reçus/dossiers ; complétude des liens source à qualifier. |
| Mémoire graphe | P | P | P | P | O | C : service mémoire ; isolation et rappel intermissions à qualifier. |
| Mémoire vectorielle | P | P | N | P | O | C : indexation/recherche ; benchmark retrieval filtré absent. |
| Mémoire épisodique | P | P | P | P | O | C : stockage/rappel ; intégration multi-session à qualifier. |
| Plasticité synaptique | P | P | N | P | O | C : mise à jour locale ; bénéfice d'apprentissage non démontré. |
| Bus de signalisation | P | P | P | O | O | C : publication/inbox ; ordre et refus bout en bout à qualifier. |
| Ligand/récepteur | P | P | N | P | O | C : appariement typé ; effet de routage en mission absent. |
| Stigmergie | P | P | N | P | O | C, G : traces/choix ; durée de vie et effet collectif non démontrés. |
| Métriques d’essaim | P | P | N | P | O | C : calculs ; baseline et gains comparatifs absents. |
| Quorum | P | P | P | P | O | C, G : seuil/abstention ; attribution de vote indépendante à qualifier. |
| Génome/épigénétique | P | P | P | P | O | C : AgentDNA/expression ; chaîne héréditaire complète à qualifier. |
| Évolution/reproduction | P | P | N | P | O | C : services descendants ; isolation et héritage E2E absents. |
| Système immunitaire | P | P | P | P | O | C : veto/gates ; protection générale non mesurée. |
| Homéostasie de conscience | N | N | N | N | O | C : [contrat](../03-reference/contrat-produit-et-completude.md#3-capacités-transverses) la classe hors périmètre produit ; métrique ≠ conscience. |
| Résilience/récupération | P | P | P | P | O | C, O : reprise locale ; campagne de fautes interservices absente. |
| Chaos engineering | P | P | N | P | O | C : injection/stress ; SLO de récupération non démontré. |
| État partagé CRDT | P | P | P | P | O | C, T : Syncytium ; convergence distribuée réelle à publier. |
| Sandbox VFS | P | P | P | O | O | C : confinement/simulation ; tous effets externes non couverts. |
| Capsules/snapshots | P | P | P | O | O | C, O : stores ; restauration collective vérifiée absente. |
| Routage de modèles | P | P | P | O | O | C : sélection locale/distante ; exhaustivité fournisseurs absente. |
| Inférence locale | P | P | P | P | O | C, T : adaptateurs locaux ; capacité hôte et refus non qualifiés partout. |
| Gateway d’inférence | P | P | P | P | O | C : passerelle ; parité et coût interproviders incomplets. |
| Observabilité | P | P | P | O | O | C : logs/traces ; corrélation complète de mission à prouver. |
| Approbation de gouvernance | P | P | P | P | O | C : décision/autorité ; flux humain réel à qualifier. |
| Compliance | P | P | N | P | O | C : contrôles ; conformité externe non attestée. |
| Web foraging | P | P | N | P | O | C : exploration web ; qualité/permissions dans les huit modes absentes. |
| Perception fovéale | P | P | N | P | O | C : focalisation ; effet perceptif validé absent. |
| Computer use | P | P | N | P | O | C : surface déclarée/adapter ; scénario utilisateur autonome et sûr absent. |

## 14. Types, familles, modes et rôles de workers — 33 entrées

`W` et [la qualification](qualification-workers.md) documentent **19 types, 25 méthodes et 24 cas de benchmark**. Une méthode par type possède une démonstration historique C2/C3 sur tâche bornée ; cela ne valide pas chaque méthode, chaque tâche libre, ni les cinq familles comme capacités indépendantes. La tentative de relecture actuelle a été limitée par `EPERM` sandbox après 14 types ; ce n'est pas un verdict d'échec des cinq autres.

| Entrée | I | V | Dé | U | Do | Preuve et manque décisif |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| `scout_cell` | O | P | P | O | O | W : scan littéral C2/C3 historique ; authenticité source non prouvée. |
| `resident_daemon` | O | P | P | O | O | W : monitor numérique C2/C3 historique ; capteurs non validés. |
| `bounded_worker` | O | P | P | O | O | W : procédure bornée C2/C3 ; cas `bounded-code` non mesuré. |
| `adaptive_worker` | O | P | P | O | O | W : adaptation bornée C2/C3 ; généralisation non démontrée. |
| `specialist` | O | P | P | O | O | W : niche C2/C3 ; expertise ouverte non prouvée. |
| `procedural_executor` | O | P | P | O | O | W : procédure C2/C3 ; second algorithme non qualifié. |
| `symbiotic_worker` | O | P | P | O | O | W : procédure hôte C2/C3 ; symbiose libre non démontrée. |
| `verifier_worker` | O | P | P | O | O | W : vérification de procédure C2/C3 ; autres méthodes à qualifier. |
| `red_worker` | O | P | P | O | O | W : falsification C2/C3 ; efficacité adversariale générale non mesurée. |
| `experimental_worker` | O | P | P | O | O | W : mesure LPT C2/C3 ; optimalité globale non prouvée. |
| `formal_worker` | O | P | P | O | O | W : Lean 4.34.0 C2/C3 ; autres théorèmes/méthodes non qualifiés. |
| `synthesis_worker` | O | P | P | O | O | W : synthèse de claims C2/C3 ; vérité non décidée. |
| `creative_worker` | O | P | P | O | O | W : candidat C2/C3 ; originalité générale non établie. |
| `medical_worker` | O | P | P | O | O | W : cas synthétique C2/C3 ; aucune validation clinique. |
| `recovery_worker` | O | P | P | O | O | W : restore C2/C3 historique ; relecture locale bloquée par sandbox. |
| `forensic_worker` | O | P | P | O | O | W : causes déclarées C2/C3 ; vérité causale non établie. |
| `liaison_worker` | O | P | P | O | O | W : handoff C2/C3 ; accusé reste à faux. |
| `teaching_worker` | O | P | P | O | O | W : enseignement borné C2/C3 ; apprentissage destinataire à mesurer. |
| `sub_orchestrator` | O | P | P | O | O | W : deux enfants C2/C3 ; graphe arbitraire non qualifié. |
| Famille sensorielle | P | P | P | P | O | W : types scout/daemon ; comportement commun de famille non contracté. |
| Famille exécution | P | P | P | P | O | W : types exécutants ; invariants communs non démontrés. |
| Famille épistémique | P | P | P | P | O | W : types de vérification ; indépendance systématique absente. |
| Famille réparation adaptative | P | P | P | P | O | W : recovery/adaptation ; résilience collective non démontrée. |
| Famille organisationnelle | P | P | P | P | O | W : liaison/orchestration ; efficacité des handoffs non mesurée. |
| Mode déterministe | P | P | P | P | O | W : exécuteurs bornés ; garantie pour tous workers absente. |
| Mode borné | P | P | P | P | O | W : budget/contrat ; bornes de toute dépendance externe inconnues. |
| Mode adaptatif | P | P | P | P | O | W : sélection/régulation ; gain causal non démontré. |
| Mode créatif | P | P | P | P | O | W : candidat créatif ; nouveauté externe non mesurée. |
| Rôle producteur | P | P | P | P | O | W : production d'artefact ; séparation des rôles à qualifier. |
| Rôle vérificateur | P | P | P | P | O | W : oracle borné ; indépendance générale non assurée. |
| Rôle adversaire | P | P | P | P | O | W : contre-exemples ; couverture adversariale non mesurée. |
| Rôle expérimentateur | P | P | P | P | O | W : mesure bornée ; réplication multi-environnement absente. |
| Rôle synthétiseur | P | P | P | P | O | W : agrégation ; vérité des synthèses non garantie. |

## 15. Cycle universel d'un worker — 23 entrées

Le [type Rust `CycleStep`](../../crates/genos-worker/src/cycle.rs#L8-L58) énumère l'ordre nominal et [`review`](../../crates/genos-worker/src/cycle.rs#L115-L158) sélectionne cinq issues. C'est un automate et des contrats ; il ne prouve pas que chaque worker Node traverse chacune de ces étapes avec les mêmes effets persistés. Les lignes « étape » reçoivent donc `P` pour l'implémentation, au plus `P` pour la vérification/démonstration, sauf surface absente.

| Étape ou décision | I | V | Dé | U | Do | Preuve et manque décisif |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Incarnation | P | P | P | P | O | L : étape et service ; identité instanciée sur tous types à relier. |
| Chargement du soi | P | P | N | P | O | L : contexte d'expression ; preuve par mission absente. |
| Chargement de la mission | P | P | P | P | O | L : contrat de mission ; même séquence pour tous types non prouvée. |
| Chargement de l’autorité | P | P | P | P | O | L : lease/contrat ; refus à chaque cycle à démontrer. |
| Perception | P | P | P | P | O | L : entrée/observation ; capteurs selon type à qualifier. |
| Mise à jour épistémique | P | ? | N | P | O | L : étape ; modification de croyance sous oracle absente. |
| Récupération de mémoire | P | P | P | P | O | L : références mémoire ; effet de rappel causal absent. |
| Vérification de la régulation | P | P | P | P | O | L : budgets/état ; tous seuils en mission non validés. |
| Sélection de recette cognitive | P | P | N | P | O | L : plan autonomie ; recette réellement suivie non tracée partout. |
| Sélection de stratégie | P | P | P | P | O | L : registre stratégie ; efficacité du choix non validée. |
| Sélection de procédures | P | P | P | P | O | L : procédures typées ; correspondance de tous types incomplète. |
| Action | O | P | P | O | O | L, W : méthodes natives C2/C3 historiques ; action libre non qualifiée. |
| Collecte des reçus | P | P | P | P | O | L, W : dossiers ; lien systématique action/reçu à qualifier. |
| Évaluation de l’évidence | P | P | P | P | O | L : gates ; oracle indépendant pour toute mission absent. |
| Mise à jour de mémoire | P | P | N | P | O | L : service mémoire ; effet durable à revalider. |
| Communication | P | P | P | P | O | L : inbox/bus ; livraison/ACK sur tout cycle à prouver. |
| Revue | O | P | P | P | O | L : `review` Rust ; intégration des résultats Node non uniforme. |
| Terminaison | O | P | P | O | O | L : `Done`/budget ; arrêt collectif sous faute à qualifier. |
| Continuer | O | P | P | P | O | L : `Continue` remonte à `Perceive` ; effets répétés à qualifier. |
| S’adapter | O | P | P | P | O | L : `Adapt` remonte à `Perceive` ; ajustement réel non garanti. |
| Demander une capacité | O | P | N | P | O | L : `RequestCapability` va à `Communicate` ; admission effective absente. |
| Escalader | O | P | P | P | O | L : `Escalate` va à `Communicate` ; prise en charge externe à prouver. |
| Terminer | O | P | P | P | O | L : `Terminate` va à `Done` ; clôture d'une mission complète distincte. |

## Conclusion de cet audit

**Aucune des 205 entrées n'a cinq `O` sur une même portée.** Les preuves les plus concrètes ici sont les E2E bornés de Natural Search et NCE, le test de pression et les tests d'algorithmes d'organisation ; elles ne suffisent pas à qualifier leurs systèmes entiers. Les 19 workers ont des campagnes historiques précises, mais la relecture actuelle échoue sur un budget d'oracle et les méthodes restantes doivent être distinguées de la déclaration « 19 types disponibles ». Priorités de preuve : isoler l'expiration d'oracle, publier des campagnes nominales de topologies/organisations à travers dispatch et oracle, puis relier chaque étape du cycle aux reçus d'une mission réelle. Une erreur de sandbox ne doit pas être assimilée à une défaillance produit.
