# Maturité des capacités biologiques

- **Statut** : Référence — grille d'évaluation, pas revendication.
- **Dernière revue** : 2026-10-14.
- **Règle** : un statut exige le chemin de code et le test cités. Sans les
  deux, le statut est « proposition ».

## 1. Niveaux de maturité (nouvelle classification)

- **reference_only** : notion philosophique, biologique ou analogique ; aucune implémentation logicielle.
- **primitive** : mécanisme logiciel local testé (`cargo test -p <crate>`), non appelé par un chemin runtime réel.
- **integrated** : mécanisme appelé par un chemin runtime réel (CLI, backend, MCP, orchestrateur), avec lease et permissions.
- **validated** : résultat confirmé par une preuve E2E reproductible (commande, seed, artefacts conservés).

> **Note** : Les termes « métabolisme biologique », « homéostasie biologique », « organisme biologique », « conscience », « âme », « qualia » sont classés `reference_only` — ce sont des analogies documentaires, pas des fonctionnalités implémentées. Le « métabolisme » dans GenOS désigne exclusivement le registre computationnel de ressources (`MetabolicPool`). L'« homéostasie » désigne le contrôle de mission borné (`homeostasisService`). L'« organisme » désigne l'identité de mission (`missionIdentityService`).

## 2. Niveaux précédents (conservés pour l'historique)

- **documentée** : concept ou contrat décrit dans `docs/`, sans preuve d'appel.
- **primitive** : fonction locale testée (`cargo test -p <crate>`), non appelée
  par un chemin runtime.
- **intégrée** : appelée par un chemin réel du runtime (CLI, backend, MCP,
  orchestrateur), avec lease et permissions quand il s'agit d'un effet.
- **intégrée partielle** : un chemin de runtime et sa frontière d'autorité sont
  vérifiés, mais une étape du cycle de vie ou une preuve de tâche durable manque.
- **validée** : résultat mesuré par un test bout en bout ou un benchmark
  reproductible (commande, seed, artefacts conservés).

## 3. Matrice actuelle (revue 2026-10-14; clinique actualisée le 2026-10-14)

