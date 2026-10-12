# Audit de complétude des concepts — interfaces, sécurité, exploitation

Périmètre : sections 20 à 23 de l'inventaire fourni par l'utilisateur, checkout du 12 octobre 2026. Cette revue observe le code et les preuves présentes ; elle ne certifie pas une installation de production. Les modifications de travail déjà présentes ont été conservées.

## Lecture de la matrice

Colonnes : **I** implémenté, **V** vérifié, **D** démontré, **U** utilisable, **Doc** documenté. `O` : établi dans le périmètre borné cité ; `P` : tranche ou preuve partielle ; `N` : absent ou explicitement hors de la promesse produit ; `?` : non établi par cette revue. Un concept n'est **complet** que si ses cinq cases sont `O`. Un test présent dans le dépôt sans résultat de cette revue vaut au plus `P` en V. Un guide ou un test isolé sans parcours exécuté et résultat observable vaut au plus `P` en D. Les concepts de structure (projet, mission, etc.) sont évalués comme entités opérables ; les principes ne sont pas assimilés à une interface autonome.

Contrôles exécutés : `python scripts/ci/check_code_quality.py` → code 0 à deux reprises ; dernier passage : 5 969 fichiers, 8 violations préexistantes et 0 nouvelle ; `node backend/tests/test_worker_workspace_binding.js` → PASS hors sandbox après un `EPERM realpath` en sandbox ; dans `npm test` hors sandbox sous Node 24.18.0, la suite biologie a passé 7/7 et `backend/tests/test_backend.js` a passé 57/57 appels et assertions, notamment démarrage REST, transaction WAL, authentification et rollback de workspace. La suite globale a finalement échoué sur `medical_worker` (`ORACLE_BUDGET_EXPIRED`). Le test natif des workers, relancé sous Node 22.23.3 pris en charge, échoue sur `verifier_worker` avec le même code. `cargo test --workspace` passe hors sandbox avec code 0 ; son premier essai en sandbox échouait sur une canonicalisation de chemin empêchée par l'environnement. Les verdicts `O` issus des exécutions sont bornés aux parcours réussis.

### Références de preuve

