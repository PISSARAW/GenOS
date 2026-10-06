# Maturité des capacités biologiques

- **Statut** : Référence — grille d'évaluation, pas revendication.
- **Dernière revue** : 2026-10-06.
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

## 3. Matrice actuelle (revue 2026-10-05; clinique actualisée le 2026-10-06)

| Capacité | Classification | Statut (ancien) | Chemin et preuve observée | Lacune restante |
| --- | --- | --- | --- | --- |
| Cellule `AgentCell`, division | primitive | primitive | `crates/genos-cell`, tests crate | appel par un chemin mission avec reçu |
| Génome, mutations, crossover | primitive | primitive | `crates/genos-genome`, tests crate | replay de lignée via runtime |
| Épigénétique | primitive | documentée → primitive partielle | `epigenome.rs`, tests crate | lien prouvé avec expression réelle des capacités |
| Métabolisme `MetabolicPool` (registre computationnel) | primitive | primitive | `autopoiesis.rs`, tick cellulaire | registre commun + enforcement aux points d'exécution |
| Reçu d'exécution du tick Rust | validated | validée sur SQLite local | `biologicalExecutionReceiptService.js`, `rustPopulationRegistry.js`; `test_biological_ingestion_atomic.js` vérifie origine, remapping mission et atomicité population/reçus; `test_biological_tick_rust_backend_e2e.js` exécute deux CLI compilés et contrôle tick croissant, cellule/génome stables, coût ATP, résultat et fille après reprise | transport HTTP signé en déploiement distribué; [bilan de compilation/E2E](../../06-qualite-preuves/validation-biologie-computationnelle.md) |
| Reçu du worker exécutant | validated | validée sur SQLite local | `strategyExecutionService.js` → `biologicalWorkerReceiptService.js`; `test_biological_worker_receipts.js` et `test_biological_worker_restart.js` : procédure réelle, cellule stable, génome figé, coûts, gates, rejeu et reprise sur plusieurs processus | fournisseur externe et facture USD certifiée non couverts; aucune conversion ATP/tokens/USD |
| Homéostasie de mission (contrôle borné) | validated | validée sur SQLite local | `homeostasisAuthorityStore.js`, `homeostasisPolicyService.js`, `homeostasisClosureService.js`; tests d'autorité durable et de reprise : révisions, seuils v2, preuves dérivées, reçus de transition v2 et refus d'une clôture périmée, y compris en SQL direct | disponibilité multi-instance non démontrée; périmètre et commandes dans le [bilan](../../06-qualite-preuves/validation-biologie-computationnelle.md) |
| Neurobiologie, glie, quorum | integrated | intégrée partielle | `GenosEcosystem::record_event` → événements mission (`BIOLOGICAL_EXECUTION_RECEIPT`, action instinctive, reproduction) → `MISSION_NEURO_GLIA_QUORUM_RESPONSE`; réponse astrocytaire et myélinisation reportées sur le neurone, quorum compté sur les cellules actives | état glial événementiel simplifié, événements en mémoire, pas de preuve distribuée ni d'artefacts E2E persistés |
| Instinct PAF | integrated | intégrée partielle | `GenosEcosystem::tick` évalue les instincts (`crates/genos-orchestrator/tests/instinct.rs`, `tick_evaluates_instincts_automatically`); tests du module couvrent seuils, veto d'outil et résultats | reçu durable du stimulus, de la décision et de l'action; parcours mission/backend E2E |
| Sens VNO, électro, Cluster N, tectum, écho | primitive | primitive | modules `sensory/*`, tests locaux | adaptateurs concrets ou typage « signal synthétique » |
| Immunité, pathologie, thérapie | integrated | intégrée partielle pour la clinique Rust | Catalogue des 28 conditions et 48 opérateurs; diagnostic au tick, autorisation signée et persistance avant mutation mémoire; [103 tests Rust ciblés réussis](../../06-qualite-preuves/validation-nosologie.md) | Parcours HTTP → Rust complet non validé dans la campagne du 2026-10-06; les autres capacités immunitaires gardent leurs preuves propres |
| Écologie, tissus, spores | primitive | primitive | modules biology | registre de population durable + provenance |
| Reproduction | integrated | intégrée partielle | cycle autonome dans `GenosEcosystem`; `genos.reproduction-event/v1` porte seed, mutations et empreintes parent/fille (`crates/genos-orchestrator/tests/reproduction_cycle.rs`) | rattachement durable à mission/cellules, persistance après redémarrage et replay de lignée E2E |
| Fossilisation | integrated | intégrée partielle | registre Rust et tests d'intégrité dans `crates/genos-store`; service backend avec tests `backend/package.json` (`test:fossilization`) | preuve E2E de provenance reliant artefact fossile, événement source et lignée après redémarrage |
| Cnidocyte | integrated | intégrée partielle | `mcpExecutor.execute` → `screenCnidocyteThreat`; `node backend/tests/test_mcp_cnidocyte_runtime_gate.js` | attaques au travers d'un transport configuré et artefacts de benchmark conservés |
| Électrocyte | integrated | intégrée partielle | `GenosEcosystem::discharge_electric_under_quorum`; tests quorum actif/expiré | identité authentifiée des votants et timeout mesuré sur collecte distribuée |
| Choanocyte | integrated | intégrée partielle | `GenosEcosystem::filter_stream` émet `CHOANOCYTE_STREAM_FILTERED` avec scans, rétention, pertes et débit calculé | flux mission E2E et artefacts persistés/benchmarkés |
| Iridophore | integrated | intégrée partielle | `GenosEcosystem::render_polymorphic` émet `IRIDOPHORE_RENDERED` et vérifie la forme correspondant à la perspective demandée | validation perceptuelle et camouflage non cryptographique |
| Cellule de garde | integrated | intégrée partielle | `GenosEcosystem::throttle_flux` régule selon l'ATP disponible, débite le flux admis via `Metabolism::consume_for` et ferme en famine | preuve mission E2E et persistance des reçus métaboliques |
| Trachéide | integrated | intégrée partielle | `GenosEcosystem::ossify_pipeline` émet un plan d'exécution versionné et compare coût/débit sur une entrée identique avant et après ossification | compilation en binaire natif et mesures benchmarkées répétables |
| Procaryote / HGT | integrated | intégrée partielle | `hgt_transfer_under_lease` lie le transfert à une mission, un donneur, un receveur et un plasmide; usage consommé, révocation explicite et refus sans lease | identité authentifiée du lease, persistance et intégration MCP/worker |
| Organisme de mission (identité runtime) | integrated | intégrée partielle | `missionIdentityService.attachOrchestrator` atomique; `test_mission_succession_processes.js` : deux processus sur SQLite WAL partagé, un seul successeur exécutable, perdant et ancien orchestrateur bloqués, réservation reprise après kill | déploiement multi-instance réel |
| État clinique | integrated | intégrée partielle | État Node persistant distinct des AgentCell Rust; nosology_authorization vérifie quatre cas de contexte, reçu, restauration et rejeu; CLI et validations Node ciblées réussies | [Bilan du 2026-10-06](../../06-qualite-preuves/validation-nosologie.md) : HTTP → Rust non validé et contrôles globaux non verts; révocation générale et chaînage automatique de mission non attestés |
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
