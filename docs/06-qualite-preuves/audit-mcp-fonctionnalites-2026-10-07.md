# Audit fonctionnel du MCP GenOS — 2026-10-07

## Objet et méthode

Cet audit vérifie le MCP présent dans le checkout au 7 octobre 2026. Il distingue :

- la présence dans le catalogue ;
- la routabilité réelle ;
- le contrat d’arguments et les contrôles de sécurité ;
- l’exécution métier observée ;
- les dépendances externes ou les préconditions manquantes.

Une ligne `tools/list` ou un transport JSON-RPC accepté ne constitue pas une preuve de réussite métier.

Sources principales : `shared/toolDefinitions.json`, `mcp/toolCallHandler.js`, `mcp/index.js`, `crates/genos-mcp/src/main.rs`, `backend/src/services/mcpToolRegistry.js` et `docs/03-reference/outils-mcp.md`.

## Résultats de campagne

| Vérification | Résultat |
|---|---|
| Catalogue canonique JS | 48 outils |
| Catalogue JS/Rust et contrats | OK, 48/48 |
| Routage JS | OK, 48/48 |
| Smoke autonome JS | OK |
| Registre backend | OK |
| Lease, deny-list et appels directs | OK |
| Validation des chemins et arguments | OK dans les suites dédiées |
| Tests MCP backend ciblés | 35 OK / 0 en échec sur 35 (avec lease/exposition de développement) |
| Suite package `mcp` | OK : lease, identité, parité, routage, sampling, fallback, développement |
| Profil backend `test:mcp` | OK : 6/6 suites, HTTP et transports explicites inclus |
| Tests HTTP MCP | OK hors sandbox : transport et notifications d’échec |
| Tests Rust `genos-mcp` | OK : 21/21 |
| Tests autonomes `mcp/` conformance + smoke | OK |
| Gate qualité Python | 5495 fichiers, 4 violations connues, 0 nouvelle |
| Pont Rust/Node/Codex | OK avec `NODE_ENV=development` |

Commandes exécutées :

```text
cd mcp && npm test
cd mcp && npm run test:smoke
npm run test:mcp --prefix backend
cargo test -p genos-mcp
cargo build -p genos-mcp
NODE_ENV=development node backend/tests/test_mcp_codex_bridge.js
```

## Matrice des outils publics

Toutes les lignes ci-dessous ont passé le test de catalogue/route (`mcp/test_tool_routing.mjs`) et le contrat de parité des 48 outils. `Route` signifie que le dispatch dédié existe ; `E2E` signifie qu’un test d’exécution métier correspondant a fourni un résultat exploitable.

### Fossilisation

| Outil | Fonction | Route | E2E |
|---|---|---:|---:|
| `genos_fossil_record` | Enregistre une lignée éteinte comme fossile immuable. | OK | OK : `test_fossilization_mcp.js` avec exposition de développement |
| `genos_fossil_list` | Liste les fossiles du tenant. | OK | Non qualifié |
| `genos_fossil_strata` | Liste les strates datées. | OK | Non qualifié |
| `genos_fossil_excavate` | Exhume avec contrôle d’intégrité. | OK | Non qualifié |
| `genos_fossil_decode` | Décode les marqueurs résiduels. | OK | Non qualifié |
| `genos_fossil_candidate` | Produit un candidat non promu. | OK | Non qualifié |

Le test `backend/tests/test_fossilization_mcp.js` passe avec l’exposition de développement active.

### Orchestration et coordination

