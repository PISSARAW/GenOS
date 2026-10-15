# Vérification des correctifs CodeQL

État vérifié le 15 octobre 2026 dans le checkout local `v3` (`4f12c7e3`). Cette note consigne les preuves disponibles pour les alertes listées dans l’objectif CodeQL. Elle ne vaut pas fermeture des alertes dans GitHub.

## Corrections du code backend

Les corrections du code visent les catégories suivantes : exécution de commandes, SSRF dans le transport Git distant, confusion de types, limitation de débit sur les routeurs concernés, injection de motif, affectations susceptibles de polluer les prototypes et formatage de journaux contrôlé par des valeurs externes. Les vérifications locales ont notamment confirmé que les commandes subprocess utilisent des exécutables et arguments déterminés sans interprétation shell, que les scripts/binaire runtime sont validés par une politique explicite, et que les URLs distantes sont validées avant leur emploi et ne suivent pas les redirections.

Les modifications du parseur de motifs utilisent un sous-ensemble borné et rejettent les constructions non prises en charge. La limitation de débit est appliquée au routeur avec `express-rate-limit` (120 requêtes par IP et par minute), reconnu par la requête `js/missing-rate-limiting`.

Le suivi des alertes encore ouvertes traite aussi les exécutions de processus par une liste canonique de scripts et de binaires autorisés, les appels dynamiques par des `Map` explicites, les longueurs de boucles par des plafonds, les identifiants écrits dans les chemins d'artefacts par validation de format, les chemins du Studio par normalisation et contrôle de confinement, et le hash de contexte Cryptophasia par SHA-256. Les valeurs de prompt non textuelles sont normalisées avant toute lecture de longueur.

## Vérifications exécutées

Résultats réussis dans ce checkout :

- `node backend/tests/test_ateam_artifact_schema.js`
- `node backend/tests/test_route_rate_limit.js`
- `node backend/tests/test_agent_process_spawn_retry.js`
- `npm --prefix backend run test:agent-git` (inclut le test SSRF distant)
- `python scripts/ci/check_code_quality.py` avait réussi lors du précédent contrôle, avec 0 nouvelle violation.

Le dernier contrôle qualité a depuis échoué avec trois nouvelles violations dans `crates/genos-cli/src/commands/metabolic_pool.rs` et `examples/holobionte/password-change-llm-mission.cjs`, fichiers sans rapport avec les alertes CodeQL traitées ici. Ces fichiers ne sont pas modifiés dans le cadre de cette correction.

Pour les changements du suivi présent, `node --check` a réussi sur les fichiers JavaScript de sécurité modifiés. La suite `test_route_rate_limit` n'a pas pu être rejouée localement : l'installation interrompue des dépendances a laissé le binding natif SQLite absent, et `npm ci --prefix backend` échoue pendant le nettoyage de `backend/node_modules` (`ENOTEMPTY`). Aucun résultat de test n'est revendiqué pour cet état local. Une installation CI propre est nécessaire pour confirmer les tests.

Les suites plus larges `npm test`, `npm run test:security` et `cargo test --workspace` ont été tentées. Elles n’ont pas fourni de validation complète : les tests backend échouent à ouvrir des ports localhost (`EACCES`) et la compilation Rust échoue sur `aws-lc-sys` avec `PermissionDenied`.

## Alertes de workflows

Les 12 alertes portent sur `.github/workflows/backend-ci.yml`, `.github/workflows/backend-validation.yml` et `.github/workflows/validation.yml`. Ces fichiers avaient été supprimés dans le commit `2d4a8ba8`; leur contenu a été récupéré depuis son parent pour conserver les tâches CI existantes. Les trois workflows définissent maintenant `permissions: contents: read` au niveau global. Aucun de leurs jobs ne publie de contenu ni ne modifie le dépôt, donc aucun droit d’écriture du `GITHUB_TOKEN` n’est accordé.

Les trois workflows ont été restaurés et poussés sur `v3` (commits `930b2e4f` et suivants). Un accès direct à l'API des alertes CodeQL n'est pas disponible ici. Le dernier scan ne peut donc pas confirmer leur fermeture; il faut vérifier les résultats d'une nouvelle analyse GitHub après le push des changements du présent suivi.
