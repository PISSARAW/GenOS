# ADR 0191 — Quorum d'électrocyte lié à la mission

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Décideurs** : Runtime GenOS

## Contexte

L'organe électrique additionnait des tensions localement, sans condition de
participation, d'échéance ou de preuve de décision associée à une mission.

## Décision

Le runtime expose `discharge_electric_under_quorum`. Il exige une mission et
une proposition, au moins deux votes uniques de cellules actives, une majorité
stricte et une échéance non expirée. La décharge n'est appelée qu'après ces
vérifications. Les acceptations et refus émettent un événement versionné avec
participants et latence mesurée.

## Conséquences

- Les votes sont des déclarations fournies au runtime, non des signatures
  d'identité; ce chemin n'est pas un consensus distribué authentifié.
- Le résultat électrique peut rester `SUB_QUORUM_DISCHARGE` si l'organe
  simulé ne franchit pas son seuil physique.
- Les événements sont conservés dans l'event store mémoire; une persistance
  après redémarrage reste à intégrer.

## Preuve

- `crates/genos-orchestrator/src/electric_quorum_runtime.rs`
- Tests `electric_discharge_requires_live_multi_cell_quorum_and_records_measurement`
  et `expired_electric_quorum_is_refused_without_depolarizing_cells`