| Outil | Fonction | Route | E2E |
|---|---|---:|---:|
| `genos_orchestrate` | Lance ou poursuit une mission autonome. | OK | Contrat/dispatch ; succès de mission non prouvé par `accepted` |
| `genos_delegate_worker` | Délègue une sous-tâche isolée et bornée. | OK | Contrat/dispatch |
| `genos_change_strategy` | Change la stratégie active. | OK | Contrat/dispatch |
| `genos_report_progress` | Publie une progression ou un blocage. | OK | Contrat/dispatch |
| `genos_change_organization` | Modifie la topologie de communication. | OK | Contrat/dispatch |
| `genos_organization_state` | Lit la topologie et les liens visibles. | OK | Contrat/dispatch |
| `genos_worker_publish` | Publie un signal structuré. | OK | Contrat/dispatch |
| `genos_worker_inbox` | Lit l’inbox autorisée du worker. | OK | Contrat/dispatch |
| `genos_trinity_launch` | Lance des mondes Trinity comparatifs. | OK | Contrat/dispatch |
| `genos_a_team_preview` | Compose une équipe A-Team. | OK | Contrat/dispatch |
| `genos_biological_mode` | Déploie une topologie biologique. | OK | Contrat/dispatch |
| `genos_philosophy` | Lit le registre philosophique et évalue en lecture seule. | OK | OK : `test_philosophy_mcp_integration.js` |

Les trois actions longues (`orchestrate`, `delegate_worker`, `biological_mode`) passent en arrière-plan par défaut. `accepted` signifie lancement accepté, jamais mission validée.

### Workspace et reproductibilité

| Outil | Fonction | Route | E2E |
|---|---|---:|---:|
| `genos_snapshot` | Crée un checkpoint adressé par contenu. | OK | Contrat et validation des chemins OK |
| `genos_replay` | Rejoue un snapshot validé. | OK | Contrat de replay OK ; exécution complète dépend d’un snapshot |
| `genos_capsule_create` | Crée une capsule copy-on-write. | OK | Contrat OK ; exécution complète dépend d’un snapshot |
| `genos_merge` | Fusionne une branche sous invariants. | OK | Route présente ; opération destructive non lancée sans branche de test |
| `genos_audit` | Audite un snapshot ou une lignée. | OK | Contrat OK ; artefact dépend d’un snapshot |
| `genos_biomimicry` | Appelle une fonctionnalité biomimétique native. | OK | Capability runtime spécialisée OK |
| `genos_v2_init` | Initialise l’état GenOS. | OK | Pont Rust/Node OK |
| `genos_v2_fork` | Forke un état en branche isolée. | OK | Contrat OK ; dépend d’un parent réel |

### Signaux et décisions biologiques

| Outil | Fonction | Route | E2E |
|---|---|---:|---:|
| `genos_signal_publish` | Publie un signal zero-text. | OK | Tests signal ciblés présents |
| `genos_signal_read` | Lit les signaux non lus. | OK | Tests signal ciblés présents |
| `genos_signal_purge` | Purge les signaux expirés. | OK | Contrat/dispatch |
| `genos_signal_ground` | Enregistre un grounding typé. | OK | Contrat/dispatch |
| `genos_signal_electrocyte_vote` | Vote electrocyte/Kuramoto. | OK | Contrat/dispatch |
| `genos_signal_chemotactic_follow` | Suit un gradient chimiotactique. | OK | Contrat/dispatch |
| `genos_signal_plasmid_transfer` | Transfère une décision par HGT. | OK | Contrat/dispatch |
| `genos_signal_collective_decision` | Coordonne une décision collective. | OK | Contrat/dispatch |

Les tests `test_signal_publish_handler.js`, `test_signal_plane_e2e.js`, `test_signal_delivery_api_contract.js` et `test_signal_truthful_outcomes.js` couvrent le sous-système signal, mais ne constituent pas une preuve indépendante de chaque combinaison de paramètres MCP.

### Topologie, primitives et stratégie

| Outil | Fonction | Route | E2E |
|---|---|---:|---:|
| `genos_topology_session` | Inspecte ou modifie une session Syncytium/Rhizome/Biome. | OK | OK : lease topology et morphogenèse |
| `genos_execute_primitive` | Exécute une primitive enregistrée. | OK | Contrats stratégie et registre OK |
| `genos_execute_strategy_pipeline` | Exécute une pipeline ordonnée. | OK | Contrats stratégie et registre OK |

