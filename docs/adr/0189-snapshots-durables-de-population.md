# ADR 0189 — Snapshots durables de population

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Décideurs** : Runtime GenOS

## Contexte

Les cellules actives, spores dormantes, tissus et génomes existent dans les
registres mémoire de l'orchestrateur. Un reçu d'exécution isolé ne permet pas
de reconstituer la population ni ses liens de provenance après redémarrage.

## Décision

Chaque appel à `tick_and_persist` ajoute au journal hash-chainé un snapshot
`genos.population-state/v1` contenant mission, tick, cellules actives,
appartenance tissulaire, génération/ligne et empreintes de génome, ainsi que
les spores dormantes avec parent, type et provenance génomique.

## Conséquences

- Les snapshots sont relisibles via `BiologicalReceiptStore::read_all` après
  réouverture du journal.
- Un génome associé qui ne peut pas produire d'empreinte fait échouer la
  persistance du tick en conservant son rapport.
- La restauration des objets vivants depuis les snapshots reste à implémenter;
  ce commit établit le registre durable et vérifiable.

## Preuve

- `crates/genos-orchestrator/src/population_registry.rs`
- `crates/genos-orchestrator/src/durable_receipts.rs`
- Tests `population_snapshot_preserves_cell_and_spore_lineage` et
  `persisted_tick_contains_population_snapshot_for_restart_recovery`
