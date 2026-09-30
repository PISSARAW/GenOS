# Maturité des capacités biologiques

- **Statut** : Référence — grille d'évaluation, pas revendication.
- **Dernière revue** : 2026-09-30 (révision des preuves et du backlog).
- **Règle** : un statut exige le chemin de code et le test cités. Sans les
  deux, le statut est « proposition ».

## 1. Niveaux

- **documentée** : concept ou contrat décrit dans `docs/`, sans preuve d'appel.
- **primitive** : fonction locale testée (`cargo test -p <crate>`), non appelée
  par un chemin runtime.
- **intégrée** : appelée par un chemin réel du runtime (CLI, backend, MCP,
  orchestrateur), avec lease et permissions quand il s'agit d'un effet.
- **validée** : résultat mesuré par un test bout en bout ou un benchmark
  reproductible (commande, seed, artefacts conservés).

## 2. Matrice actuelle (revue 2026-09-30)

| Concept | Statut retenu | Preuve | Ce qui manque pour le niveau suivant |
| --- | --- | --- | --- |
| Cellule `AgentCell`, division | primitive | `crates/genos-cell`, tests crate | appel par un chemin mission avec reçu |
| Génome, mutations, crossover | primitive | `crates/genos-genome`, tests crate | replay de lignée via runtime |
| Épigénétique | documentée → primitive partielle | `epigenome.rs`, tests crate | lien prouvé avec expression réelle des capacités |
| Métabolisme `MetabolicPool` | primitive | `autopoiesis.rs`, tick cellulaire | registre commun + enforcement aux points d'exécution |
| Reçu d'exécution du tick Rust | intégrée partielle | Feature `api` de `tick_and_persist` expédie le journal; middleware backend vérifie HMAC, fraîcheur et nonce; test de contrat Rust/JS et ingestion idempotente | E2E déployé Rust→backend après redémarrage; les reçus `organism` n'identifient pas de cellule/génome exécutants |
| Homéostasie de mission | intégrée partielle | `homeostasisService.js`, `homeostasis_contract_revisions`, `homeostasis_transition_receipts`; `node backend/tests/test_homeostasis_authority_receipts.js` vérifie révisions, empreintes, seuils et issues autorisées/refusées | corrélation avec reçu Rust et registre métabolique; persistance d'une identité cellule/génome de bout en bout |
| Neurobiologie, glie, quorum | intégrée partielle | `GenosEcosystem::record_event` → événements mission (`BIOLOGICAL_EXECUTION_RECEIPT`, action instinctive, reproduction) → `MISSION_NEURO_GLIA_QUORUM_RESPONSE`; réponse astrocytaire et myélinisation reportées sur le neurone, quorum compté sur les cellules actives | état glial événementiel simplifié, événements en mémoire, pas de preuve distribuée ni d'artefacts E2E persistés |
| Instinct PAF | intégrée partielle | `GenosEcosystem::tick` évalue les instincts (`crates/genos-orchestrator/tests/instinct.rs`, `tick_evaluates_instincts_automatically`); tests du module couvrent seuils, veto d'outil et résultats | reçu durable du stimulus, de la décision et de l'action; parcours mission/backend E2E |
| Sens VNO, électro, Cluster N, tectum, écho | primitive | modules `sensory/*`, tests locaux | adaptateurs concrets ou typage « signal synthétique » |
| Immunité, pathologie, thérapie | primitive | tests cliniques `genos-biology/src/lib.rs` | application à des points réels + quarantaine bloquante |
| Écologie, tissus, spores | primitive | modules biology | registre de population durable + provenance |
| Reproduction | intégrée partielle | cycle autonome dans `GenosEcosystem`; `genos.reproduction-event/v1` porte seed, mutations et empreintes parent/fille (`crates/genos-orchestrator/tests/reproduction_cycle.rs`) | rattachement durable à mission/cellules, persistance après redémarrage et replay de lignée E2E |
| Fossilisation | intégrée partielle | registre Rust et tests d'intégrité dans `crates/genos-store`; service backend avec tests `backend/package.json` (`test:fossilization`) | preuve E2E de provenance reliant artefact fossile, événement source et lignée après redémarrage |
| Cnidocyte | intégrée partielle | `mcpExecutor.execute` → `screenCnidocyteThreat`; `node backend/tests/test_mcp_cnidocyte_runtime_gate.js` | attaques au travers d'un transport configuré et artefacts de benchmark conservés |
| Électrocyte | intégrée partielle | `GenosEcosystem::discharge_electric_under_quorum`; tests quorum actif/expiré | identité authentifiée des votants et timeout mesuré sur collecte distribuée |
| Choanocyte | intégrée partielle | `GenosEcosystem::filter_stream` émet `CHOANOCYTE_STREAM_FILTERED` avec scans, rétention, pertes et débit calculé | flux mission E2E et artefacts persistés/benchmarkés |
| Iridophore | intégrée partielle | `GenosEcosystem::render_polymorphic` émet `IRIDOPHORE_RENDERED` et vérifie la forme correspondant à la perspective demandée | validation perceptuelle et camouflage non cryptographique |
| Cellule de garde | intégrée partielle | `GenosEcosystem::throttle_flux` régule selon l'ATP disponible, débite le flux admis via `Metabolism::consume_for` et ferme en famine | preuve mission E2E et persistance des reçus métaboliques |
| Trachéide | intégrée partielle | `GenosEcosystem::ossify_pipeline` émet un plan d'exécution versionné et compare coût/débit sur une entrée identique avant et après ossification | compilation en binaire natif et mesures benchmarkées répétables |
| Procaryote / HGT | intégrée partielle | `hgt_transfer_under_lease` lie le transfert à une mission, un donneur, un receveur et un plasmide; usage consommé, révocation explicite et refus sans lease | identité authentifiée du lease, persistance et intégration MCP/worker |
| Organisme de mission | intégrée partielle | `missionIdentityService.attachOrchestrator` atomique; test de succession concurrente puis réouverture DB dans `test_mission_continuity.js` | vérification de reprise avec processus backend distinct et déploiement multi-instance |
| État clinique | intégrée partielle | `clinicalStateService` écrit l'état dans `clinical_states`; `test_clinical_state_persistence.js` ferme puis rouvre SQLite et vérifie les champs cliniques | liaison à une identité de cellule Rust durable et autorisation d'application de thérapie |
| Foraging web, fovéation | intégrée expérimentale | Puppeteer, Sharp, `foragingLoopService`; `test_foraging_browser_runtime.js` passe avec observation, crop, décision et navigation sur serveur local contrôlé | tâches web externes contrôlées, mesure de pertinence sémantique et GAIA; voir `web-foraging.md` |
| POET et généralisation | intégrée expérimentale | `executeAgentOnEnvironment` attend la terminaison runtime et vérifie l'artefact dans un snapshot; `evaluateGeneralization` exécute un split disjoint | E2E avec fournisseur/runtime de production et benchmark multi-graines |
| Neurobiologie, glie, quorum | intégrée partielle | `pre_deliberation` transmet menace et stress bornés au `NeuroLab`, applique la plasticité et journalise `NEURAL_MISSION_SIGNAL`; `cargo test -p genos-orchestrator --lib tick_delivers_measured_threat_into_neural_runtime -j 1` et `cargo test -p genos-orchestrator --lib neural_mission_signal_ignores_non_finite_input -j 1` | glie/quorum restent sans chemin runtime de mission; aucun effet protégé n'est autorisé par ce signal local |
| Instinct PAF | intégrée partielle | `tick.rs::pre_deliberation` appelle `run_instincts`; `instincts.rs` vérifie les outils autorisés avant le dispatch et journalise l'issue; `cargo test -p genos-orchestrator --test instinct -j 1` | adaptateur sensoriel et exécuteur d'action de production, ainsi que reçu corrélé à l'action |
| Sens VNO, électro, Cluster N, tectum, écho | intégrée partielle | `animal_sensory_runtime.rs` transforme un signal typé et refuse les entrées synthétiques invalides; `cargo test -p genos-orchestrator --lib animal_sensory_runtime -j 1` | adaptateurs reliés aux événements authentifiés d'une mission; les stimuli synthétiques de test ne valent pas observation réelle |
| Immunité, pathologie, thérapie | intégrée partielle | `agents/agentIncarnationService.incarnateAgent` appelle `missionQuarantineGate.assertMissionDispatchAllowed` avant création/dispatch; `node backend/tests/test_mission_quarantine_gate.js` exécute l'incarnation réelle sur SQLite, confirme l'état bloqué/arrested après réouverture et vérifie le refus `AGENT_QUARANTINED` | preuve d'audit de permission dans le même scénario et thérapies biologiques Rust encore non branchées à ce gate |
| Écologie, tissus | intégrée partielle | biome utilise `biomeSessionStore` pour état/révisions/événements et expose composition/niches/populations; `node backend/tests/test_biome_population_restart.js` ferme/réouvre SQLite et vérifie génome, capacité et reçu de fitness; `node backend/tests/test_biome_populations.js` et `node backend/tests/test_topology_session_persistence.js` vérifient transitions/révisions | scopes d'accès et provenance des mesures de fitness produites par de vraies exécutions d'agents |
| Cycle des spores | intégrée partielle | `genos biological --tick` restaure maintenant l'orchestrateur, les spores, génomes, tissus, directeur et ATP depuis le checkpoint mission; `cargo test -p genos-orchestrator --test checkpoint_recovery durable_checkpoint_restores_spore_lineage_and_wake_state` vérifie checkpoint disque, identité/filiation et refus de conditions incorrectes; `node backend/tests/test_biological_receipt_ingestion.js` vérifie des UUID de cellule/génome identiques entre deux processus CLI | l'opération de germination doit recevoir une autorisation de mission vérifiable, et son reçu parent/enfant doit être ingéré dans le backend |
| Reproduction, fossilisation | intégrée partielle | `mission_division.rs` journalise parent/enfant; backend expose les contrôleurs/services fossilisation et lineage; `cargo test -p genos-orchestrator --test reproduction_cycle -j 1`, `node backend/tests/test_fossilization_service.js`, `node backend/tests/test_bio_lineage.js` | replay backend démontré de bout en bout depuis parent, seed, mutations et empreintes après fermeture/réouverture |
| Cnidocyte | intégrée partielle | `mcpExecutor.execute` → `screenCnidocyteThreat`; `node backend/tests/test_mcp_cnidocyte_runtime_gate.js` | transport de production configuré et artefacts de benchmark conservés; décision de l'écran n'est pas une preuve de résistance réelle |
| Électrocyte | primitive | `GenosEcosystem::discharge_electric_under_quorum`; `cargo test -p genos-orchestrator --lib electric_discharge_requires_live_multi_cell_quorum_and_records_measurement -j 1` et test d'expiration | aucun appel depuis le tick ou un dispatcher de mission; identité authentifiée des votants, timeout distribué et event store durable |
| Choanocyte | primitive | `GenosEcosystem::filter_stream` filtre les paquets entrants; `cargo test -p genos-orchestrator --test specialized_cell_runtime -j 1` vérifie les paquets retenus et rejetés | aucun branchement à une source de mission; entrée authentifiée, provenance, coût, permissions et reçu durable |
| Iridophore | primitive | `GenosEcosystem::render_polymorphic` rend un payload et une bande spectrale JSON; le même test vérifie le contenu et une mesure spectrale positive | aucun consommateur de rendu runtime identifié; permissions, effet mesuré et preuve durable; le mode camouflage ne constitue pas un contrôle de sécurité |
| Cellule de garde | intégrée partielle | `tick.rs::regulate_mission_flux` relie l'ATP disponible et le stress borné à `StomatalPore`, puis plafonne le budget de planification avant le directeur; `cargo test -p genos-orchestrator --lib mission_tick_applies_guard_cell_backpressure_to_planning_budget -j 1` vérifie le reçu mesuré depuis un tick | signal de stress provenant d'une exécution backend réelle et reçu durable; la régulation ne confère aucun droit de dispatch et ne borne que le budget interne de planification |
| Trachéide | primitive | `GenosEcosystem::ossify_pipeline` change l'état puis `transport_sap_stream` mesure le volume et le coût déclarés; `cargo test -p genos-orchestrator --test specialized_cell_runtime -j 1` vérifie transport et cavitation | aucun appel mission; artefact de pipeline compilé, permissions et coût comparatif chronométré; le multiplicateur déclaré n'est pas un benchmark |
| Procaryote / HGT | primitive | `GenosEcosystem::hgt_transfer` applique les gardes pilus, identité distincte et plasmide valide; le test vérifie l'ajout du plasmide et l'étiquette `PAYLOAD_NOT_EXECUTED` | aucun appel mission; lease de transfert, révocation, provenance durable parent/enfant; le payload reste non exécutable |
| Organisme de mission | intégrée partielle | orchestrateur, checkpoints durables de l'orchestrateur/directeur/métabolisme/event store et snapshots de population; test CLI deux processus vérifie identité stable et tick événementiel croissant; `checkpoint_recovery` vérifie spores et ATP après reprise | restauration des autres sous-systèmes Rust et permission de réveil/audit corrélée à la continuité backend |
| Foraging web, fovéation | intégrée expérimentale | session Puppeteer MCP, crop Sharp, `foragingLoopService`; E2E validé sur serveur local contrôlé | tâches web réelles contrôlées, mesure de qualité sémantique et évaluation GAIA, voir `web-foraging.md` |