| Capacité | Classification | Statut (ancien) | Chemin et preuve observée | Lacune restante |
| --- | --- | --- | --- | --- |
| Cellule `AgentCell`, division | integrated | intégrée partielle | `divide_for_mission_with_snapshot` écrit reçu, snapshot et lien de reprise dans un append unique; `mission_division_atomicity` vérifie le rollback après échec d'append; `divided_cells_and_genomes_survive_process_restart` vérifie après redémarrage cellules, génomes, lignée et génération; `genos biological --tick --divide --mission-id … --mission …` appelle maintenant ce chemin durable | test CLI de reprise ajouté mais non exécuté (limite d'espace disque lors de la compilation Cargo); preuve limitée au journal local |
| Génome, mutations | integrated | intégrée partielle | `biological --tick --reproduce --mission-id …` appelle `reproduce_and_archive_lineage` sous le verrou de mission; test d’invocation ajouté pour vérifier reçu, snapshot, lien hashé et identité mission; `replay_reproduction_lineage` restaure les cellules/génomes/spores (`tests/reproduction_lineage_replay.rs`) | test CLI Rust non exécuté (espace disque insuffisant au build); pas de route backend ni de campagne déterministe conservée |
| Crossover méiotique | integrated | intégrée partielle | `crossover_for_mission` produit un génome enfant déterministe à partir de deux cellules/génomes distincts; reçu idempotent, empreintes des deux parents et de l'enfant vérifiées après réouverture dans un processus OS séparé (`mission_crossover_process_restart`) | branchement au tick autonome, au CLI ou au backend |
| Épigénétique | integrated | intégrée partielle | `recruit_dna_for_mission` persiste snapshot et reçu lié dans un append; `epigenetic_recruitment_process_restart` restaure et rejoue l'expression après redémarrage; nouvelle entrée `genos biological --tick --mission-id … --recruit-dna … --recruitment-spec …` réutilise le verrou de mission | test CLI `biological_epigenetic_recruitment` non exécuté (espace disque épuisé pendant la compilation de `genos-cli`); une seule marque de rôle testée; aucune épigénétique biologique revendiquée |
| Métabolisme `MetabolicPool` (registre computationnel) | integrated | intégrée partielle | `consume_mission_metabolic_pool_durable` écrit dans une seule ligne du journal vérifié le reçu idempotent et le snapshot complet de population après consommation; `metabolic_pool_state_and_operation_survive_process_restart` restaure le solde et les autres champs du pool après redémarrage, puis rejoue la même clé sans double débit; `failed_journal_append_rolls_back_pool_without_receipt_event` vérifie l'échec fermé et le rollback mémoire; `throttle_flux` refuse le flux quand les réserves ATP ou acides aminés de la cellule racine sont insuffisantes | l'append du journal fournit l'unité durable de commit; les pools des cellules ne sont pas agrégés; débit durable disponible via l'API Rust dédiée, pas encore branché à un E2E CLI/backend |
| Reçu d'exécution du tick Rust | validated | validée sur SQLite local | `biologicalExecutionReceiptService.js`, `rustPopulationRegistry.js`; `test_biological_ingestion_atomic.js` vérifie origine, remapping mission et atomicité population/reçus; `test_biological_tick_rust_backend_e2e.js` exécute deux CLI compilés et contrôle tick croissant, cellule/génome stables, coût ATP, résultat et fille après reprise | transport HTTP signé en déploiement distribué; [bilan de compilation/E2E](../../06-qualite-preuves/validation-biologie-computationnelle.md) |
| Reçu du worker exécutant | validated | validée sur SQLite local | `strategyExecutionService.js` → `biologicalWorkerReceiptService.js`; `test_biological_worker_receipts.js` et `test_biological_worker_restart.js` : procédure réelle, cellule stable, génome figé, coûts, gates, rejeu et reprise sur plusieurs processus | fournisseur externe et facture USD certifiée non couverts; aucune conversion ATP/tokens/USD |
| Homéostasie de mission (contrôle borné) | validated | validée sur SQLite local | `homeostasisAuthorityStore.js`, `homeostasisPolicyService.js`, `homeostasisClosureService.js`; tests d'autorité durable et de reprise : révisions, seuils v2, preuves dérivées, reçus de transition v2 et refus d'une clôture périmée, y compris en SQL direct | disponibilité multi-instance non démontrée; périmètre et commandes dans le [bilan](../../06-qualite-preuves/validation-biologie-computationnelle.md) |
| Neurobiologie, glie, quorum | integrated | intégrée partielle | `record_event_with_durable_neuro_glia_response` lie réponse, mission, événement source, identités cellulaires et digest du snapshot dans un append; `tests/mission_neuro_glia_process_restart.rs` relit la réponse et restaure la population dans un processus enfant; `tests/mission_neuro_glia_quorum.rs` vérifie le quorum de cellules vivantes | état glial événementiel simplifié; le journal conserve le reçu de réponse et le snapshot, pas le flux général d'événements; pas de preuve distribuée ni d'artefact E2E |
| Instinct PAF | integrated | intégrée partielle | `tick_and_persist` ajoute `genos.instinct-paf-receipt/v1` au même journal JSONL, lié à la mission et au tick, avec stimuli/provenance, évaluation, issue et reçus d'action; test `mission_tick_persists_instinct_stimulus_decision_and_action_receipts` relit le reçu après réouverture | source sensorielle réelle et parcours backend E2E non démontrés; sans mission, aucun reçu PAF durable |
| Sens VNO, électro, Cluster N, tectum, écho | primitive | intégrée partielle | `animal_sensory_runtime.rs` émet des reçus mesurés pour signaux synthétiques typés; `sensory_receipt_runtime.rs` les lie à une mission, calcule et vérifie leur digest, puis `tests/sensory_receipt_restart.rs` les relit dans un processus distinct via `BiologicalReceiptStore` | signaux synthétiques seulement; adaptateurs de capteurs réels et intégration backend absents |
| Immunité, pathologie, thérapie | integrated | intégrée partielle pour la clinique Rust | Catalogue des 28 conditions et 48 opérateurs; diagnostic au tick, autorisation signée et persistance avant mutation mémoire; l'autorisation lie le reçu source à la mission, cellule, génome et empreinte d'état; le test clinique HTTP → Rust vérifie refus, mutation, reçu durable, reprise et idempotence | [Validation ciblée](../../06-qualite-preuves/validation-nosologie.md); le déploiement multi-instance et les autres opérations immunitaires gardent leurs preuves propres |
| Écologie, tissus, spores | integrated | intégrée partielle | le snapshot conserve spores, empreintes et origine tissulaire; `tests/spore_process_restart.rs` persiste un snapshot dans `BiologicalReceiptStore`, le rouvre dans un processus enfant, restaure puis fait germer la spore | branchement automatique au démarrage runtime et artefact E2E de campagne conservé |
| Reproduction | integrated | intégrée partielle | `biological --tick --reproduce --mission-id …` appelle `reproduce_and_archive_lineage` sous le verrou mission; test d’invocation ajouté pour vérifier reçu, snapshot `population-state/v1`, lien hashé et mission; test orchestrateur couvre rollback sur append invalide et restauration après redémarrage (3 tests) | test CLI Rust non exécuté (espace disque insuffisant au build); pas de route backend ni d’artefact de campagne conservé |
| Fossilisation | integrated | intégrée partielle | `recordFossil` exige un événement terminal lié par identifiant et hash à la même lignée et au même périmètre; REST/MCP exigent `source_event_id`; l'apoptose attend le flush puis confirme l'événement durable avant fossilisation; `npm --prefix backend run test:fossilization` (14-10-2026) vérifie provenance, reprise SQLite et refus d'une source altérée | rejeu CLI Rust non couvert; le test MCP de bout en bout dépend encore du binaire CLI local à reconstruire |
| Cnidocyte | integrated | intégrée partielle | `mcpExecutor.execute` → `screenCnidocyteThreat`; `test_mcp_cnidocyte_transport_e2e.js` vérifie le lease sur un pair stdio configuré, le refus du lease invalide et le blocage de `eval(malicious)` avant transport | artefacts de benchmark et fournisseur de transport de production non couverts |
| Électrocyte | integrated | intégrée partielle | [ADR 0487b](../../adr/0487-votes-electrocytaires-signes-et-rejouables.md); `ElectricVoterAuthority` vérifie les signatures Ed25519 de votes liés par `vote_signing_bytes` à la mission, proposition, échéance, cellule et décision; les deux chemins de quorum refusent les votes non authentifiés, les doublons et les cellules inactives; `discharge_electric_under_quorum_durable` append avant mutation et `replay_electric_quorum` revérifie les signatures; `electric_quorum_runtime_tests.rs` et `tests/electric_quorum_process_restart.rs` couvrent altération, clé inconnue, expiration, conflit d’idempotence et reprise interprocessus | l'autorité doit recevoir une liste de clés fiables depuis la configuration appelante, sans provisionnement de clés intégré; collecte distribuée, mesure de timeout réseau et branchement CLI/backend absents; pas un consensus distribué |
| Choanocyte | integrated | intégrée partielle | `MissionChoanocyteStream` impose le schéma, un `producerId` déclaré et des identifiants de paquets uniques; `filter_stream_and_persist` lie producteur, payload complet (SHA-256), mission, cellule et métriques dans le reçu append-only; `biological --tick --choanocyte-stream` utilise le journal durable de la mission. Tests ciblés ajoutés pour réouverture du store et invocation CLI. | `producerId` déclaré par l'appelant, sans authentification; le sift CLI `biomimicry` reste démonstratif/éphémère; débit logiciel, hydrodynamique modélisée; artefact de benchmark absent |
| Iridophore | integrated | intégrée partielle | `render_polymorphic_and_persist` lie la perspective, la sortie choisie et son SHA-256 à une mission; reçu relu après redémarrage processus (`iridophore_process_restart`) | validation perceptuelle; camouflage non cryptographique |
| Cellule de garde | integrated | intégrée partielle | `throttle_flux_for_mission_durable` applique le backpressure selon ATP et pool racine, débite le flux admis et persiste le résultat idempotent, pore, checkpoint ATP et snapshot; `guard_flux_state_and_idempotent_replay_survive_process_restart` vérifie population, pore, ATP et rejeu après reprise processus malgré un snapshot ultérieur; les tests refus et append invalide vérifient l'absence de mutation et le rollback | API Rust sans appelant CLI/backend; pools des cellules non agrégés; ATP reste un registre computationnel |
| Trachéide | integrated | intégrée partielle | `GenosEcosystem::ossify_pipeline` émet un plan d'exécution versionné; un test vérifie dans le reçu la comparaison déterministe du coût et du débit sur le même volume synthétique (1.0) | compilation en binaire natif; aucune mesure comparative de temps d'exécution n'est revendiquée |
| Procaryote / HGT | integrated | intégrée partielle | `GenosEcosystem::configure_hgt_trust` épingle les clés Ed25519 par émetteur; `hgt_transfer_under_lease` revérifie signature, mission, identités et digest plasmide, puis persiste le reçu avant mutation; `tests/hgt_authority.rs` couvre signature externe, altération, émetteur inconnu, expiration, rejeu et reprise avec journal rouvert; un verrou de fichier exclusif complète la mutex par runtime pour sérialiser l'accès au journal; `PlasmidBank::transfer`, conjugaison/transformation biologiques, CLI et diagnostic refusent sans preuve | service émetteur et authentification des demandes non déployés; reprise testée par réouverture dans un nouvel écosystème du même processus; le verrou interprocessus n'a pas encore de test avec processus OS concurrents et un crash peut laisser un verrou à retirer manuellement; API bas niveau de conjugaison conserve une signature legacy mais refuse et ne mute pas; intégration API/MCP absente; ADR 0486 contrat en qualification |
| Organisme de mission (identité runtime) | integrated | intégrée partielle | `missionIdentityService.attachOrchestrator` atomique; `test_mission_succession_processes.js` : deux processus sur SQLite WAL partagé, un seul successeur exécutable, perdant et ancien orchestrateur bloqués, réservation reprise après kill | déploiement multi-instance réel |
| État clinique | integrated | intégrée partielle | État Node persistant distinct des AgentCell Rust; `nosology_authorization` vérifie quatre cas de contexte, reçu, restauration et rejeu; `test:clinical-rust-e2e` vérifie HTTP → Rust, refus, mutation autorisée, reçu durable, reprise et idempotence | déploiement multi-instance, révocation générale et chaînage automatique de mission non attestés; voir [bilan clinique](../../06-qualite-preuves/validation-nosologie.md) |
| Foraging web, fovéation | integrated | intégrée expérimentale | Puppeteer, Sharp, `foragingLoopService`; `test_foraging_browser_runtime.js` passe avec observation, crop, décision et navigation sur serveur local contrôlé | tâches web externes contrôlées, mesure de pertinence sémantique et GAIA; voir `web-foraging.md` |
| POET et généralisation | integrated | intégrée expérimentale | `executeAgentOnEnvironment` attend la terminaison runtime et vérifie l'artefact dans un snapshot; `evaluateGeneralization` exécute un split disjoint | E2E avec fournisseur/runtime de production et benchmark multi-graines |

