use crate::schema::{object_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn ais_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new(
            "ais_negative_screen",
            "AIS Negative Selection Screen",
            "Thymic censoring: eliminate candidate detectors that react to the benign self-corpus before deployment.",
        )
        .schema(object_schema(
            [
                ("candidates", string_schema("Candidate detector embeddings as space-separated floats")),
                ("self_corpus", string_schema("Benign self-corpus embeddings as space-separated floats")),
                ("gamma", string_schema("RBF affinity gamma")),
                ("theta_self", string_schema("Affinity above which a candidate is self-reactive")),
            ],
            &["candidates", "self_corpus"],
        ))
        .build(),
        SpecBuilder::new(
            "ais_clonal_hypermutate",
            "AIS Clonal Hypermutation",
            "Clonal selection with error-proportional somatic hypermutation and affinity maturation of an antibody against an antigen.",
        )
        .schema(object_schema(
            [
                ("antibody_id", string_schema("Antibody identifier")),
                ("centroid", string_schema("Antibody centroid embedding")),
                ("antigen", string_schema("Antigen embedding")),
                ("clone_factor", string_schema("Number of clones per expansion round")),
                ("seed", string_schema("Deterministic expansion seed")),
            ],
            &["antibody_id", "centroid", "antigen"],
        ))
        .build(),
        SpecBuilder::new(
            "ais_danger_telemetry",
            "AIS Danger Telemetry",
            "Matzinger danger theory: aggregate DAMP signals (failures, semantic divergence, context pollution, cost overrun, invariant breach) into an immune-response decision.",
        )
        .schema(object_schema(
            [
                ("agent_id", string_schema("Agent identifier")),
                ("consecutive_failures", string_schema("Consecutive failure count")),
                ("semantic_divergence", string_schema("Normalized semantic divergence in [0, 1]")),
                ("invariant_breach", string_schema("Whether a critical security invariant was breached: true or false")),
            ],
            &["agent_id"],
        ))
        .build(),
    ]
}
