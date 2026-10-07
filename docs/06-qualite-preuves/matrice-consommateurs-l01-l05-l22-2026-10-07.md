# Matrice des consommateurs L01–L05 et L22 — 2026-10-07

Source : Page « Plan de réalisation et de validation de GenOS », identifiant
`page_f582a574b6d4819182c266e9d429d922`, copie conservée dans les preuves locales.
Les 115 références gardent leur numéro et leur lot : L01 10, L02 43, L03 2,
L04 35, L05 2, L22 23. Le plan les classe P1 ; cette inspection des consommateurs
existants alimente P0 sans changer leur priorité ni leur maturité scientifique.

Q = parcours **borné** exécuté ; P = couverture partielle ; N = parcours non exercé.
Un statut Q ne ferme pas tout le lot ni la fonctionnalité de recherche proposée.
Un groupe partage des consommateurs ; ses tests ne démontrent pas chaque
interprétation particulière de tous les concepts rattachés. Les empreintes et
journaux de la passe finale sont référencés dans le
[rapport de qualification](qualification-consommateurs-p0-2026-10-07.md).

## Parcours et frontières de preuve

| Groupe | Consommateurs réels | Effet observé | Vérifications | Limite opposable |
|---|---|---|---|---|
| CT — Contrats et états | strategyContractService → strategyExecutionEvents → contrôleurs REST | Contrat, run, étapes et budgets SQLite ; déclarations non vérifiées bloquées | test_strategy_contracts | Contrats usuels exercés ; graphe scientifique mission/claim/intervention complet non qualifié |
| ME — Mémoire et provenance | agentMemoryStore → vectorMemoryService → agentMemoryPrompt ; strategyPromotionMemoryService | Écriture, relecture dans un nouveau processus, injection bornée ; propriétaire et tenant conservés | test_consumer_memory_provenance ; test_consumer_promotion_limits | Provenance liée et sceau de promotion vérifié ; les booléens internes de scoring ne constituent pas une signature cryptographique |
| AU — Autorité et tenant | agentAuthorityService / Cedar / biscuitDelegationService / auth / tenant | Refus d’identité, atténuation, révocation, scope et accès public | test_cedar_agent_authority ; test_biscuit_delegation ; test_tenancy ; test_auth_public_surface | Pas de qualification universelle de tous les handlers ni de toutes les mutations concurrentes |
| LE — Leases | toolLeasePolicy → MCP dispatch | Lease vide explicite = aucun outil ; intersection et rôle périmé refusés | test_tool_lease_restriction ; test_mcp_topology_lease | Le lease autorise l’action ; il n’atteste pas son résultat |
| SA — Confinement | workspaceRegistry / runIsolated / validation des chemins MCP | Traversée, chemins hors capsule et commandes refusées | test_aeis_sandbox ; test_workspace_path_containment ; test_path_traversal ; test_mcp_input_paths | Confinement applicatif testé ; aucun confinement OS universel revendiqué |
| GO — Gouvernance | strategyExecutionController → approveRun ; platformApprovalExecution | Signature seule refusée ; preuves réelles requises ; séparation et payload contrôlés | test_human_approval_promotion_gate ; test_approval_separation_bypass | Nonces transactionnels ; deux lots frais pour un même run ne sont pas sérialisés |
| CO — Conformité | complianceRoutes → complianceService ; platformController | Rapport enregistré et export CSV via HTTP | test_compliance_integrations ; test_compliance_tenant_scope ; test_approval_payload_integrity | Les deux derniers contrôles sont statiques ; rapport logiciel ≠ certification réglementaire |
| SS — Authentification / SSO | auth / ssoRoutes / secretVault | Surface publique contrôlée, métadonnées expurgées, SAML non signé refusé | test_auth_public_surface ; test_sso_provider_disclosure ; test_saml_validation | Aucun cycle OIDC ou SAML positif avec IdP réel ; SAML utilise un certificat de fixture |
| SE — Secrets | secretVault → dérivation et chiffrement | KDF et validation du coffre | test_secret_vault_kdf ; test_replay_manifest | Pas d’audit exhaustif des canaux de fuite ; manifeste filtre les noms autorisés |
| PH — Interprétations | philosophicalPromotionGuard / ethicalComparisonPolicyService / ontology | Contexte interprétatif et gates ; revue éthique seule insuffisante | test_philosophical_promotion_guard ; test_ethical_promotion_integration ; test_philosophy_causality_service | La vérité des observations déclarées et les thèses philosophiques ne sont pas vérifiées |
| AE — Oracles et reçus | aeisPromotionBridge → sandbox → aeisAssemblyStore → promotionVerifierNonceService | Deux commandes de test exécutées ; reçus liés au run et scellés ; falsification et rejeu refusés | test_approve_run_deferred_promotion ; test_aeis_verifier_lineage ; test_consumer_promotion_limits | Indépendance technique de fixtures ; pas d’indépendance scientifique générale ni de preuve Lean/SMT obtenue par simple echo |
| WO — État agentique et branches | AgentGit / agentCapsule / replay / procedural causal forks | Snapshots et branches SQL, empreintes, refus d’altération et relecture durable | test_agent_git_sqlite_e2e ; test_agent_git_invariants_p0 ; test_agent_capsule ; test_procedural_causal_forks | Bisection de fixture et runner injecté ; pas de replay complet de tous les aléas ou effets externes |
| CA — Modèles causaux | selfTwinService / causalityService / ontology possibleWorldService | Comparaison de modèles et dépendances déclarées | test_self_twin ; test_philosophy_causality_service | Pas de causalité empirique ni de vérité métaphysique attestée |
| GV — GVX | GVX protocols / standard cycle / evaluationObservabilityService | Plans SQLite, budgets, cycle avec processus de politique isolés et score calculé | test_gvx_experiment_protocol ; test_gvx_benchmark_protocol ; test_gvx_standard_cycle ; run_quality_suite | Metrics de fixture ; séparation de rôles testée, holdout IA inaccessible et puissance représentative non qualifiés |
| RE — REST | app → routes et contrôleurs → SQLite | API réelle avec serveur HTTP, contrats et rapports persistés | test_backend ; test_strategy_contracts ; test_compliance_integrations | Couverture des parcours testés ; pas de parité de toutes les routes |
| GR — gRPC | workflow.proto → workflowService / mcpService → SQLite / executor | État réel sérialisé ; échec MCP structuré propagé ; périmètre contrôlé | test_grpc_services ; test_grpc_success_truthfulness ; test_consumer_workflow_grpc | 41 services sondés ; clé partagée de plateforme, pas de RBAC tenant individuel via gRPC |
| MC — MCP | MCP HTTP / explicite / stdio ; catalogues Node et Rust | Transport et leases ; erreurs propagées | test_mcp_http_transport ; test_mcp_explicit_transport ; test_mcp_server_parity ; cargo test --workspace | Parité Node/Rust testée seulement sur un sous-ensemble ; pas de parité sémantique globale |
| CL — CLI et façade g | g.ps1 → genos-simple-cli → genos-cli ; operator Node | Façade réelle --help exécutée ; contrôles CLI Rust et opérateur SQLite | operator-g-help.log ; cargo test --workspace ; test_ontogenesis_operator_cli | Aide du shim seulement ; aucune mutation destructive lancée ; pas de parcours commun CLI/backend complet |
| ID — IDE | ideRoutes → ideController → ide_integrations | Contrat HTTP et compatibilité de version | test_ide_contract ; test_compliance_integrations | Connexion, commandes depuis une extension installée et état interinterfaces non exercés |
| UI — Studio / TUI | Studio web ; CLI/TUI | Entrées présentes dans le code et le registre | Inspection des entrées, sans test de parcours utilisateur | Aucune session interactive Studio/TUI qualifiée |
| OB — Observabilité | telemetryObserver / trace replay / audit logs / health | Sessions et IDs persistés, trace relue, audit tenant et sondes réelles | test_trace_replay_semantics ; test_audit_tenant_scope ; test_session_telemetry_identity ; test_deployment_health | Health/readiness ne démontrent pas la validité d’une décision ; export externe et alertes bout en bout non qualifiés |
| MP — MsgPack | bioPolymerPersistenceService | Aller-retour binaire des données de fixture | test_bio_polymer_roundtrip | Ne démontre pas l’absence de perte de tous les formats des interfaces |

