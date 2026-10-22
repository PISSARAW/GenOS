# Validation de la nosologie computationnelle

Date initiale : 2026-10-06; mise à jour des preuves : 2026-10-22. Périmètre : catalogue des 28 conditions, neuf familles, 48 contrats de marqueurs et variantes SystemicTherapy.

## Résultats observés

| Vérification | Résultat |
|---|---|
| cargo test -p genos-biology --lib --tests --jobs 1 | 131 réussis : 110 unitaires, 14 tests de catalogue/contrats et 7 régressions. Les contrats vérifient maintenant aussi le seuil strict de chaque marqueur et le refus atomique si un marqueur de risque est invalide. |
| cargo test -p genos-orchestrator --features api --test nosology_authorization --jobs 1 | 5 réussis : application durable, absence de cible, refus, signature/contexte invalide, restauration et idempotence. |
| node backend/tests/test_nosology_catalog.js | Réussi : types connus, paramètres normalisés et rejet des clés inconnues ou héritées. |
| node backend/tests/test_clinical_authorization.js | Réussi : autorisations explicites signées, liées à la cible et non expirées. |
| node scripts/docs/generate-nosology-catalog.mjs --check | Réussi : document synchronisé avec shared/nosology.json. |
| python scripts/ci/check_adr_index.py | Réussi : 834 fichiers, 834 lignes, aucun problème. |
| Hooks des commits de code | Réussis : 15 puis 8 fichiers source vérifiés, aucune violation ni dette nouvelle. Blocs Receipt vérifiés. |
| cargo test --workspace --bin genos commands::biomimicry::therapy::tests --offline --jobs 1 | 5 réussis : parsing des variantes et paramètres, absence de succès sans exécution, validation de la réponse de réservation clinique (3 cas : autorisé, refusé, champ manquant). |
| Agrégation `noisy_or_v2` côté Rust | 8 tests unitaires : liste vide, valeur unique, plusieurs valeurs, ignorent les non-normalisés, borne à 1 (`crates/genos-biology/src/nosology_catalog.rs`).
| Campagne de calibration (infrastructure) | `scripts/campagne-calibration-nosologie.cjs` généré ; 28 conditions, 48 thérapies, 9 familles ; seuil 0,5 et quantité 0,25 identifiés comme défauts d’ingénierie non calibrés ; statut `pending_real_observations` (`docs/06-qualite-preuves/campagnes/campagne-calibration-nosologie.json`).
| Protocole de réservation durable (CLI) | `claimToken` et `operationId` sont transmis à `/validate`; le backend vérifie le claim durable et son lease juste avant l'application. Le vrai CLI passe la course révocation/claim, l'idempotence, la reprise après crash et les refus hors ligne/URL invalide (`npm --prefix backend run test:clinical-revocation-cli-e2e`). |
| Parcours HTTP → Rust → journal après redémarrage | `npm --prefix backend run test:clinical-rust-e2e` passe : autorisation HTTP, mutation Rust, reçu durable, réouverture après redémarrage et idempotence. |
| Contrôles ciblés du backend et MCP | `test:clinical-authorization` passe ses quatre suites; `test_consumer_inspection.js` passe individuellement et dans la suite complète; `test:mcp` passe ses 9 suites hors sandbox. |
| `npm --prefix backend test` | Réussi le 2026-10-22 : toutes les suites backend jusqu'à `test:aide2` passent. `test:workers` passe ses 36 suites en 227 124 ms; Lean est absent et l'oracle qui le requiert est explicitement ignoré. |
| `npm test` racine | Réussi le 2026-10-22 : biologie, worker-workspaces, backend, garage et P1-v3 terminés avec code 0. Le profil workers passe 36 suites en 263 673 ms; Lean reste explicitement ignoré car indisponible. |
| Autorisation liée à l'état clinique cible | Le contrôle source exige mission, cellule, génome, empreinte et digest d'état concordants. Le test `authorization_rejects_a_same_mission_receipt_without_target_state` passe dans la suite API. |

## Revue de la révocation concurrente — 2026-10-22

`npm --prefix backend run test:clinical-authorization` réussit : les tests couvrent
les autorisations signées, la révocation persistée entre processus, la restauration
HTTP et la sérialisation SQLite multi-processus. Le test du vrai CLI établit deux
ordres : une révocation avant claim bloque l'application; un claim durable avant
révocation conserve l'autorité de l'opération réservée. Le jeton du claim est
vérifié avec son lease avant l'application Rust. Le scénario couvre aussi
l'expiration/reprise du claim après crash, l'append unique, l'idempotence et les
refus hors ligne ou d'URL backend invalide.

La réservation donne à chaque opération un ordre durable par rapport à la
révocation : une autorisation révoquée n'accepte aucun nouveau claim; une
opération déjà claimée peut terminer ou être reprise avec un claim renouvelé.
La preuve n'affirme pas une atomicité distribuée entre la base backend et le
journal Rust; elle valide l'idempotence et l'ordre du protocole de réservation.

Les tests Rust de biologie ont été exécutés dans une cible isolée avec symboles de débogage et compilation incrémentale désactivés. Le test d'autorisation a été exécuté avec les features du workspace, qui activent la feature api requise. Les commandes équivalentes de reproduction figurent dans le catalogue runtime.

## Contrôles globaux du dépôt

- `cargo test --workspace --jobs 1` passe le 2026-10-22 après relance hors sandbox : les deux échecs de checkpoint temporaires observés dans le sandbox (`os error 5`) ne se reproduisent pas avec les permissions nécessaires; seuls les avertissements Rust préexistants sont émis.
- Revue initiale du 2026-10-06 : le dépôt avait 341 violations, dont 191 nouvelles par rapport à la baseline. Elles concernaient alors des fichiers hors de cette implémentation.
- Mise à jour 2026-10-22 : `npm test`, `npm --prefix backend test` et `cargo test --workspace --jobs 1` passent. Les commandes réseau et les fichiers temporaires de Rust ont nécessité une exécution hors sandbox.
- `python scripts/ci/check_code_quality.py` le 2026-10-22 : 7 292 fichiers analysés, 1 violation de baseline et 0 nouvelle. Aucun seuil ni baseline n'a été modifié.

Les anciens symboles de débogage, caches incrémentaux inactifs et exécutables de tests régénérables de target/debug ont été nettoyés pour poursuivre. Aucun reçu, base de données ou fichier source n'a été supprimé.

## Corrections vérifiées

- Dose nulle sans retrait de diagnostic; inflammation invalide refusée.
- Purge limitée à la signature demandée; isolement maintenu tant qu'un diagnostic subsiste et levé après résolution du dernier diagnostic ciblé.
- Mesures absentes ou invalides sans rémission annoncée; absence de cible distincte du refus et de l'application.
- Effet de marqueur rapporté avant/après et persisté avant mise à jour mémoire; rejeu sans nouvelle mutation.
- Effets secondaires de marqueur conservés tant que leur risque persiste; remplacement des cicatrices sans rémission fictive d'une mémoire prionique.

Ces résultats portent sur les contrats logiciels. Les scénarios ne valident aucune pathologie réelle.