| Code | Source et portée |
| --- | --- |
| T1 | `backend/src/app.js:94-194` (montage REST, sondes, Studio, sécurité), `backend/tests/test_backend.js` (57/57 exécutés), `test_deployment_health.js`, `docs/03-reference/api-et-contrats.md` ; la présence des routes n'atteste pas chaque parcours. |
| T2 | `backend/src/grpc_services/`, `backend/proto/`, `backend/tests/test_grpc_services.js`, `test_grpc_auth_contract.js`, `docs/03-reference/api-et-contrats.md` ; qualification RPC par RPC non fournie ici. |
| T3 | `mcp/index.js`, `crates/genos-mcp/src/main.rs`, `shared/toolDefinitions.json`, `backend/tests/test_mcp_server_parity.js`, `test_mcp_direct_call_enforcement.js`, `docs/03-reference/outils-mcp.md` ; parité minimale et lease, pas chaque outil. |
| T4 | `crates/genos-cli/src/main.rs`, `g.ps1`, `g.cmd`, `crates/genos-cli/src/commands/trinity_tui/`, `docs/04-exploitation/cli-et-experience-operateur.md` ; TUI limité à ses parcours livrés. |
| T5 | `integrations/studio/`, `integrations/ide/`, `backend/tests/test_studio_browser.cjs`, `docs/03-reference/integrations-ide.md`, `docs/06-qualite-preuves/studio-qualification.md` ; les validations Studio ne couvrent pas toutes ses vues et environnements. |
| T6 | `backend/src/services/modelRouteRunner.js`, `backend/src/services/inferenceGatewayService.js`, `docs/03-reference/modeles-et-providers.md` ; fournisseur externe et performance dépendent de la configuration. |
| T7 | `backend/src/middleware/idempotency.js`, `crates/genos-store/src/event.rs`, `continuation_wal.rs`, `backend/tests/test_backend.js` (WAL/transaction exécutés), `docs/03-reference/persistance-et-donnees.md`, `docs/03-reference/resultats-formels-messagepack.md` ; formats et domaines distincts. |
| T8 | `docs/04-exploitation/observabilite.md:5-19,45-92`, `backend/tests/test_telemetry_contract.js`, `test_trace_tenant_scope.js`, `test_telemetry_otlp_bridge.js` ; télémétrie asynchrone avec pertes possibles, corrélation non universelle. |
| S1 | `backend/src/middleware/auth.js`, `tenant.js`, `backend/tests/test_backend.js` (auth HTTP exécutée), `test_agent_authority.js`, `test_tenant_membership_scope.js`, `docs/05-securite-gouvernance/identite-et-autorite.md` ; couverture des effets et retraits non universelle. |
| S2 | `backend/src/app.js:144-194`, `backend/tests/test_approval_separation.js`, `test_approval_payload_integrity.js`, `docs/05-securite-gouvernance/approbations-platform.md` ; contexte de chaque action à requalifier. |
| S3 | `backend/src/services/cedarAgentAuthority.js`, `backend/tests/test_cedar_agent_authority.js`, `docs/adr/0311-autorisation-cedar-agents.md` ; politique d'agent bornée. |
| S4 | `docs/05-securite-gouvernance/sandbox-execution-code.md:5-16,86-90,156-166`, `backend/tests/test_sandbox_primitive.js`, `test_plugin_sandbox_limits.js` ; VFS et worktree ne confinent pas du code hostile. |
| S5 | `backend/src/routes/ssoRoutes.js`, `backend/src/grpc_services/ssoService.js`, `backend/tests/test_sso_provider_disclosure.js`, `docs/05-securite-gouvernance/sso-oidc-saml.md` ; fournisseur réel et cycle de révocation à qualifier. |
| S6 | `backend/src/services/secretVault.js`, `backend/tests/test_secret_vault_kdf.js`, `docs/05-securite-gouvernance/securite.md:122-171,214` ; absence de coffre externe universel. |
| S7 | `docs/05-securite-gouvernance/conformite-et-gouvernance.md`, `docs/03-reference/contrat-produit-et-completude.md` (COMPLIANCE « prévu ») ; aucune certification réglementaire déduite. |
| O1 | `docs/04-exploitation/deploiement.md:9-19,200-237`, `docs/04-exploitation/ontogenese.md`, `backend/tests/test_daemon_territory.js` ; autostart Windows optionnel. |
| O2 | `docs/04-exploitation/resilience-et-reprise.md:5-21,58-90,217-238`, `backend/tests/test_job_retry_persistence.js`, `test_job_dead_letter.js` ; reprise locale bornée, pas continuité universelle du contexte modèle. |
| O3 | `docs/04-exploitation/resilience-et-reprise.md:492-543`, `crates/genos-orchestrator/src/checkpoint.rs`, `crates/genos-store/src/continuation_wal.rs`, `backend/tests/test_snapshot_capture_cleanup.js` ; récupération conditionnée aux checkpoints et intégrité. |
| O4 | `backend/src/routes/releaseRoutes.js`, `backend/tests/test_release_operations.js`, `test_release_promotion_truthfulness.js`, `docs/04-exploitation/releases-et-rollouts.md` ; déploiement externe et résultat réel à observer. |
| O5 | `backend/Dockerfile`, `docs/04-exploitation/deploiement.md:66-103,200-212,269,395-397` ; packaging Node et installateur Windows documentés, dépendances opérateur explicites. |

## 20. Interfaces et surfaces techniques

| Concept | I | V | D | U | Doc | Preuve / limite |
| --- | --- | --- | --- | --- | --- | --- |
| API REST | O | O | O | O | O | T1 ; serveur et appels réels 57/57 dans `test_backend.js`, sans prétendre couvrir chaque route. |
| gRPC | O | P | P | O | O | T2 ; contrats et refus par RPC à qualifier. |
| MCP | O | P | P | O | O | T3 ; ne vaut pas qualification de tous les outils. |
| MCP stdio | O | P | P | O | O | T3 ; Node et Rust, parité minimale seulement. |
| CLI Rust | O | P | P | O | O | T4 ; commandes individuelles non qualifiées ici. |
| Façade opérateur `g` | O | P | P | O | O | T4 ; shim présent, parcours spécifiques à rejouer. |
| IDE `genos.ide/v1` | P | P | P | P | O | T5 ; contrat et adaptateurs, intégration par client variable. |
| Studio | O | P | P | O | O | T5 ; plusieurs parcours bornés, pas parité intégrale. |
| TUI | P | P | P | P | O | T4 ; Trinity et autres vues spécialisées, usage général non prouvé. |
| Providers de modèles | P | P | P | P | O | T6 ; résultat dépend du provider configuré. |
| Routage local/distant | P | P | P | P | O | T6 ; fallback, autorité et qualité à qualifier par route. |
| OpenAI-compatible endpoints | P | P | ? | P | O | T6 ; compatibilité et exploitation externe non démontrées ici. |
| SQLite WAL | O | O | O | O | O | T7, O2 ; PRAGMA WAL et transaction réellement exécutés dans `test_backend.js`, portée locale. |
| Event log | O | P | P | O | O | T7 ; événements persistés, exhaustivité décisionnelle à qualifier. |
| MsgPack | P | P | ? | P | O | T7 ; format de résultats formels, pas toutes les surfaces. |
| Persistance des sessions | P | P | P | P | O | T7, O2 ; couverture dépend des types de session. |
| Observabilité | P | P | P | O | O | T8 ; événements best effort et corrélation partielle. |
| Logs d’audit | P | P | P | O | O | T8 ; pas de chaîne immuable globale. |
| Traces | P | P | P | O | O | T8 ; couverture non universelle. |
| Spans | O | P | P | O | O | T8 ; `trace_spans` persistés, instrumentation variable. |
| Request IDs | O | P | P | O | O | T8 ; corrélation HTTP, pas ID durable de workflow. |
| Trace IDs | O | P | P | O | O | T8 ; propagation non automatique sur tous les chemins. |
| Métriques par tenant | P | P | P | P | O | T8 ; portée et complétude de collecte à qualifier. |
| Health checks | O | P | P | O | O | T1, T8 ; sondes de processus/SQLite. |
| Readiness | O | P | P | O | O | T1, T8 ; ne prouve pas santé des providers externes. |
| Alertes | P | P | P | P | O | T8 ; une alerte n'est pas une notification garantie. |

