# Validation de la nosologie computationnelle

Date initiale : 2026-10-06; revue complémentaire : 2026-10-14. Périmètre : catalogue des 28 conditions, neuf familles, 48 contrats de marqueurs et 59 variantes SystemicTherapy.

## Résultats observés

| Vérification | Résultat |
|---|---|
| cargo test -p genos-biology --lib --tests --jobs 1 | 97 réussis : 78 existants, 12 tests de catalogue et 7 régressions. |
| cargo test -p genos-orchestrator --features api --test nosology_authorization | 5 réussis : application durable, absence de cible, refus, signature/contexte invalide, restauration et idempotence. |
| node backend/tests/test_nosology_catalog.js | Réussi : types connus, paramètres normalisés et rejet des clés inconnues ou héritées. |
| node backend/tests/test_clinical_authorization.js | Réussi : autorisations explicites signées, liées à la cible et non expirées. |
| node scripts/docs/generate-nosology-catalog.mjs --check | Réussi : document synchronisé avec shared/nosology.json. |
| python scripts/ci/check_adr_index.py | Réussi sur le dossier courant : 384 fichiers, 384 lignes, aucun problème. |
| Hooks des commits de code | Réussis : 15 puis 8 fichiers source vérifiés, aucune violation ni dette nouvelle. Blocs Receipt vérifiés. |
| cargo test --workspace --bin genos commands::biomimicry::therapy::tests --offline --jobs 1 | 2 réussis : parsing des variantes et paramètres, absence de succès sans exécution. |
| Parcours HTTP → Rust → journal après redémarrage | Réussi le 2026-10-14 : `npm --prefix backend run test:clinical-rust-e2e` valide l'upload signé, la reprise après redémarrage, la réparation d'une livraison hors ligne et l'idempotence. Un reçu organisme n'inclut maintenant cellule et génome que si les deux sont liés. |
| Autorisation liée à l'état clinique cible | Le contrôle source exige mission, cellule, génome, empreinte et digest d'état concordants. Le test `authorization_rejects_a_same_mission_receipt_without_target_state` passe dans la suite API. |

## Revue de la révocation concurrente — 2026-10-15

`npm --prefix backend run test:clinical-authorization` réussit : les tests
couvrent les autorisations signées, la révocation persistée entre processus,
la restauration HTTP et la sérialisation SQLite multi-processus. Le vrai CLI,
exécuté par `node backend/tests/test_clinical_revocation_rust_cli_e2e.cjs`
avec `CARGO_TARGET_DIR=D:\Temp\genos-maturity-target-20261015`, refuse une
autorisation déjà révoquée par un second backend sans modifier le journal;
les refus hors ligne et d'URL de backend invalide sont aussi vérifiés.

Cette preuve ne couvre pas l'intercalation entre `validateForCli` et l'append
du reçu Rust. Dans `clinicalAuthorizationController.js`, la validation lit le
ledger et répond; `therapy.rs` attend cette réponse, puis ouvre/restaure le
journal et appelle `apply_authorized_therapy`. Le second processus peut donc
commettre une révocation après la réponse HTTP mais avant l'append. Le chemin
backend `/apply` garde sa transaction SQLite pendant le processus enfant, mais
le CLI direct n'est pas enveloppé par cette transaction. Aucun claim atomique
ne relie actuellement ces deux étapes. Fermer cette fenêtre demande un
protocole de réservation durable qui ordonne la révocation et prend en charge
les retries concurrents et la reprise après crash; aucune propriété de ce type
n'est revendiquée par les tests actuels.

Les tests Rust de biologie ont été exécutés dans une cible isolée avec symboles de débogage et compilation incrémentale désactivés. Le test d'autorisation a été exécuté avec les features du workspace, qui activent la feature api requise. Les commandes équivalentes de reproduction figurent dans le catalogue runtime.

## Contrôles globaux du dépôt

- Revue complémentaire 2026-10-14 : `cargo test --workspace` passe après autorisation d'exécution hors sandbox pour permettre le build de `aws-lc-sys`; seuls des avertissements préexistants sont émis.
- Revue initiale du 2026-10-06 : le dépôt avait 341 violations, dont 191 nouvelles par rapport à la baseline. Elles concernaient alors des fichiers hors de cette implémentation.
- `npm test` dans le sandbox s'arrête sur `test:worker-workspaces` avec `EPERM` pendant `realpath` d'un dossier temporaire. `npm --prefix backend test` hors sandbox passe les suites jusqu'à `test_consumer_inspection.js`, qui attend HTTP 200 et reçoit 403 `UNAUTHORIZED_PROMOTION` pour un reçu d'approbation invalide.
- `python scripts/ci/check_code_quality.py` au dernier contrôle : 6 096 fichiers analysés, 9 violations de baseline et 0 nouvelle. Aucun seuil ni baseline n'a été modifié.

Les anciens symboles de débogage, caches incrémentaux inactifs et exécutables de tests régénérables de target/debug ont été nettoyés pour poursuivre. Aucun reçu, base de données ou fichier source n'a été supprimé.

## Corrections vérifiées

- Dose nulle sans retrait de diagnostic; inflammation invalide refusée.
- Purge limitée à la signature demandée; isolement maintenu tant qu'un diagnostic subsiste et levé après résolution du dernier diagnostic ciblé.
- Mesures absentes ou invalides sans rémission annoncée; absence de cible distincte du refus et de l'application.
- Effet de marqueur rapporté avant/après et persisté avant mise à jour mémoire; rejeu sans nouvelle mutation.
- Effets secondaires de marqueur conservés tant que leur risque persiste; remplacement des cicatrices sans rémission fictive d'une mémoire prionique.

Ces résultats portent sur les contrats logiciels. Les scénarios ne valident aucune pathologie réelle.
