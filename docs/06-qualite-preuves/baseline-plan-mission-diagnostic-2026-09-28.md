# Phase 0.3 — Diagnostic des echecs preexistants

## 1. Boucle autonome Rust (`drives::boucle_autonome_sans_but_externe`)

- Historique : echec documente au §01b (`suivi-validation-indicateurs.md`) —
  halte decisionnelle attendue, borne de ticks atteinte sans halte.
- Reproduction du 2026-09-28 :
  `cargo test -p genos-orchestrator --test drives boucle_autonome_sans_but_externe`
  → **1 passed** (7.14 s). Filtre `--lib` seul donne 0 test (normal :
  le cas vit dans `tests/drives.rs`, pas dans `lib.rs`).
- Statut : **resolu sur ce checkout**, sans modification du present plan.
  Attribution probable aux correctifs Rust empiles par l'auteur concurrent
  (lots 01b-R, Phase 1.1–1.3). A surveiller en CI : distinguer halte
  decisionnelle vs borne atteinte avant tout changement de contrat.

## 2. Suite securite

- `npm --prefix backend run test:security` → **4/4, ALL CHALLENGES PASSED**
  (28.5 s). Aucun echec preexistant reproductible sur ce checkout.
- Les 55 tests backend incluent kill-switch, terminal/commande (401 vs 200),
  bisection et rollback. Vert.

## 3. RPC gRPC `AgentService.StartMission`

- `npm --prefix backend run test:grpc` → **41/41 Ping OK**.
  `AgentService.StopMission` et `OrchestratorService.DispatchWorker` OK.
  `McpService.ListTools` → 0 outils enregistres (coherent avec bail fermé).
- **Aucun cas `StartMission` dans la suite** : l'echeance signalee est
  une absence de couverture, pas un echec execute.
  Action transferee en Phase 2.3 : ajouter matrice
  `RPC → controleur → auth → tenant/scope → schema → test nominal/refus`
  et un test nominal + refus pour `StartMission`.

## Conclusion

Aucun des trois echecs ne bloque la suite au sens d'un rouge reproductible
ce jour, sauf le gate qualite global (Phase 0.2) et l'absence de couverture
`StartMission`. Le rapport de reference (Phase 0.4) fige cet etat.
