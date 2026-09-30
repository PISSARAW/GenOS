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
| 0 | Revue de la grille | Matrice §2 et références de code/tests de cette fiche | Revalider chaque ligne contre le code courant; corriger statut, preuve et lacune, puis maintenir cette matrice comme backlog de référence | Chaque statut renvoie à un chemin et à un test existants; les propositions restent explicitement séparées |
| 1 | Reçu biologique durable inter-runtime | Journal Rust réouvrable et contrôlé contre altération; ingestion backend idempotente et associée à l'état d'homéostasie courant | Connecter le transport; définir l'identité cellule/génome sans inférer un exécutant à partir du snapshot; gérer la corrélation homéostatique tardive | Test E2E après redémarrage reliant journal, mission, coût et transition homéostatique; authentification de l'ingestion et refus fail-closed des identités invalides |
| 2 | Continuité de mission | Services de régénération, dormance/réveil et succession; parcours de persistance existants | Tester concurrence, redémarrage, condition incorrecte, dispatch échoué et remplacement | Tests d'intégration ciblés couvrant succès, refus et reprise sans doublon |
| 3 | AEIS en production | Pont AEIS → promotion présent; services multi-provider, niches et métapopulations référencés sans appel de production établi | Choisir les points d'appel; authentifier leases/votants; persister reçus; compléter feedback homéostatique du ré-arbitrage | Parcours promotion E2E avec providers isolés, preuve authentifiée, reçu durable et refus fail-closed |
| 4 | Causalité procédurale | Services replay, `causalDiff` et analyse multi-snapshots présents; branchement runtime non établi | Relier à un parcours produit et borner les variables attribuables aux snapshots, runner, environnement et seeds | E2E sur divergence connue; rapport reproductible séparant observations, hypothèses et attribution |
| 5 | Natural Search | La fiche signale états des phases 6–12 non réhydratés et planning gap non fermé | Réhydrater les états opérationnels manquants; rejouer le benchmark documenté et mesurer le gap | Test de redémarrage et benchmark reproductible avec données et résultat conservés |
| 6 | Mesure NCE et foraging | NCE contractuelle/prototype; foraging local contrôlé; portée GAIA et qualité sémantique non démontrées | Mesurer généralisation et phénotype persistant; exécuter tâches web contrôlées, score de qualité et évaluation GAIA | Protocole, seed, entrées, métriques et artefacts conservés; conclusions limitées aux résultats obtenus |
| 7 | Indicateurs fonctionnels | Plusieurs critères partiels; aucun ne constitue une preuve de conscience | Définir tests opérationnels pour workspace, compétition, récurrence, prédiction générative, allostasie causale et synthèse | Chaque critère a une mesure vérifiable; la synthèse LLM est distinguée des mesures runtime |
| 8 | Parcours nosologique | Opérateurs Rust bornés et explicitement routés; exposition MCP/CLI et diagnostic → thérapie non attestés; propositions §4.2 | Maintenir la distinction entre opérateurs présents, appels explicites, interfaces et propositions; spécifier leases/gates avant toute nouvelle intégration | Vue d'ensemble concordante avec les points d'entrée vérifiés et tests des refus/préconditions |

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
