# Qualification MCP après corrections — 7 octobre 2026

Ce document suit les 48 outils du catalogue public `shared/toolDefinitions.json`. Il ne confond pas `tools/list`, routage, réponse MCP et effet métier. Une opération asynchrone `accepted` n'est pas une mission terminée.

Légende : `S` = appel MCP `stdio` réel avec preuve métier ; `B` = dispatch/transport MCP backend avec état ou artefact vérifié ; `R` = route/contrat testé, effet métier non qualifié ; `D` = dépendance externe absente de cette campagne ; `N` = mode non implémenté, refus explicite. `R` et `D` ne signifient pas « fonctionne ».

| Famille | Outil | État | Preuve ou limite |
| --- | --- | --- | --- |
| Fossiles | `genos_fossil_record` | B | Enregistrement et contenu persisté dans une base temporaire. |
| Fossiles | `genos_fossil_list` | B | Le fossile créé est relu. |
| Fossiles | `genos_fossil_strata` | B | La strate et son compteur sont relus. |
| Fossiles | `genos_fossil_excavate` | B | Intégrité et lecture seule vérifiées. |
| Fossiles | `genos_fossil_decode` | B | Décodage lié au fossile créé. |
| Fossiles | `genos_fossil_candidate` | B | Génome candidat relu en SQLite ; absence de base refusée. |
| Orchestration | `genos_orchestrate` | R | Lancement/dispatch ; issue de mission non démontrée. |
| Orchestration | `genos_delegate_worker` | R | Délégation routée ; travail terminé non démontré. |
| Orchestration | `genos_change_strategy` | R | Contrat/dispatch. |
| Orchestration | `genos_report_progress` | R | Contrat/dispatch. |
| Orchestration | `genos_change_organization` | S | Deux changements de topologie par MCP `stdio`, transitions de versions 1 et 2 relues dans SQLite. |
| Orchestration | `genos_organization_state` | S | États actifs versions 1 et 2 relus en `stdio` après transitions ; état absent signalé `not_initialized`, identité runtime requise. |
| Orchestration | `genos_worker_publish` | S | Publication worker en `stdio` avec identité runtime liée ; ligne relue dans SQLite et signal routé vers l’inbox parent avec intégrité vérifiée. La consommation par un second processus worker reste hors campagne. |
| Orchestration | `genos_worker_inbox` | S | Message ciblé relu en `stdio` depuis SQLite, intégrité vérifiée et curseur `after_id` testé. Le routage ne renvoie plus le seul état de l'organisation. |
| Orchestration | `genos_trinity_launch` | R | Mondes comparatifs non exécutés dans cette campagne. |
| Orchestration | `genos_a_team_preview` | R | Schéma tableau/chaîne validé ; équipe non exécutée. |
| Orchestration | `genos_biological_mode` | R | Modes propres à l'outil validés ; mission non terminée dans cette campagne. |
| Orchestration | `genos_philosophy` | B | Test d'intégration MCP en lecture seule. |
| Workspace | `genos_snapshot` | S | Binaire natif, fichier JSON créé et relu. |
| Workspace | `genos_replay` | S | Reçu natif `VERIFIED` avec `execution_replayed: true`. |
| Workspace | `genos_capsule_create` | S | Capsule de données persistée et vérifiée ; écriture impossible refusée, mais isolation copy-on-write non prouvée. |
| Workspace | `genos_merge` | N | Refus natif et MCP : aucune vérification d'invariants ni promotion de branche n'est implémentée. |
| Workspace | `genos_audit` | S | Audit natif d'une capsule créée, fichier et score relus ; l'argument `snapshot_id` attend en réalité l'identifiant de capsule. |
| Workspace | `genos_biomimicry` | R | Nom de fonctionnalité inconnu refusé par CLI/MCP ; les effets des fonctionnalités connues restent à qualifier séparément. |
| Workspace | `genos_v2_init` | S | Les trois répertoires attendus sont créés par le CLI via MCP dans une racine jetable ; aucun provisioning plus large n'est revendiqué. |
| Workspace | `genos_v2_fork` | N | L'ancien CLI fabriquait seulement un UUID ; refus natif et MCP tant qu'aucun état enfant/lignage n'est persisté. |
| Signaux | `genos_signal_publish` | S | Signal ligand publié en `stdio` et ligne relue dans SQLite ; livraison à un destinataire non prouvée. |
| Signaux | `genos_signal_read` | S | Lecture d'un signal dans la même portée organisation/projet, intégrité vérifiée ; seconde lecture vide après marquage `seen`. |
| Signaux | `genos_signal_purge` | S | Signal expiré artificiellement puis supprimé via appel MCP, absence vérifiée en SQLite. |
| Signaux | `genos_signal_ground` | S | Accusé `transport_ack` enregistré après lecture et relu dans `signal_deliveries` ; niveaux supérieurs non qualifiés. |
| Signaux | `genos_signal_electrocyte_vote` | S | Deux décharges donnent le consensus attendu ; signal voltage persisté et relu. Un second vote coalescé est refusé, sans succès fictif. |
| Signaux | `genos_signal_chemotactic_follow` | S | Phéromone persistée, gradient `0,6` relu en `stdio` ; erreur de base traitée comme échec MCP. |
| Signaux | `genos_signal_plasmid_transfer` | N | Aucun transfert exécuté ; refus MCP `not_implemented` testé en `stdio`. |
| Signaux | `genos_signal_collective_decision` | S/N | Mode électrocyte : consensus et signal voltage persisté, refus si coalescé ; modes plasmide/stigmergie refusés en `stdio`. |
| Topologie | `genos_topology_session` | B | Tests backend de lease et de morphogenèse ; pas une preuve de toutes les opérations. |
| Stratégie | `genos_execute_primitive` | S | Arguments publics `args` transmis ; `expected_information_gain` renvoie le meilleur test attendu, nom inconnu refusé. Les autres primitives ne sont pas certifiées. |
| Stratégie | `genos_execute_strategy_pipeline` | S | Pipeline ordonné `expected_information_gain` → `next_probe` exécuté en `stdio` ; les autres compositions restent à qualifier. |
| Développement | `genos_search_failures` | S | Recherche d'un échec créé dans la même base temporaire. |
| Développement | `genos_diagnose` | S | Hypothèses valides acceptées, absence refusée. |
| Développement | `genos_analyze_trajectory` | S | Boucle détectée sur historique contrôlé. |
| Développement | `genos_record_decision` | S | Décision et preuve relues en SQLite, sans promotion implicite. |
| Développement | `genos_record_experience` | S | Réponse MCP conforme au gate de session. |
| Développement | `genos_compile_memory` | S | Deux entrées créées avec identifiants persistés. |
| Développement | `genos_blame` | S | Provenance d'un agent relue depuis la télémétrie. |
| Interaction | `genos_browser_act` | D | Service navigateur réel non qualifié. |
| Interaction | `genos_computer_use` | D | Boucle écran/modèle/action externe non qualifiée. |
| Interaction | `genos_foveal_crop` | D | Service image externe non qualifié. |
| Interaction | `genos_optimal_foraging` | D | Service de recherche externe non qualifié. |

Vérifications générales obtenues sur le worktree isolé : catalogue et routage Node 48/48, suite MCP Node, profil MCP backend, 21 tests Rust MCP, `npm test`, `cargo test --workspace`, suite native MCP et gate qualité Python. Elles ne remplacent pas les preuves métier manquantes dans les lignes `R` et `D`. Le pont d'orchestration convertit désormais `success: false` en erreur MCP ; `status: accepted` reste seulement un accusé de réception. Le point d'entrée du script d'orchestration, absent dans `v3`, est restauré et testé sur une base jetable ; les lignes `R` ne sont pas automatiquement promues pour autant.

Le handler backend hors catalogue public `genos_temporal_consciousness_transfer` reste `reference_only` : une demande d'exécution retourne `success: false`, `status: not_implemented`. Le test ne revendique plus de restauration d'état d'agent.
