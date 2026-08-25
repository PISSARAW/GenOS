use crate::schema::{object_schema, string_array_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;
#[path = "biomimicry_ext.rs"]
mod ext;


pub fn biomimicry_specs() -> Vec<ToolSpec> {
    let mut specs = vec![
        SpecBuilder::new(
            "biomimicry_swarm_consensus",
            "Swarm Consensus",
            "Trigger swarm consensus evaluation.",
        )
        .schema(object_schema(
            [("target", string_schema("Consensus target"))],
            &["target"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_flocking_explore",
            "Flocking Explore",
            "Launch a boids-based heuristic exploration.",
        )
        .schema(object_schema(
            [("area", string_schema("Area to explore"))],
            &["area"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_network_quorum",
            "Network Quorum",
            "Evaluate network quorum state.",
        )
        .schema(object_schema(
            [("node", string_schema("Node identifier"))],
            &["node"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_distributed_huddle",
            "Distributed Huddle",
            "Sync a distributed huddle state.",
        )
        .schema(object_schema(
            [("state_file", string_schema("Path to huddle state file"))],
            &["state_file"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_inject_pheromone",
            "Inject Pheromone",
            "Inject pheromones manually onto the spatial grid.",
        )
        .schema(object_schema(
            [
                ("node", string_schema("Target node identifier")),
                (
                    "pheromone_type",
                    string_schema("Type of pheromone to inject"),
                ),
                ("amount", string_schema("Amount of pheromone to inject")),
            ],
            &["node", "pheromone_type", "amount"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_genetic_sos",
            "Genetic SOS",
            "Trigger a genetic SOS response for an agent.",
        )
        .schema(object_schema(
            [
                ("agent_id", string_schema("Agent identifier")),
                ("stress_level", string_schema("Stress level")),
            ],
            &["agent_id", "stress_level"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_alter_plasmid",
            "Alter Plasmid",
            "Alter a plasmid for horizontal gene transfer.",
        )
        .schema(object_schema(
            [
                ("plasmid_id", string_schema("Plasmid identifier")),
                ("payload", string_schema("New payload")),
            ],
            &["plasmid_id", "payload"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_observe_gradient",
            "Observe Morphogenetic Gradient",
            "Observe the positional morphogenetic gradient of an agent.",
        )
        .schema(object_schema(
            [("agent_id", string_schema("Agent identifier"))],
            &["agent_id"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_manipulate_gradient",
            "Manipulate Morphogenetic Gradient",
            "Manipulate the positional morphogenetic gradient of an agent.",
        )
        .schema(object_schema(
            [
                ("agent_id", string_schema("Agent identifier")),
                (
                    "gradient_value",
                    string_schema("New gradient value (float)"),
                ),
            ],
            &["agent_id", "gradient_value"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_brier_consensus",
            "Brier Consensus",
            "Evaluate the Brier Consensus for a huddle topic.",
        )
        .schema(object_schema(
            [("topic", string_schema("Topic to evaluate"))],
            &["topic"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_alter_huddle",
            "Alter Huddle",
            "Inject a verified belief into a distributed huddle.",
        )
        .schema(object_schema(
            [
                ("topic", string_schema("Topic to alter")),
                ("agent_id", string_schema("Agent ID")),
                ("payload", string_schema("Hypothesis payload")),
            ],
            &["topic", "agent_id", "payload"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_cryptobiosis_force",
            "Force Cryptobiosis",
            "Forces an agent into Zstandard cryptobiosis state.",
        )
        .schema(object_schema(
            [("agent_id", string_schema("Agent ID to suspend"))],
            &["agent_id"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_ampk_alter",
            "Alter AMPK Charge",
            "Alters the Atkinson energy charge for an agent.",
        )
        .schema(object_schema(
            [
                ("agent_id", string_schema("Agent ID to target")),
                ("atp", string_schema("ATP value")),
                ("adp", string_schema("ADP value")),
                ("amp", string_schema("AMP value")),
            ],
            &["agent_id", "atp", "adp", "amp"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_gate_evaluate",
            "Cycle Checkpoint Gate Evaluate",
            "Evaluate a vital-phase checkpoint gate against declared facts. Fails closed: a missing fact blocks progression.",
        )
        .schema(object_schema(
            [
                (
                    "phase",
                    string_schema("Vital phase: init | fork | run | diff | merge"),
                ),
                (
                    "genome_coherent",
                    string_schema("Fact: genome passes coherence validation"),
                ),
                ("niche_available", string_schema("Fact: target niche is available")),
                ("budget_allocated", string_schema("Fact: budget is allocated")),
                (
                    "genome_state_leak",
                    string_schema("Fact: genome/state separation leak detected"),
                ),
                (
                    "parent_snapshot_sealed",
                    string_schema("Fact: parent snapshot is sealed (fork gate)"),
                ),
                (
                    "world_isolated_cow",
                    string_schema("Fact: world substrate is isolated CoW"),
                ),
                (
                    "pre_run_snapshot_sealed",
                    string_schema("Fact: pre-run snapshot sealed"),
                ),
                (
                    "invariants_respected",
                    string_schema("Fact: genome/state invariants hold"),
                ),
                (
                    "cross_world_leak",
                    string_schema("Fact: cross-world contamination detected"),
                ),
                ("diff_complete", string_schema("Fact: diff computation complete")),
                (
                    "replay_verified",
                    string_schema("Fact: causal replay verified on independent run"),
                ),
                ("pareto_validated", string_schema("Fact: Pareto validation passed")),
                ("heredity_proven", string_schema("Fact: heredity proof established")),
            ],
            &["phase"],
        ))
        .build(),
        SpecBuilder::new(
            "genos_epigenetic_chromatin",
            "Epigenetic Chromatin",
            "Modulates the chromatin vector (methylation, acetylation) of an agent's operon to hide or expose competencies.",
        )
        .schema(object_schema(
            [
                ("agent_id", string_schema("Agent identifier")),
                ("promoter", string_schema("Operon promoter to target")),
                ("methylation_delta", string_schema("Delta for methylation level")),
                ("acetylation_delta", string_schema("Delta for histone acetylation")),
            ],
            &["agent_id", "promoter"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_chaperone_repair",
            "Chaperone Assisted Repair",
            "Attempt an ATP-bounded refold of a damaged component before routing it to proteolysis. Damaged slots are empty fragments; template value '-' means no reference template.",
        )
        .schema(object_schema(
            [
                ("component_id", string_schema("Damaged component identifier")),
                ("kind", string_schema("Component kind (canonical schema key)")),
                (
                    "fragments",
                    string_array_schema("Ordered fragments; an empty string models a mis-folded slot"),
                ),
                (
                    "templates",
                    string_array_schema(
                        "Optional per-slot reference templates, '-' for none; same order as fragments"
                    ),
                ),
                ("max_attempts", string_schema("Max chaperoned attempts (default 3)")),
                ("atp_budget", string_schema("Available ATP budget (default 5)")),
            ],
            &["component_id", "kind", "fragments"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_vaccinate",
            "Vaccinate Agent",
            "Train immune memory cells from attenuated attack signatures with negative self-tolerance selection, then optionally probe the secondary response.",
        )
        .schema(object_schema(
            [
                (
                    "malicious",
                    string_array_schema("Attenuated attack signatures (whitespace-tokenized)"),
                ),
                (
                    "benign",
                    string_array_schema("Benign signatures defining tolerated self"),
                ),
                ("probe", string_schema("Optional signature to test the secondary response against")),
            ],
            &["malicious"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_interferon_emit",
            "Emit Interferon Alert",
            "Prime neighboring capsules into an antiviral state (sensitivity boost, frozen external writes) after a confirmed threat detection.",
        )
        .schema(object_schema(
            [
                ("source_id", string_schema("Capsule that confirmed the threat")),
                ("signature", string_schema("Confirmed threat signature tokens")),
                (
                    "neighbors",
                    string_array_schema("Neighborhood capsule ids inside the paracrine radius"),
                ),
                ("ttl_seconds", string_schema("Antiviral state lifetime in seconds (default 300)")),
            ],
            &["source_id", "signature", "neighbors"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_sar_prime",
            "Prime Systemic Acquired Resistance",
            "Convert a resolved incident into a durable system-wide defensive priming with half-life decay, or assess a probe against existing primings.",
        )
        .schema(object_schema(
            [
                ("incident_id", string_schema("Resolved incident identifier (prime action)")),
                ("signature", string_schema("Threat signature tokens of the resolved incident")),
                ("half_life_days", string_schema("Decay half-life in days (default 30)")),
                ("now_day", string_schema("Current day index for decay arithmetic")),
                ("probe", string_schema("Signature to assess against primings (assess action)")),
                (
                    "primings",
                    string_array_schema(
                        "Existing primings as id:signature:half_life_days:primed_at_day (assess action)"
                    ),
                ),
            ],
            &[],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_reciprocity_decide",
            "Reciprocity Decision",
            "Tit-for-Tat with bounded forgiveness: decide whether to cooperate with a peer given its recorded history, containing free-riders without central authority.",
        )
        .schema(object_schema(
            [
                ("peer_id", string_schema("Counterpart identifier")),
                ("cooperations", string_schema("Recorded cooperation count")),
                ("defections", string_schema("Recorded defection count")),
                (
                    "last_action",
                    string_schema("Last observed peer action: cooperate | defect"),
                ),
            ],
            &["peer_id"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_skill_proceduralize",
            "Proceduralize Skill",
            "Compile a repeatedly-successful stereotyped task into a monitored reflex (cerebellar style), or monitor/refine an installed reflex.",
        )
        .schema(object_schema(
            [
                ("skill", string_schema("Skill / task name")),
                ("successes", string_schema("Recorded successful executions")),
                ("failures", string_schema("Recorded failed executions")),
                ("variance", string_schema("Trajectory dispersion proxy, 0..1 (low = stereotyped)")),
                ("steps", string_array_schema("Ordered reflex steps to install or refine")),
                ("preconditions", string_array_schema("Preconditions gating the reflex")),
                ("failure_rate", string_schema("Recent failure rate 0..1 (monitor action)")),
            ],
            &["skill"],
        ))
        .build(),
    ];
    specs.extend(ext::biomimicry_ext_specs());
    specs
}
