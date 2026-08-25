use crate::schema::{object_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn resilience_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new(
            "parasitic_pressure",
            "Run Parasitic Pressure",
            "Evaluate and optionally evolve parasite genomes against an agent population in an isolated manifest.",
        )
        .schema(object_schema(
            [("input", string_schema("JSON parasitism input manifest")), ("output", string_schema("JSON report output path")), ("evolve", string_schema("Whether to evolve parasites: true or false"))],
            &["input", "output"],
        ))
        .build(),
        SpecBuilder::new(
            "resilience_apoptosis",
            "Trigger Apoptosis",
            "Gracefully shutdown an agent to prevent state corruption.",
        )
        .schema(object_schema(
            [("agent_id", string_schema("Agent identifier"))],
            &["agent_id"],
        ))
        .build(),
        SpecBuilder::new(
            "resilience_cryptobiosis",
            "Trigger Cryptobiosis",
            "Put the environment in offline stasis mode.",
        )
        .schema(object_schema(
            [(
                "mode",
                string_schema("Cryptobiosis mode (e.g. offline, stasis)"),
            )],
            &["mode"],
        ))
        .build(),
        SpecBuilder::new(
            "resilience_hypermutation",
            "Trigger Hypermutation",
            "Trigger hypermutation fuzzing on a target.",
        )
        .schema(object_schema(
            [("target", string_schema("Target to fuzz"))],
            &["target"],
        ))
        .build(),
        SpecBuilder::new(
            "resilience_circuit_breaker",
            "Trigger Circuit Breaker",
            "Cut off a runaway counterfactual branch.",
        )
        .schema(object_schema(
            [("branch_id", string_schema("Branch identifier"))],
            &["branch_id"],
        ))
        .build(),
        SpecBuilder::new(
            "resilience_lytic_burst",
            "Plan Lytic Burst",
            "Plan a deterministic burst of divergent clones around a stalled lineage, capped by the quasispecies error-threshold guard.",
        )
        .schema(object_schema(
            [
                ("genome_id", string_schema("Stalled parent genome identifier")),
                ("clones", string_schema("Requested clone count")),
                ("sigma", string_schema("Mutant cloud width around the master sequence")),
                ("seed", string_schema("Deterministic burst seed")),
            ],
            &["genome_id"],
        ))
        .build(),
        SpecBuilder::new(
            "resilience_transduce",
            "Assemble Transduction Capsule",
            "Package a winning delta into a signed capsule and gate it through negative selection and superinfection exclusion.",
        )
        .schema(object_schema(
            [
                ("capsule_id", string_schema("Capsule identifier")),
                ("from_genome", string_schema("Provenance genome identifier")),
                ("payload", string_schema("Winning strategy delta payload")),
                ("signature", string_schema("Failure-mode embedding as space-separated floats")),
                ("proof_hash", string_schema("Hash of the sandboxed evaluation artifact proving the payload works")),
            ],
            &["capsule_id", "from_genome", "payload", "proof_hash"],
        ))
        .build(),
        SpecBuilder::new(
            "security_virophage_deploy",
            "Deploy Virophage",
            "Confirm an antigen and deploy a virophage agent into the honeypot viral factory hosting the attacker playbook.",
        )
        .schema(object_schema(
            [
                ("session_id", string_schema("Honeypot session base identifier")),
                ("source_signature", string_schema("Signature of the confirmed attacker source")),
            ],
            &["session_id", "source_signature"],
        ))
        .build(),
    ]
}
