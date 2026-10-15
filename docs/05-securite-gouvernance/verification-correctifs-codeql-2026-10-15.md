# Vérification des correctifs CodeQL

État vérifié le 15 octobre 2026 dans le checkout local `v3` (`4f12c7e3`). Cette note consigne les preuves disponibles pour les alertes listées dans l’objectif CodeQL. Elle ne vaut pas fermeture des alertes dans GitHub.

## Corrections du code backend

Les corrections du code visent les catégories suivantes : exécution de commandes, SSRF dans le transport Git distant, confusion de types, limitation de débit sur les routeurs concernés, injection de motif, affectations susceptibles de polluer les prototypes et formatage de journaux contrôlé par des valeurs externes. Les vérifications locales ont notamment confirmé que les commandes subprocess utilisent des exécutables et arguments déterminés sans interprétation shell, que les scripts/binaire runtime sont validés par une politique explicite, et que les URLs distantes sont validées avant leur emploi et ne suivent pas les redirections.

Les modifications du parseur de motifs utilisent un sous-ensemble borné et rejettent les constructions non prises en charge. La limitation de débit est appliquée au routeur, avec une fenêtre, un plafond de requêtes et une borne sur le nombre de buckets.

## Vérifications exécutées

Résultats réussis dans ce checkout :

- `node backend/tests/test_ateam_artifact_schema.js`
- `node backend/tests/test_route_rate_limit.js`
- `node backend/tests/test_agent_process_spawn_retry.js`
- `npm --prefix backend run test:agent-git` (inclut le test SSRF distant)
- `python scripts/ci/check_code_quality.py` avait réussi lors du précédent contrôle, avec 0 nouvelle violation.

Le dernier contrôle qualité a depuis échoué avec trois nouvelles violations dans `crates/genos-cli/src/commands/metabolic_pool.rs` et `examples/holobionte/password-change-llm-mission.cjs`, fichiers sans rapport avec les alertes CodeQL traitées ici. Ces fichiers ne sont pas modifiés dans le cadre de cette correction.

Les suites plus larges `npm test`, `npm run test:security` et `cargo test --workspace` ont été tentées. Elles n’ont pas fourni de validation complète : les tests backend échouent à ouvrir des ports localhost (`EACCES`) et la compilation Rust échoue sur `aws-lc-sys` avec `PermissionDenied`.

## Alertes de workflows

Les 12 alertes portent sur `.github/workflows/backend-ci.yml`, `.github/workflows/backend-validation.yml` et `.github/workflows/validation.yml`. Ces fichiers avaient été supprimés dans le commit `2d4a8ba8`; leur contenu a été récupéré depuis son parent pour conserver les tâches CI existantes. Les trois workflows définissent maintenant `permissions: contents: read` au niveau global. Aucun de leurs jobs ne publie de contenu ni ne modifie le dépôt, donc aucun droit d’écriture du `GITHUB_TOKEN` n’est accordé.

Les chemins étaient absents de la branche GitHub `v3` au moment de la vérification (API de contenu : 404). Les corrections sont désormais présentes dans le commit local et doivent être intégrées à la branche pour que GitHub les analyse. La CLI CodeQL et un accès de lecture aux alertes GitHub ne sont pas disponibles ici; leur fermeture après analyse n’a pas pu être confirmée.