Les primitives inconnues sont refusées. Le dispatch générique ne prouve pas que chaque primitive déclarée possède une implémentation métier complète.

### Mémoire, diagnostic et provenance

| Outil | Fonction | Route | E2E |
|---|---|---:|---:|
| `genos_search_failures` | Recherche des échecs mémorisés. | OK | Route backend présente |
| `genos_diagnose` | Enregistre des hypothèses falsifiables. | OK | Contrat présent |
| `genos_analyze_trajectory` | Mesure répétition et stagnation. | OK | Contrat présent |
| `genos_record_decision` | Persiste une décision et ses preuves. | OK | Contrat présent |
| `genos_record_experience` | Persiste une expérience et sa provenance. | OK | Route stratégie présente |
| `genos_compile_memory` | Compile faits, décisions et échecs. | OK | Route stratégie présente |
| `genos_blame` | Lit la provenance télémétrique. | OK | Route stratégie présente |

Ces outils ne certifient pas les faits fournis par le client et n’autorisent pas à eux seuls une promotion.

### Interaction et vision

| Outil | Fonction | Route | E2E |
|---|---|---:|---:|
| `genos_browser_act` | Agit dans un navigateur borné. | OK | Route backend ; service externe requis |
| `genos_computer_use` | Exécute une boucle écran/modèle/action. | OK | Route backend ; service externe requis |
| `genos_foveal_crop` | Focalise ou recadre une image. | OK | Route backend ; service externe requis |
| `genos_optimal_foraging` | Exécute une recherche écologique bornée. | OK | Route backend ; service externe requis |

## Échecs observés et interprétation

### Conditions d’exécution

- Les tests HTTP et sampling nécessitent des ports localhost ; ils passent hors sandbox.
- Le test Rust de chemin relatif passe hors sandbox ; le refus observé dans le runner sandboxé était environnemental.
- Le pont Rust/Node exige `NODE_ENV=development` pour `GENOS_MCP_EXPOSE_ALL=true`; en production, l’exposition globale reste refusée conformément à la politique.
- `mcp/test_mcp_conformance.mjs` passe après alignement de son assertion sur le catalogue Rust séparé dans `src/tools/base_specs.rs`.

### Limites fonctionnelles constatées

Les 35 tests backend MCP ciblés passent désormais avec l’exposition de développement active. Les fixtures de statut fournissent les identifiants obligatoires ; les handlers temporels non implémentés sont testés comme refus honnêtes plutôt que comme succès simulés. En particulier, `genos_temporal_consciousness_transfer` retourne `success: false` et `status: not_implemented`, conformément à son contrat `reference_only`.

La validation de `genos_snapshot` et des champs déclarés dans `REQUIRED_STRINGS` a été corrigée pendant cet audit. Le scan immunitaire est désormais exécuté avant la décision de permission et `test_immune_mcp_gate.js` passe. `test_mcp_api_contracts.js` et `test_genome_mcp.js` passent désormais avec l’exposition de développement active ; sans lease, `listTools()` retourne volontairement une liste vide.

Les deux corrections de code sont dans `backend/src/services/mcpArgumentValidation.js` et `backend/src/services/mcpExecutor.js`. Elles sont couvertes par les tests de contrat, de permissions, de dispatch direct et de bridge Rust/Node.

Tous les tests MCP ciblés sont désormais verts. La seule limite fonctionnelle documentée est le transfert de conscience, qui ne restaure pas de runtime et retourne volontairement `not_implemented`.

## Conclusion

Le MCP GenOS est qualifié sur sa campagne dédiée : catalogue, parité, routage, leases, validation, sandbox, transports HTTP/stdio, bridge Rust/Node, 35/35 tests backend ciblés et 21/21 tests Rust sont verts. Une limite fonctionnelle est explicitement conservée pour le transfert de conscience, qui refuse honnêtement toute prétention de restauration runtime.

La qualification MCP est complète pour le périmètre testé. Les suites générales du monorepo restent indépendantes de cet audit.
