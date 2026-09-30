# ADR 0188 — Provenance versionnée de reproduction et fossilisation

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Décideurs** : Runtime GenOS

## Contexte

Le cycle autonome de reproduction conservait la génération et les identifiants
parent/fille, mais ne publiait pas le seed qui pilote les mutations ni les
empreintes vérifiables des génomes. La fossilisation pouvait archiver une
lignée sans preuve de cet historique.

## Décision

Chaque division émet `genos.reproduction-event/v1`, incluant cellules et
génomes parent/fille, lineage, seed RNG, taux et nombre de mutations, et
empreintes des deux génomes. L'API runtime de fossilisation exige au moins un
événement de reproduction versionné pour la lignée et inclut cet historique
dans `genos.lineage-fossilization/v1` avec l'identifiant et l'empreinte du
fossile.

## Conséquences

- Une lignée sans historique versionné est refusée par cette API.
- Le seed permet d'auditer la provenance des mutations; la replay exacte reste
  soumise aux versions du moteur et des règles de mutation.
- Les événements restent dans l'event store mémoire actuel; la durabilité
  inter-redémarrage devra être apportée séparément.

## Preuve

- `crates/genos-orchestrator/src/reproduction_cycle.rs`
- `crates/genos-orchestrator/src/lineage_archive.rs`
- Tests `reproduction_emit_parent_seed_mutations_and_fingerprints` et
  `fossilization_requires_and_preserves_versioned_lineage_provenance`
