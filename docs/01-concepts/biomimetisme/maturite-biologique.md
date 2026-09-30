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
| Reçu d'exécution du tick Rust | intégrée partielle | `tick_and_persist` + journal Rust réouvrable; `biologicalExecutionReceiptService.ingestBiologicalReceipt` persiste de façon idempotente et lie un état d'homéostasie existant (`backend/tests/test_biological_receipt_bridge.js`) | transport Rust/backend connecté en production, identité cellule/génome réellement exécutantes, et corrélation rejouable si l'homéostasie est écrite après le reçu |
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
| Organisme de mission | documentée → intégrée partielle | orchestrateur + store, snapshots | continuité après redémarrage prouvée |
| Foraging web, fovéation | intégrée expérimentale | session Puppeteer MCP, crop Sharp, `foragingLoopService`; E2E validé sur serveur local contrôlé | tâches web réelles contrôlées, mesure de qualité sémantique et évaluation GAIA, voir `web-foraging.md` |

Aucune capacité ci-dessus n'est « validée » au sens bout en bout avec
artefacts reproductibles conservés. Le journal durable Rust vérifie la
persistance et l'intégrité des lots, mais ne prouve pas le pont avec le backend
ni l'identité cellule/génome. Le test backend couvre la durabilité de
l'autorité et des transitions sans prouver ce pont. Les documents qui
annonçaient « Implémenté » pour les cellules spécialisées et les super-sens
sont corrigés en « primitive ».

## 3. Backlog fondé sur les preuves

Les lots ci-dessous ordonnent les lacunes observées; ils ne signifient pas que
les travaux sont démarrés. Une capacité ne progresse de niveau qu'après
vérification du chemin, du test et, pour « validée », des artefacts conservés.

| Ordre | Lot | Preuve d'entrée | Travail à planifier | Critère de sortie |
| --- | --- | --- | --- | --- |
| 0 | Revue de la grille | Revue documentaire 2026-09-30; nouveaux contrôles ingestion tenant, corrélation tardive, promotion fail-closed et benchmark archivé | Réviser les statuts à chaque changement et conserver les distinctions entre primitives, intégrations et résultats mesurés | Chaque statut renvoie au point d'entrée et à un test ou une limite explicitement constatée |
| 1 | Reçu biologique durable inter-runtime | Endpoint `/api/rust/biological-receipts` authentifié et limité au tenant; ingestions idempotentes; rattachement différé à l'homéostasie; `npm --prefix backend run test:biological-bridge` passe | Ajouter un client Rust qui expédie le journal après redémarrage et authentifie l'origine du processus. Les opérations `organism` n'attestent toujours pas de cellule/génome exécutants | E2E Rust→backend après redémarrage, mission autorisée et coût concordant; contrôle d'identité cohérent de bout en bout |
| 2 | Continuité de mission | `npm --prefix backend run test:biological-bridge` couvre remplacement, mismatch de réveil, réveil concurrent (un seul gagnant), dispatch échoué et reprise après échec | Tester la succession concurrente de l'identité d'orchestrateur et la persistance du rattachement après redémarrage | Successeur unique, état de mission et snapshot cohérents après redémarrage |
| 3 | AEIS | Parcours runtime, fournisseurs distincts, recrutement et isolation de processus testés; `approveRun()` reste fail-closed si les preuves signées indépendantes manquent | Rendre les fixtures DB du test de promotion conformes au contrat : deux acteurs de vérification indépendants, reçus signés liés à chaque obligation, nonce non rejoué; valider un cas accepté et un cas refusé | E2E bon/bloqué de `approveRun()` avec reçus signés, preuves liées au rapport et refus des avis consultatifs non authentifiés |
| 4 | Causalité procédurale | Primitive `causal_diff` branchée aux forks/diffs et analyses persistés; `test_causal_primitive_persistence.js` passe | Valider le replay après interruption sur runner contrôlé et préciser la portée d'attribution; une analyse bornée ne prouve pas une causalité générale | E2E reproductible d'une divergence connue, avec snapshot, runner, environnement, budget et seed conservés |
| 5 | Natural Search | Sept modules restaurés après réouverture SQLite; benchmark adapté à 120 expansions : GenOS 10/12, ToT 10/12 (`2026-09-30-adaptive-beam.json`) | Réduire les écarts de qualité des plans sur `bw-swap` et `bw-tower-5`; `bw-table-6` et `trap-far-key` restent non résolus par tous les contrôleurs. La reconstruction depuis l'historique complet reste hors contrat | Résultats reproductibles à budget égal et amélioration des longueurs/échecs communs, sans plan invalide |
| 6 | Mesure NCE et foraging | `npm --prefix backend run test:nce` passe; le test Puppeteer de foraging expire à 30 s même avec proxy désactivé | Diagnostiquer l'accès loopback du navigateur dans l'environnement de test; démarrer POET avec le runtime réel; mesurer généralisation sur tâches distinctes. Ablations encore prototypes | Navigation locale E2E stable, tâche distincte pour la généralisation, graines et artefacts conservés; GAIA seulement après exécution effective |
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
