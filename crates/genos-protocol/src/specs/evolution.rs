use crate::schema::{number_schema, object_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn evolution_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new(
            "evolution_assimilate_plasmid",
            "Assimilate Plasmid",
            "Forcer l'assimilation d'un plasmide MCP pour le transfert horizontal de gènes.",
        )
        .schema(object_schema(
            [(
                "plasmid_id",
                string_schema("L'identifiant du plasmide à assimiler"),
            )],
            &["plasmid_id"],
        ))
        .build(),
        SpecBuilder::new(
            "evolution_set_entropy_threshold",
            "Set Entropy Threshold",
            "Modifier le seuil d'entropie pour le routage dynamique des modèles (SLM vs Frontier).",
        )
        .schema(object_schema(
            [(
                "threshold",
                number_schema("La valeur du nouveau seuil d'entropie (ex. 0.8)"),
            )],
            &["threshold"],
        ))
        .build(),
    ]
}
