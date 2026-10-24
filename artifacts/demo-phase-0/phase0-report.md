# Phase 0 — Rapport d'exécution

Date : 2026-10-24 (Europe/Paris)  
Répertoire : `C:\Users\Shadow\Documents\GitHub\GenOS`  
État initial : arbre de travail déjà largement modifié et avec des suppressions non commitées. Aucun nettoyage, stash ou reset n'a été effectué.

## Résultats

| Commande | Résultat | Preuve observée |
|---|---|---|
| `cargo build --workspace` | **PASS** | `Finished dev profile [unoptimized]` en 36,81 s. Avertissements Rust non bloquants d'imports/variables inutilisés. |
| `python scripts/ci/check_code_quality.py` | **FAIL** | `7,464` fichiers source examinés, `65` violations totales, `63` nouvelles. Détails conservés dans le journal de session GenOS `codex-sessions/<session>/phase0-quality.log`. |
| `npm test` | **FAIL** | Biologie (`8/8`), workers (`36` suites) et plusieurs suites backend ont passé. `test:p1-socle` s'arrête dans `test_foundational_principles_qualification.js` : reçu versionné périmé, digest calculé différent du digest enregistré pour `backend/tests/test_bounded_worker_delegation.js`. Le fichier était déjà modifié avant la Phase 0. |
| `npm --prefix backend run test:validation` | **FAIL** | Le profil `all` s'arrête dans `test_philosophy_ontogenesis_integration.js` sur `worktree-integration-sale` (`assertCleanIntegration`). |
| `npm --prefix backend run test:mcp` | **PASS** | `Validation profile 'mcp' passed: 9 suites in 21308ms`; parité Node/Rust incluse. |
| `GET http://localhost:4000/healthz` | **FAIL** | Connexion refusée avant démarrage. `npm --prefix backend start` n'a pas pu démarrer : migration `GVX_LEDGER_CHAIN_INVALID` / `control-plane-mac-mismatch`, avec redémarrages des workers. Le processus lancé pour cette vérification a été interrompu; aucune base ni clé n'a été supprimée ou modifiée volontairement. |

## Décision du gate

**Phase 0 non validée.** Les gates obligatoires `npm test` et `/healthz` ne sont pas verts. Le build Rust et `test:mcp` passent; le contrôle qualité et `test:validation` échouent aussi.

La prochaine tentative nécessite d'abord de traiter les violations nouvelles de qualité et de réconcilier le reçu de qualification avec ses sources actuelles. Le démarrage backend requiert une vérification contrôlée de la clé de MAC et de la base existante; cette Phase 0 n'a pas changé ces éléments.

## Limites des preuves

Ce relevé conserve les commandes, verdicts et diagnostics déterminants. Les sorties complètes de `npm test` et `test:validation` n'ont pas été redirigées vers des fichiers pendant leur exécution; le journal complet du contrôle qualité est conservé dans le dossier de session GenOS ignoré par Git.