## Références du plan

| Référence | Concept du plan | Lot | Groupe | Statut |
|---|---|---|---|---|
| C001 | Runtime d’agents reproductible et supervisé | L04 | WO | P |
| C002 | État versionné | L01 | CT | P |
| C003 | Exécution contrefactuelle | L04 | WO | P |
| C004 | Branches, forks, snapshots, diffs et replay | L04 | WO | P |
| C008 | Provenance | L01 | ME | Q |
| C009 | Reçus vérifiables | L03 | AE | Q |
| C011 | Autorité explicite | L02 | AU | P |
| C012 | Leases d’outils | L02 | LE | Q |
| C014 | Isolation des workspaces | L04 | WO | P |
| C015 | Garde-fou fail-closed | L02 | AU | P |
| C108 | Hypothèse | L04 | WO | P |
| C184 | Self-Twin causal | L04 | CA | P |
| C215 | Autorité de routage | L02 | AU | P |
| C238 | Progrès causal | L04 | CA | P |
| C240 | Simulation prospective | L04 | CA | P |
| C244 | Expérience discriminante | L04 | CA | P |
| C260 | Blast radius | L02 | AU | P |
| C266 | Mission | L01 | CT | P |
| C267 | Tâche | L04 | WO | P |
| C268 | Run | L04 | WO | P |
| C269 | Workflow | L04 | WO | P |
| C270 | Job | L04 | WO | P |
| C271 | Graphe d’états | L01 | CT | P |
| C272 | Transition | L01 | CT | P |
| C278 | Branches d’exécution | L04 | WO | P |
| C282 | Contrat de méthode | L01 | CT | P |
| C283 | Contrat de stratégie | L01 | CT | P |
| C284 | Contrat d’exécution | L01 | CT | P |
| C285 | Contrat de mission | L01 | CT | P |
| C294 | Checkpoint | L04 | WO | P |
| C296 | Rejeu causal | L04 | WO | P |
| C297 | Bisection causale | L04 | WO | P |
| C300 | Capsule | L04 | WO | P |
| C301 | Workspace contrefactuel | L04 | WO | P |
| C302 | Git agentique | L04 | WO | P |
| C303 | AgentGit | L04 | WO | P |
| C304 | Trajectoire | L04 | WO | P |
| C306 | Campagne d’évaluation | L05 | GV | P |
| C307 | Benchmark | L05 | GV | P |
| C364 | Sandbox VFS | L02 | SA | Q |
| C365 | Capsules/snapshots | L04 | WO | P |
| C369 | Observabilité | L22 | OB | P |
| C370 | Approbation de gouvernance | L02 | GO | Q |
| C371 | Compliance | L02 | CO | P |
| C499 | Causalité | L04 | CA | P |
| C500 | Loi | L04 | CA | P |
| C501 | Contrefactuel | L04 | CA | P |
| C502 | Déterminisme | L04 | CA | P |
| C504 | Temps B-series | L04 | CA | P |
| C509 | Monde possible | L04 | CA | P |
| C510 | Accessibilité entre mondes | L02 | PH | P |
| C512 | Reçu de monde possible | L04 | CA | P |
| C513 | Dépendance causale | L04 | CA | P |
| C523 | Autrui | L02 | PH | P |
| C524 | Identité | L02 | PH | P |
| C529 | Non-promotion d’une analyse philosophique | L02 | PH | P |
| C531 | Causalité | L04 | CA | P |
| C536 | Éthique | L02 | PH | P |
| C544 | Leibnizianisme | L04 | CA | P |
| C551 | Contingence et événement | L04 | CA | P |
| C558 | Mondes possibles | L04 | CA | P |
| C561 | Adaptive Epistemic Immune System | L02 | AE | Q |
| C562 | API REST | L22 | RE | P |
| C563 | gRPC | L22 | GR | Q |
| C564 | MCP | L22 | MC | P |
| C565 | MCP stdio | L22 | MC | P |
| C566 | CLI Rust | L22 | CL | P |
| C567 | Façade opérateur `g` | L22 | CL | P |
| C568 | IDE `genos.ide/v1` | L22 | ID | P |
| C569 | Studio | L22 | UI | N |
| C570 | TUI | L22 | UI | N |
| C575 | Event log | L22 | OB | P |
| C576 | MsgPack | L22 | MP | Q |
| C578 | Observabilité | L22 | OB | P |
| C579 | Logs d’audit | L22 | OB | P |
| C580 | Traces | L22 | OB | P |
| C581 | Spans | L22 | OB | P |
| C582 | Request IDs | L22 | OB | P |
| C583 | Trace IDs | L22 | OB | P |
| C584 | Métriques par tenant | L22 | OB | P |
| C585 | Health checks | L22 | OB | P |
| C586 | Readiness | L22 | OB | P |
| C587 | Alertes | L22 | OB | P |
| C588 | Identité | L02 | AU | P |
| C589 | Autorité | L02 | AU | P |
| C590 | RBAC | L02 | AU | P |
| C591 | Scopes tenant | L02 | AU | P |
| C592 | Multi-tenant | L02 | AU | P |
| C593 | Organisation | L02 | AU | P |
| C595 | Workspace | L02 | AU | P |
| C596 | Mission | L02 | AU | P |
| C597 | Environnement | L02 | AU | P |
| C600 | Approbation humaine | L02 | GO | Q |
| C601 | Séparation des responsabilités | L02 | GO | Q |
| C602 | Gestion du risque | L02 | GO | Q |
| C603 | Compliance | L02 | CO | P |
| C604 | Auditabilité | L22 | OB | P |
| C605 | Conservation des preuves | L02 | CO | P |
| C606 | Gouvernance des données | L02 | CO | P |
| C607 | Sandbox | L02 | SA | Q |
| C608 | Isolation | L02 | SA | Q |
| C609 | Confinement de chemins | L02 | SA | Q |
| C610 | VFS sandboxé | L02 | SA | Q |
| C611 | Secrets | L02 | SE | P |
| C612 | CORS | L02 | AU | P |
| C613 | Authentification | L02 | SS | P |
| C614 | SSO | L02 | SS | P |
| C615 | OIDC | L02 | SS | P |
| C616 | SAML | L02 | SS | P |
| C617 | Cedar | L02 | AU | P |
| C618 | Permission explicite | L02 | AU | P |
| C619 | Autorité de plateforme | L02 | AU | P |
| C620 | Confirmation des actions destructives | L02 | GO | Q |
| C648 | Mission → différenciation → contrat → lease → exécution isolée → observation → action bornée → reçus → preuve → falsification → décision → promotion rejet récupération ou fossilisation | L01 | CT | P |
| C649 | Un transport ou statut positif ne prouve pas une décision valide | L03 | AE | Q |

## Critères encore ouverts

- L01 : manifeste scientifique complet, migrations et relecture de toutes les
  relations mission/claim/hypothèse/intervention/versions/coûts.
- L02 : expiration et révocation sur toutes les surfaces, budgets de délégation
  en concurrence, authentification OIDC/SAML positive ; certification juridique
  exclue du statut d’un rapport généré.
- L03 : trois domaines avec postconditions réellement indépendantes, fraîcheur
  et mauvais domaine sur chaque profil ; un protocole HMAC protège son contenu,
  il ne crée pas un oracle scientifique.
- L04 : capture complète des aléas et interventions, isolement de tous les
  canaux, replay causal et effets externes non annulables.
- L05 : pilote IA à oracle réel, holdout effectivement inaccessible, coûts
  complets, ablations et puissance recalculée sur données représentatives.
- L22 : parcours interactifs Studio/TUI, extension IDE installée et parité
  sémantique de toutes les surfaces sur un même run.

Aucun gain IA ni aucune nouvelle fonctionnalité de recherche n’est établi par
cette matrice. Les entrées du registre, les imports et les assertions de texte
ne sont pas traités comme des preuves d’un parcours exécuté.

