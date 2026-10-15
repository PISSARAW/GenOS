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
les spores dormantes avec parent, type et provenance génomique. Le reçu contient
aussi l'identifiant de la cellule racine et les objets `Tissue` sérialisés pour
préserver les fonctions, l'écologie et l'appartenance des cellules.

## Conséquences

- Les snapshots sont relisibles via `BiologicalReceiptStore::read_all` après
  réouverture du journal.
- Un génome associé qui ne peut pas produire d'empreinte fait échouer la
  persistance du tick en conservant son rapport.
- `restore_population` restaure les cellules, tissus, génomes et spores depuis
  le snapshot le plus récent de la mission; `resume_mission_from_journal` filtre
  explicitement par mission afin que plusieurs missions puissent partager un
  journal.
- Les snapshots v1 historiques qui ne contiennent pas encore l'identifiant
  racine ni les objets tissu récupèrent la racine depuis la cellule « Stem » et
  reconstruisent les membres depuis les noms de tissu des cellules. Leur ancien
  rôle fonctionnel et leur état écologique ne sont pas récupérables.
- Un identifiant racine absent, une appartenance incohérente ou un tissu mal
  formé bloque la restauration avant mutation du runtime.

## Preuve

- `crates/genos-orchestrator/src/population_registry.rs`
- `crates/genos-orchestrator/src/population_restore.rs`
- `crates/genos-orchestrator/src/durable_receipts.rs`
- Tests `population_snapshot_preserves_cell_and_spore_lineage` et
  `persisted_tick_contains_population_snapshot_for_restart_recovery`; les tests
  `spore_process_restart` vérifient la reprise filtrée par mission, la
  restauration des tissus et la compatibilité des snapshots historiques.
