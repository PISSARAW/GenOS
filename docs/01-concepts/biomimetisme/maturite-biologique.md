# Maturité des capacités biologiques

- **Statut** : Référence — grille d'évaluation, pas revendication.
- **Dernière revue** : 2026-10-01.
- **Règle** : un statut exige le chemin de code et le test cités. Sans les
  deux, le statut est « proposition ».

## 1. Niveaux

- **documentée** : concept ou contrat décrit dans `docs/`, sans preuve d'appel.
- **primitive** : fonction locale testée (`cargo test -p <crate>`), non appelée
  par un chemin runtime.
- **intégrée** : appelée par un chemin réel du runtime (CLI, backend, MCP,
  orchestrateur), avec lease et permissions quand il s'agit d'un effet.
- **intégrée partielle** : un chemin de runtime et sa frontière d'autorité sont
  vérifiés, mais une étape du cycle de vie ou une preuve de tâche durable manque.
- **validée** : résultat mesuré par un test bout en bout ou un benchmark
  reproductible (commande, seed, artefacts conservés).

## 2. Matrice actuelle (revue 2026-10-01)

| Capacité | Statut | Chemin et preuve observée | Lacune restante |
| --- | --- | --- | --- |
| Cellules `AgentCell`, division et reproduction | intégrée partielle | `GenosEcosystem::tick` exécute la reproduction; l'action backend `divide: true` appelle aussi `divide_for_mission`, puis persiste le reçu parent/fille, les génomes, la lignée et le coût dans `biological_execution_receipts`; `cargo test -p genos-orchestrator mission_division --lib -j 1` et `node backend/tests/test_biological_receipt_bridge.js` vérifient le producteur Rust et l'ingestion/idempotence/reprise SQLite | la division autonome déclenchée par le tick n'émet pas encore ce reçu de lignée; l'opt-in backend n'a pas encore d'E2E exécuté avec une binaire CLI recompilée |
| Génome et mutations | intégrée partielle | incarnation Node via `agentIncarnationService` et sélection de gènes par affectation; snapshots Rust reprennent cellule/génome stables via `npm run test:biological-receipts` depuis `backend/` | prouver le replay de lignée complète et relier l’identité du worker effectivement dispatché |
| Épigénétique | intégrée partielle | `agentDna/express` applique les marques avant le phénotype; `computeLease` exclut les capacités méthylées; `node backend/tests/test_agent_dna_integration_closure.js` | persister une incarnation et démontrer l’effet sur une tâche après redémarrage |
| Métabolisme et reçus d’exécution Rust | intégrée partielle | `runMissionTick` appelle le CLI Rust, associe une UUID stable à la mission backend et ingère les reçus idempotents avec cellule, génome, empreinte, ATP et tick; l’E2E lance deux processus CLI et vérifie SQLite via `npm run test:biological-receipts` | le tick attribue encore l’exécution à la cellule racine Rust, pas à chaque worker backend; relier dépense et réservation `executionBudget` |
| Homéostasie de mission | intégrée partielle | contrats/révisions et reçus de transition dans `homeostasisService`; `node backend/tests/test_homeostasis_authority_receipts.js` | corréler les transitions d’homéostasie aux reçus Rust et à l’identité du worker |
| AEIS, vérification multi-provider et recrutement de niche | intégrée partielle | branche runtime dans `epistemicHolobionteService`; rétroaction pression/delta de preuve dans `epistemicHomeostaticArbitration`; `node backend/tests/epistemic_holobionte_test.js` et `node backend/tests/test_aeis_homeostatic_arbitration.js` | E2E avec fournisseurs configurés en production et reçus indépendants persistés |
| Causalité procédurale | intégrée partielle | primitives runtime exposent création d’expérience/forks, replay, diff, analyse multi-snapshots et graphe; les bras control/intervention sont persistés; `node backend/tests/test_procedural_causal_runtime_handlers.js` passe | répéter le replay après interruption d’un processus sur runner de production; l’attribution reste limitée aux liens observés |
| Continuité de mission et succession | intégrée partielle | `test_mission_continuity.js` vérifie un seul successeur et la réouverture SQLite; `test_survival_dormancy.js` couvre réveil après redémarrage, mauvais signal et échec de reprise; `test_mission_replacement_continuity.js` vérifie dispatch échoué, succès et rattachement durable | valider le dispatcher externe en multi-instance et le redémarrage complet du backend |
| Neurobiologie et glie | intégrée partielle | `pre_deliberation` transmet des signaux bornés au `NeuroLab`; tests Rust vérifient signal mesuré et refus des valeurs non finies | glie/quorum ne constituent pas une autorisation distribuée; événements et effet restent locaux |
| Instincts PAF | intégrée partielle | `tick.rs::pre_deliberation` appelle `run_instincts`, contrôle les outils autorisés et journalise l’issue; tests Rust du runtime instinctif | relier stimuli authentifiés, décision, action réelle et reçu durable |
| Sens biologiques | intégrée partielle | `animal_sensory_runtime.rs` typé et testé contre signaux synthétiques invalides | adaptateurs vers observations authentifiées de mission |
| Immunité et quarantaine | intégrée partielle | `agentIncarnationService` appelle `missionQuarantineGate`; `node backend/tests/test_mission_quarantine_gate.js` vérifie refus et état après réouverture SQLite | démontrer le refus au dernier dispatcher de worker et auditer la permission dans le reçu de mission |
| Écologie, tissus et population | intégrée partielle | sessions/populations persistées par `biomeSessionStore`; `node backend/tests/test_biome_population_restart.js` et `node backend/tests/test_topology_session_persistence.js` | provenance de fitness calculée à partir d’exécutions d’agents réelles et permissions de chaque transition |
| Cycle des spores | intégrée partielle | checkpoint Rust restaure spores, génomes, tissus, directeur et ATP; test `checkpoint_recovery` couvre reprise et lignée | autorisation de germination liée à la mission et ingestion backend du reçu parent/enfant |
| Fossilisation et provenance | intégrée partielle | services/store Rust et backend ont des tests d’intégrité (`npm run test:fossilization` depuis `backend/`) | démontrer le replay durable reliant artefact, événement source et lignée |
| Cnidocyte | intégrée partielle | `mcpExecutor.execute` appelle `screenCnidocyteThreat`; `node backend/tests/test_mcp_cnidocyte_runtime_gate.js` | benchmark d’attaques traversant un transport configuré; le filtre n’est pas une protection générale |
| Électrocyte | intégrée partielle | action MCP `electrocyte::voltage` protégée par scope exact et mesurée; `node backend/tests/test_mcp_biomimetic_capability_runtime.js`; quorum Rust testé séparément | relier la décharge quorum-gated au dispatcher de mission avec votes authentifiés et reçus persistés |
| Choanocyte | intégrée partielle | action `choanocyte::sift` autorisée sous scope exact, débit/rétention retournés; test MCP spécialisé | flux de mission réel et mesures répétées de pertes/débit |
| Iridophore | intégrée partielle | actions `shift` et `render` passent par MCP/CLI sous leases distinctes; test MCP spécialisé | consommateur de mission, validation perceptuelle et effet durable; camouflage non cryptographique |
| Cellule de garde | intégrée partielle | le tick ajuste le budget de planification selon l’ATP et enregistre un reçu de backpressure; test Rust ciblé; le test runtime spécialisé exerce aussi l’épuisement métabolique | mesurer le signal de stress d’une mission backend et persister ce reçu avec l’identité exécutante |
| Trachéide | intégrée partielle | `ossify_pipeline` génère un plan versionné et mesure coût/débit; action MCP/CLI sous scope exact, test MCP spécialisé | compiler/exécuter un artefact natif et répéter un benchmark comparatif |
| Procaryote et HGT | intégrée partielle | chemin MCP vérifie lease/arguments; chemin Rust refuse le transfert sans lease et vérifie mission, donneur, receveur, plasmide; `cargo test -p genos-orchestrator --test specialized_cell_runtime -j 1` et test MCP | prouver révocation, provenance persistée et reprise de la relation parent/enfant |
| État clinique et thérapie | intégrée partielle | `clinicalStateService` persiste l’état et son test rouvre SQLite | relier une identité de cellule durable et un contrôle d’autorisation avant toute thérapie Rust |
| POET/NCE et transfert de phénotype | intégrée expérimentale | `node backend/tests/test_nce_culture_tasks_durable.js` passe trois workflows d'intégration contrôlés; le score résumé passe de 0 à 1 après transfert et le vecteur phénotypique est identique après réouverture SQLite | mesurer des tâches utilisateur/domaines externes et séparer causalement transfert, mémorisation et adaptation; les ablations restent des prototypes |
| Web foraging et fovéation | intégrée expérimentale | `node backend/tests/test_foraging_browser_runtime.js` observe, croppe, navigue sur serveur local et trouve les deux réponses liées (2/2) | évaluer des sites externes autorisés et la qualité sémantique; aucun résultat GAIA n’est établi |

Aucune capacité n’est présentée comme une validation générale de la biologie. Les résultats E2E ci-dessus valent uniquement pour les scénarios et artefacts indiqués; une primitive, une lease ou un succès de test local ne démontre pas une généralisation en production.
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