## 21. Sécurité, autorité et gouvernance

| Concept | I | V | D | U | Doc | Preuve / limite |
| --- | --- | --- | --- | --- | --- | --- |
| Identité | O | P | P | O | O | S1 ; couverture des acteurs et effets variable. |
| Autorité | P | P | P | O | O | S1, S3 ; politiques par chemin, révocation en vol ouverte. |
| RBAC | P | P | P | O | O | S1 ; rôles présents, matrice effet par effet non qualifiée. |
| Scopes tenant | P | P | P | O | O | S1 ; certains consommateurs qualifiés, couverture globale ouverte. |
| Multi-tenant | P | P | P | O | O | S1 ; isolation de toutes les ressources non établie. |
| Organisation | O | P | P | O | O | S1 ; entité de gestion, autorité par action à vérifier. |
| Projet | O | P | P | O | O | S1 ; entité de gestion. |
| Workspace | O | P | P | O | O | S4 ; espace isolé logiquement, pas confinement OS fort. |
| Mission | O | P | P | O | O | S1, S2 ; enveloppe d'autorité selon le chemin. |
| Environnement | P | P | P | P | O | S2, O4 ; portée des environnements de déploiement à qualifier. |
| Release | O | P | P | O | O | O4 ; promotion soumise aux reçus. |
| Déploiement | P | P | P | P | O | O4, O5 ; effet externe dépend de la configuration. |
| Approbation humaine | P | P | P | O | O | S2 ; chemins protégés, couverture totale non établie. |
| Séparation des responsabilités | P | P | P | P | O | S2 ; tests dédiés, généralisation à contrôler. |
| Gestion du risque | P | P | P | P | O | S2, S7 ; scoring/approbation, pas garantie globale. |
| Compliance | N | N | N | N | O | S7 ; contrat produit la classe « prévu ». |
| Auditabilité | P | P | P | O | O | T8, S7 ; audit local sans non-répudiation forte. |
| Conservation des preuves | P | P | P | P | O | T7, T8 ; rétention légale/immuable absente. |
| Gouvernance des données | P | P | P | P | O | S7 ; politiques et contrôles partiels. |
| Sandbox | P | P | P | P | O | S4 ; plusieurs modes, portée de sécurité bornée. |
| Isolation | P | P | P | P | O | S4 ; worktree/VFS ≠ confinement hostile. |
| Confinement de chemins | O | P | P | O | O | S4 ; chemins normalisés et contenus, plateformes à éprouver. |
| VFS sandboxé | P | P | P | O | O | S4 ; simulation en mémoire, exécution réelle opt-in. |
| Secrets | P | P | P | P | O | S6 ; chiffrement applicatif, pas coffre externe complet. |
| CORS | O | P | P | O | O | T1, S6 ; liste d'origines configurée. |
| Authentification | O | O | O | O | O | S1 ; jeton admin accepté et jeton invalide refusé en HTTP réel dans `test_backend.js` ; autres surfaces/fédérations distinctes. |
| SSO | P | P | P | P | O | S5 ; IdP réel et révocation à qualifier. |
| OIDC | P | P | P | P | O | S5 ; implémentation callback, preuve externe non fournie. |
| SAML | P | P | P | P | O | S5 ; validation d'assertion, preuve externe non fournie. |
| Cedar | P | P | P | P | O | S3 ; autorité d'agent bornée, équivalence globale non prouvée. |
| Permission explicite | P | P | P | P | O | S1-S3 ; application/révocation sur chaque effet ouverte. |
| Autorité de plateforme | P | P | P | O | O | S2 ; contrôle des actions de plateforme, couverture à qualifier. |
| Confirmation des actions destructives | P | P | P | P | O | S2 ; certains chemins, pas preuve universelle. |

