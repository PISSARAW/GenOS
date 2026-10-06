# Validation de la biologie computationnelle

- Date : 2026-10-06.
- Statut : preuves locales reproductibles; résultats globaux détaillés ci-dessous.
- Périmètre : reçus d'exécution, liaison mission/cellule/génome/coûts/résultat, autorité durable et clôture de mission.
- Architecture : [ADR 0324](../adr/0324-biologie-execution-et-autorite-durable.md).

## Commandes reproductibles

Depuis la racine du dépôt :

```powershell
npm run test:biology
node backend/tests/test_biological_receipt_bridge.js
node backend/tests/test_strategy_phase_gate.js
cargo build -p genos-cli
node backend/tests/test_biological_tick_rust_backend_e2e.js
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Pour un target Cargo placé sur un autre disque, construire avec `--target-dir`, puis définir `GENOS_BIOLOGICAL_TEST_BIN` au chemin absolu du binaire compilé. Les bases de test sont temporaires; `TEMP` et `TMP` peuvent désigner un dossier dédié. Aucun binaire, base ni secret n'est versionné.

## Preuves ciblées

| Test | Propriété contrôlée |
| --- | --- |
| `test_homeostasis_durable_authority.js` | Révisions immuables, rejeu sans fallback, modification avec révision attendue, concurrence idempotente, seuils v2, compatibilité v1 et reprise d'une migration annulée |
| `test_homeostasis_authority_receipts.js` | Empreintes, états et reçus d'autorisation/refus de transition |
| `test_biological_ingestion_atomic.js` | Origine vérifiée, remapping conservant l'identité Rust, ingestion atomique de la population et des reçus, rollback et doublons |
| `test_biological_receipt_ingestion.js` | Attribution des reçus du contrôle Rust à la mission backend |
| `test_biological_worker_receipts.js` | Liaison au worker réel, génome figé, coûts d'un succès ou échec, inconnus explicites, immutabilité, propriété du run et absence de double débit |
| `test_biological_worker_restart.js` | Calcul réel de subset-sum dans un processus enfant, gates de stratégie, SQLite partagé, observation interrompue puis rejouée après redémarrage, cellule/génome stables, autorité persistée et refus d'une clôture périmée par service et SQL direct |
| `test_biological_receipt_audit.js` | Historique borné en lecture seule, empreintes, génome et isolation tenant par requête SQLite |
| `test_biological_receipt_bridge.js` | Raccordement du contrôle Rust, origine signée et contrôleur backend |
| `test_strategy_phase_gate.js` | Conservation du refus lorsqu'une phase précédente n'est pas terminée |
| `test_biological_tick_rust_backend_e2e.js` | Deux processus du CLI compilé, reçus et population persistés, tick croissant, identité stable et lignée de division |
| `checkpoint_recovery.rs` et `biological.rs::receipt_tick_tests` | Compteur de reçus conservé dans le checkpoint et plancher du journal de la même mission pour les checkpoints historiques |

Le test de reprise utilise les services réels de procédure, stratégie, télémétrie, autorité et stockage. Seule la persistance secondaire des logs de télémétrie est désactivée dans sa fixture; les observations biologiques et gates sont exercées. Le test d'audit contrôle la requête tenant et les services, sans constituer une campagne HTTP déployée.

## Limites de la preuve

Les coûts du contrôle Rust restent en `atp_token`. Les workers Node rapportent tokens, USD et durée séparément; une mesure requise absente refuse l'attestation du budget. Les USD de télémétrie ne constituent pas une facture fournisseur. La campagne locale ne démontre ni disponibilité distribuée ni exécution chez un fournisseur externe.

Une réussite de transport ne permet aucune promotion. Les reçus favorables exigent les gates de résultat et les preuves courantes; le stockage conserve également les issues défavorables.

## Contrôles globaux

Le contrôle de qualité du workspace partagé a observé 5 029 fichiers, 300 violations dont 154 nouvelles par rapport à la baseline. Aucun fichier de cette implémentation n'était signalé dans ce résultat. La baseline n'a pas été modifiée. Les commits appliquent également le contrôle des fichiers sélectionnés par les hooks du dépôt.

La première tentative des suites Node et Rust a rencontré un disque C: saturé (`SQLITE_FULL`, erreur système 112). Les vérifications ont été reprises avec un dossier temporaire et un target Cargo dédiés sur D:.

`npm test` a ensuite terminé avec succès : biologie 7/7, backend général 55/55, autorité, AEIS, Syncytium (45 suites), Axolotl (8 suites), Biome (19 programmes), workers (18 suites incluant les 19 méthodes natives) et Garage (7 suites). Les premiers échecs de feedback Biome et d'adéquation des workers ne se reproduisent pas dans ce dernier rejeu du workspace partagé. Le bridge biologique et le test de gate des phases passent également.

L'E2E du CLI a détecté une reprise au tick 1 : le compteur de reçus n'était pas conservé par le checkpoint. La correction persiste ce compteur et relit le plancher du journal de la même mission pour les anciens checkpoints. Le refus des populations contradictoires au même tick est conservé. Après correction, l'E2E passe avec deux processus compilés, six reçus d'exécution persistés, ticks croissants, cellule/génome stables et fille de division conservée après reprise. L'identité de la cellule exécutante est contrôlée séparément de celle de la division.

`cargo test --workspace` a terminé avec succès après la correction, puis le CLI a été recompilé. Le test ciblé `cargo test -p genos-cli receipt_tick` passe également et vérifie que le journal d'une autre mission ne peut pas augmenter le compteur restauré.