Aucune capacité ci-dessus n'est « validée » au sens bout en bout avec
artefacts reproductibles conservés. Le test Rust/backend vérifie le contrat de
signature et le middleware vérifie l'origine des reçus, mais aucun déploiement
E2E ne prouve encore la livraison après redémarrage ni l'identité cellule/génome.
Les documents qui
annonçaient « Implémenté » pour les cellules spécialisées et les super-sens
sont corrigés en « primitive ».

## 3. Backlog fondé sur les preuves

Les lots ci-dessous ordonnent les lacunes observées; ils ne signifient pas que
les travaux sont démarrés. Une capacité ne progresse de niveau qu'après
vérification du chemin, du test et, pour « validée », des artefacts conservés.

| Ordre | Lot | Preuve d'entrée | Travail à planifier | Critère de sortie |
| --- | --- | --- | --- | --- |
| 0 | Revue de la grille | Revue documentaire 2026-09-30; nouveaux contrôles ingestion tenant, corrélation tardive, promotion fail-closed et benchmark archivé | Réviser les statuts à chaque changement et conserver les distinctions entre primitives, intégrations et résultats mesurés | Chaque statut renvoie au point d'entrée et à un test ou une limite explicitement constatée |
| 1 | Reçu biologique durable inter-runtime | Envoi Rust sous feature `api`, HMAC d'origine, nonce à usage unique; tests de contrat et d'ingestion passent | Exécuter le pont sur un backend distinct après redémarrage; les reçus `organism` n'attestent pas une cellule/génome | Livraison E2E reproductible avec mission autorisée, coût concordant et reçu dédupliqué |
| 2 | Continuité de mission | `test_mission_continuity.js`: succession atomique, un seul gagnant, base fermée/réouverte | Étendre la preuve à un redémarrage de processus backend et un store partagé multi-instance | Successeur unique rechargé par un nouveau processus depuis le store persistant |
| 3 | AEIS | `test_approve_run_deferred_promotion.js`: `approveRun()` refuse les reçus non authentifiés et accepte deux acteurs indépendants avec signatures et obligations vérifiées | Vérifier l'intégration de la même chaîne de confiance avec les fournisseurs de vérification de production | Cas positif et négatif E2E avec reçus réels persistés et rapport signé |
| 4 | Causalité procédurale | Primitive `causal_diff` branchée aux forks/diffs et analyses persistés; `test_causal_primitive_persistence.js` passe | Valider le replay après interruption sur runner contrôlé et préciser la portée d'attribution; une analyse bornée ne prouve pas une causalité générale | E2E reproductible d'une divergence connue, avec snapshot, runner, environnement, budget et seed conservés |
| 5 | Natural Search | A* à heuristiques admissibles, vérification indépendante; GenOS 12/12 à 240 expansions, longueurs optimales sur toutes les tâches Blocksworld | Étendre les mesures à d'autres tâches et domaines; la reconstruction depuis tout l'historique reste hors contrat | Résultats reproductibles à budget égal sans plan invalide |
| 6 | Mesure NCE et foraging | POET exécute et vérifie sur snapshot, généralisation sur split disjoint; foraging navigateur local passe | Vérifier avec runtime/fournisseur de production et tâches web externes; GAIA n'est pas disponible dans ce checkout | E2E de production, seeds et artefacts conservés; score GAIA seulement après exécution effective |
| 7 | Indicateurs fonctionnels | Registre, reçus idempotents, workspace global, objectifs/planification allostatiques, synthèse cognitive et corrélation d'efférence MCP vérifiés par leurs tests ciblés | Définir puis mesurer les critères encore non couverts : compétition, récurrence et prédiction générative; séparer allostasie causale et synthèse de rapport des proxys actuels | Chaque résultat renvoie à une exécution mesurée; aucun indicateur n'est présenté comme preuve de conscience |
| 8 | Parcours nosologique | Opérateurs Rust bornés et routés; CLI et MCP échouent fermés plutôt que de prétendre traiter | Définir une identité de cellule clinique durable et un contrat d'autorisation avant de relier l'API/CLI à `apply_therapy`; relier le diagnostic par une politique explicite. Les propositions §4.2 restent séparées | Test de mutation persistante et autorisée, refus sans cible, et aucun succès avant reçu attestant l'application |

## 4. Règle anti-surpromesse

- Un calcul de tension n'est pas un consensus distribué.
- Un identifiant de pipeline ne signifie pas qu'un pipeline est compilé.
- Une constante `latency_micros: 2` n'est pas une latence mesurée.
- Un chiffrement par décalage n'est pas une garantie cryptographique.
- Un `PATCH_DEPARTURE` calculé ne prouve pas une navigation.
- Une lease autorise un appel ; elle ne prouve pas une boucle intégrée.

## Voir aussi

- [inventaire-biologique.md](inventaire-biologique.md) — chemins de code.
- [cellulaire-specialise.md](cellulaire-specialise.md) — limites détaillées.
- [sens-animaux.md](sens-animaux.md) — limites détaillées.