## 22. Exploitation et résilience

| Concept | I | V | D | U | Doc | Preuve / limite |
| --- | --- | --- | --- | --- | --- | --- |
| Daemon résident | P | P | P | P | O | O1 ; processus local, disponibilité dépend de l'hôte. |
| Autostart | P | P | P | P | O | O1 ; Windows opt-in, pas service système universel. |
| Sentinel | P | P | P | P | O | O1 ; supervision locale bornée. |
| Heartbeat | O | P | P | O | O | O1, O2 ; contrôle des leases/claims locaux. |
| Claims interrompus | P | P | P | P | O | O2 ; récupération de jobs persistés, non de tous les effets externes. |
| Reprise après crash | P | P | P | P | O | O2, O3 ; chemins idempotents, pas reprise universelle. |
| Redémarrage | P | P | P | P | O | O2 ; état mémoire perdu, jobs persistés récupérables. |
| Retry policy | O | P | P | O | O | O2 ; politique bornée de jobs. |
| Backoff | O | P | P | O | O | O2 ; ne couvre pas toute action externe. |
| Dead-letter | O | P | P | O | O | O2 ; jobs en échec terminal. |
| Recovery worker | P | P | P | P | O | O2 ; reprise par classes de panne. |
| Apoptose d’agent | P | P | P | P | O | O2 ; arrêt/retirement de runtime, métaphore bornée. |
| Nettoyage | P | P | P | P | O | O1, O3 ; rétention et artefacts temporaires non exhaustifs. |
| Corruption de filesystem | P | P | P | P | O | O3 ; détection/récupération de snapshots, pas restauration générale. |
| Perte de base | P | P | ? | P | O | O3, O5 ; sauvegarde opérateur nécessaire. |
| Récupération WAL | P | P | P | P | O | O3 ; continuation/checkpoints, pas rétablissement de base arbitrairement perdue. |
| Checkpoint cryptographique | P | P | P | P | O | O3 ; intégrité de certains snapshots, portée à qualifier. |
| Idempotence des appels externes | P | P | P | P | O | T7, O3 ; clé/déduplication locale, pas exactement une fois chez tiers. |
| Rollback | P | P | P | P | O | O3, O4 ; selon workspace, version et preuve. |
| Restauration | P | P | P | P | O | O3 ; contrôles préflight, limites de snapshot. |
| Rétention bornée | P | P | P | P | O | O1, T8 ; journaux hôte non couverts universellement. |
| Release | O | P | P | O | O | O4 ; entité/flux, qualification de l'effet externe distincte. |
| Rollout | P | P | P | P | O | O4 ; canary/stratégie, résultat réel dépend du déploiement. |
| Chargeback | P | P | P | P | O | O4 ; agrégat de coûts, exhaustivité fournisseur non démontrée. |
| Déploiement Docker | P | P | P | P | O | O5 ; image backend Node, Rust séparé. |
| Déploiement Windows | P | P | P | P | O | O5 ; installateur/autostart partiels. |
| Haute disponibilité | N | N | N | N | P | O5 ; architecture Node/SQLite locale, pas de garantie HA multi-nœud. |

## 23. Chaîne centrale et invariant

| Concept | I | V | D | U | Doc | Preuve / limite |
| --- | --- | --- | --- | --- | --- | --- |
| Chaîne mission → différenciation → contrat → lease → exécution isolée → observation → action bornée → reçus → preuve → falsification → décision → promotion/rejet/récupération/fossilisation | P | P | P | P | O | T1-T8, S1-S4, O2-O3 ; des mécanismes existent mais aucun parcours unique ne démontre toutes les transitions et refus à ce checkout. |
| Invariant « succès de transport ≠ décision valide » | P | P | P | P | O | `backend/tests/test_grpc_success_truthfulness.js`, `test_release_promotion_truthfulness.js`, `docs/01-concepts/epistemologie-et-evidence.md` ; vérifier chaque surface de décision. |

Les autres statuts V/D de cette matrice restent conservateurs jusqu'aux résultats des vérifications de cette revue. Les preuves documentées historiquement et les tests présents restent des points d'entrée pour une qualification, pas une certification actuelle des cinq critères.
