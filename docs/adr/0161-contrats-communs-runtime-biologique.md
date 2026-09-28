# ADR 0161 — Contrats communs du runtime biologique

- **Statut** : Accepté
- **Date** : 2026-09-28
- **Domaine** : Biomimétisme, runtime, Rust/Node, preuve
- **Décideurs** : Mainteneurs GenOS
- **Lié à** :
  - `../../shared/bioRuntimeContracts.json` (schéma canonique v1.0.0)
  - `../../crates/genos-bio-contracts/src/lib.rs` (`SCHEMA_VERSION`, budgets, reçus)
  - `../../crates/genos-bio-contracts/src/ids.rs` (identifiants stables)
  - `../../crates/genos-bio-contracts/src/states.rs` (états et effets)
  - `../../backend/src/services/bioContractsService.js` (miroir Node)
  - Tests : `../../crates/genos-bio-contracts/src/tests.rs`, `src/ids.rs`, `src/states.rs`, `../../backend/tests/test_bio_contracts.js`
  - Docs : `../../docs/01-concepts/biomimetisme/inventaire-biologique.md`, `maturite-biologique.md`

## Contexte

Les mécanismes biologiques traversaient Rust et Node sans identité, provenance,
budgets ni statut de preuve communs. Les documents attribuaient aux primitives
des effets non démontrés (zéro-latence, consensus, compilation, crypto).

## Décision

Tout mécanisme biologique suit le cycle état observé → signal typé → décision
sous budget et permissions → effet vérifiable → reçu et provenance → état
persisté. Le schéma `1.0.0` impose organisme, agent, génome, épisode, état
initial, budget, permissions, effet, preuve et origine
(`simulated`, `local`, `external`). Les versions majeures incompatibles
échouent explicitement (`BIO_SCHEMA_MISMATCH`). Les identifiants sont stables
(`org_`, `cell_`, `lin_`, `mission_`, `evt_` + portée + séquence). Les états
`durable`, `session`, `calcule` et les effets `exécuté`, `simulé` sont
distingués ; un effet simulé ne promeut rien. Le miroir Node applique les
mêmes refus déterministes.

## Conséquences

- Positives : identité et provenance préservées entre Rust et Node ; refus
  déterministes et persistables ; simulations explicitement étiquetées.
- Négatives : portée contrats uniquement — enforcement aux points d'exécution,
  registre de ressources, lignées rejouables et preuves bout en bout restent à
  livrer (Phases 2-9).
- Neutres : aucune revendication d'effet biologique réel ; constantes de
  démonstration conservées comme telles.

## Alternatives

- **Statu quo dispersé** : rejeté — perte d'identité et surpromesses.
- **Schéma non versionné** : rejeté — incompatibilités silencieuses.
