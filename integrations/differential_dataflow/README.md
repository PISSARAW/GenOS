# Propagation différentielle expérimentale

Ce crate isolé utilise `differential-dataflow` pour calculer les dépendants
d'une croyance racine après ajout puis retrait d'une arête. Le test exige un
delta positif puis négatif ; il démontre la propagation incrémentale, pas un
gain de performance sur le Rhizome réel.

`cargo test --manifest-path integrations/differential_dataflow/Cargo.toml`

L'adoption dans le runtime dépendra d'un profilage contre le recalcul actuel,
avec les mêmes graphes et changements. Les deltas ne décident ni de la vérité
d'une croyance ni de la promotion GVX.

Source : [Differential Dataflow](https://github.com/TimelyDataflow/differential-dataflow).