**Notions `reference_only` (vocabulaire analogique, sans implémentation) :**
- Métabolisme biologique (analogie pour `MetabolicPool`)
- Homéostasie biologique (analogie pour `homeostasisService`)
- Organisme biologique (analogie pour `missionIdentityService`)
- Conscience, Âme, Qualia (voir `conscience-esprit-mental.md`)
- Anticorps, inflammation, sélection clonale (analogies pour immunité/quarantaine)
- Synapse, quorum biologique (analogies pour vote/quorum distribué)
- Identité personnelle (analogie pour continuité de lignée logicielle)

Aucune capacité ci-dessus n'est « validée » au sens d'un déploiement de
production. Le pont Rust/backend prouve en E2E la livraison après redémarrage
(`test_rust_receipt_process_e2e.js` : backend fermé, tick hors ligne, nouveau
backend, retransmission puis déduplication) et la persistance de l'identité
cellule/empreinte génome via le snapshot de population signé. Les reçus de
portée `organism` portent des identités cellule/génome nulles par construction :
l'identité cellulaire voyage dans le snapshot, pas dans le reçu d'opération.
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
| 1 | Reçu biologique durable inter-runtime | `test_rust_receipt_process_e2e.js` : tick Rust vers HTTP authentifié puis SQLite, backend fermé puis relancé, retransmission, déduplication au second flush, identité cellule/empreinte génome conservées | Les reçus `organism` n'attestent pas une cellule/génome : l'identité cellulaire voyage dans le snapshot de population signé | Livraison E2E reproductible avec mission autorisée, coût concordant et reçu dédupliqué |
| 2 | Continuité de mission | `test_mission_succession_processes.js` : deux processus sur store WAL partagé, un seul successeur exécutable, perdant et ancien orchestrateur bloqués, réservation reprise après kill d'un processus | Étendre la preuve à un déploiement multi-instance réel | Successeur unique rechargé par un nouveau processus depuis le store persistant |
| 3 | AEIS | `test_approve_run_deferred_promotion.js`: `approveRun()` refuse les reçus non authentifiés et accepte deux acteurs indépendants avec signatures et obligations vérifiées; `test_aeis_production_adapters.js` : vraie suite du dépôt exécutée deux fois, assemblée signée relue dans un autre processus SQLite, altérations refusées | Cas d'indisponibilité et de falsification sur le parcours de promotion ; les avis multi-fournisseurs restent `advisoryOnly` et ne promeuvent jamais | Cas positif et négatif E2E avec reçus réels persistés et rapport signé |
| 4 | Causalité procédurale | Primitive `causal_diff` branchée aux forks/diffs et analyses persistés; `test_causal_primitive_persistence.js` passe | Valider le replay après interruption sur runner contrôlé et préciser la portée d'attribution; une analyse bornée ne prouve pas une causalité générale | E2E reproductible d'une divergence connue, avec snapshot, runner, environnement, budget et seed conservés |
| 5 | Natural Search | `npm --prefix backend run test:natural-search` : 21 scripts passés le 2026-10-06 ; états des sept modules, prochaine décision à entrées égales, arrêt brutal, projections partielles, conflit de révision, preuve et culture durables ; `test_planning_gap.js` : 12/12 plans optimaux avec oracle BFS sur un jeu synthétique | Mesurer l'effet causal des phases 6–12 sur d'autres tâches et domaines ; le replay d'un workspace externe reste hors contrat | Reprise du checkpoint cohérent après crash démontrée ; efficacité métier à établir par mesures reproductibles à budget égal et ablations |
| 6 | Mesure NCE et foraging | POET exécute et vérifie sur snapshot, généralisation sur split disjoint; foraging navigateur local passe; `test_foraging_deadline.js` : échéance globale annulant navigation (page fermée, aucune observation tardive) et tâche image (worker tué, aucun artefact tardif) | Vérifier avec runtime/fournisseur de production et tâches web externes; GAIA n'est pas disponible dans ce checkout | E2E de production, seeds et artefacts conservés; score GAIA seulement après exécution effective |
| 7 | Indicateurs fonctionnels | Registre, reçus idempotents, workspace global, objectifs/planification allostatiques, synthèse cognitive et corrélation d'efférence MCP vérifiés par leurs tests ciblés | Définir puis mesurer les critères encore non couverts : compétition, récurrence et prédiction générative; séparer allostasie causale et synthèse de rapport des proxys actuels | Chaque résultat renvoie à une exécution mesurée; aucun indicateur n'est présenté comme preuve de conscience |
| 8 | Parcours nosologique | Catalogue complet de marqueurs; diagnostics synchronisés, types validés, autorisation liée à la cellule/génome/état/reçu source; CLI et exécuteur durable branchés | Rejouer le parcours HTTP → Rust après résolution des limites de stockage et PDB Windows; conserver le statut proposé des mécanismes biologiques détaillés | Les tests ciblés prouvent application, refus, absence de cible et idempotence; aucun succès avant effet persisté, aucune validation globale déclarée |

## 4. Règle anti-surpromesse

- Un calcul de tension n'est pas un consensus distribué.
- Un identifiant de pipeline ne signifie pas qu'un pipeline est compilé.
- Une constante `latency_micros: 2` n'est pas une latence mesurée.
- Un chiffrement par décalage n'est pas une garantie cryptographique.
- Un `PATCH_DEPARTURE` calculé ne prouve pas une navigation.
- Une lease autorise un appel ; elle ne prouve pas une boucle intégrée.

## Voir aussi

- [../natural-search-control-plane.md](../natural-search-control-plane.md) — contrat durable, preuves et limites des phases 6–12.
- [inventaire-biologique.md](inventaire-biologique.md) — chemins de code.
- [cellulaire-specialise.md](cellulaire-specialise.md) — limites détaillées.
- [sens-animaux.md](sens-animaux.md) — limites détaillées.
