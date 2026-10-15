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

## Alertes de workflows non vérifiables localement

Les alertes portant sur `.github/workflows/backend-ci.yml`, `.github/workflows/backend-validation.yml` et `.github/workflows/validation.yml` sont au nombre de 12 dans l’objectif. Aucun fichier n’est présent ou suivi dans `.github/workflows` dans ce checkout. Les tentatives précédentes de récupération de ces chemins sur la branche `v3` ont retourné 404. Leur contenu ne peut donc pas être corrigé ou vérifié sans les sources réelles. Aucun workflow de remplacement n’a été créé, car leurs étapes et déclencheurs ne sont pas connus.

La CLI CodeQL et un accès aux alertes GitHub ne sont pas disponibles dans cet environnement. Il reste donc à confirmer la fermeture des alertes après analyse CodeQL et à traiter les 12 alertes de workflows quand leurs fichiers sources seront accessibles.
