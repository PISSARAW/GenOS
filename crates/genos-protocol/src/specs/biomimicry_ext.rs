//! Extension specs for biomimicry tools (population & lifecycle family).
//! Kept separate from `biomimicry.rs` to respect the 400-line file budget;
//! merged into the catalog by `biomimicry_specs()`.

use crate::schema::{object_schema, string_array_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn biomimicry_ext_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new("biomimicry_reflex_trigger", "Reflex Arc Fast-Path", "Bypass the MCTS/LLM planner for an immediate hardcoded survival response (Withdraw, Freeze) upon critical stimuli.").schema(object_schema([("stimulus", string_schema("thermal | nociceptive")), ("value", string_schema("The intensity or payload of the stimulus")), ("pain_threshold", string_schema("Length threshold for pain")), ("heat_threshold", string_schema("Value threshold for heat"))], &["stimulus", "value"])).build(),
        SpecBuilder::new("biomimicry_endocrine_modulate", "Endocrine System Modulation", "Secrete hormones to globally modulate swarm behavior (e.g., Cortisol for focus, Oxytocin for trust).").schema(object_schema([("swarm_id", string_schema("The target swarm ID")), ("endocrine_action", string_schema("secrete | decay")), ("hormone", string_schema("e.g., cortisol, adrenaline, oxytocin")), ("amount", string_schema("Amount to secrete (0.0 to 1.0)")), ("decay_factor", string_schema("Rate of decay"))], &["endocrine_action"])).build(),
        SpecBuilder::new("biomimicry_regeneration_tissue", "Tissue Regeneration", "Amputate a corrupted module and regenerate it from a known blastema checkpoint.").schema(object_schema([("module_id", string_schema("The corrupted module ID")), ("base_checkpoint_hash", string_schema("The known good checkpoint hash to regenerate from")), ("regenerate_action", string_schema("amputate | complete"))], &["module_id", "regenerate_action"])).build(),
        SpecBuilder::new("biomimicry_metamorphosis_transition", "Metamorphosis Transition", "Trigger a radical structural change (Larval -> Pupal -> Imago) and compute tools to shed or acquire.").schema(object_schema([("agent_id", string_schema("Agent ID")), ("current_stage", string_schema("larval, pupal, or imago")), ("current_tool", string_array_schema("List of currently held tools")), ("target_tool", string_array_schema("List of tools required for the target niche"))], &["agent_id", "current_stage"])).build(),
        SpecBuilder::new("biomimicry_canalization_evaluate", "Canalization Robustness Evaluate", "Evaluate if a set of perturbed trajectories reliably converges to the expected phenotype (Waddington landscape).").schema(object_schema([("expected_phenotype", string_schema("The desired final state hash")), ("valley_width", string_schema("Tolerance ratio (0.0 to 1.0)")), ("trajectory", string_array_schema("List of resulting hashes from perturbed trajectories"))], &["expected_phenotype", "trajectory"])).build(),
        SpecBuilder::new("biomimicry_hox_verify", "Hox Genes Colinearity Verify", "Verify if capabilities were activated in the strict order defined by Hox structural genes.").schema(object_schema([("activated", string_array_schema("List of activated capabilities in chronological order"))], &["activated"])).build(),
        SpecBuilder::new("biomimicry_embryo_phase_advance", "Embryogenesis Phase Advance", "Advance an agent to the next developmental phase.").schema(object_schema([("agent_id", string_schema("Agent ID")), ("current_phase", string_schema("Current phase")), ("preconditions_met", string_schema("Are preconditions met (true/false)"))], &["agent_id", "current_phase"])).build(),
        SpecBuilder::new(
            "biomimicry_telomere_fork",
            "Telomere Fork Budget",
            "Consume one fork from a lineage budget (Hayflick limit) or attempt an explicit capped telomerase restoration; exhausted lineages must breed.",
        )
        .schema(object_schema(
            [
                ("capsule_id", string_schema("Capsule whose lineage budget is managed")),
                ("remaining", string_schema("Current remaining fork budget")),
                ("max_forks", string_schema("Total lineage budget")),
                (
                    "action",
                    string_schema("fork (consume one unit) | restore (telomerase re-certification)"),
                ),
                ("new_max", string_schema("New total budget for restore action")),
                ("restoration_count", string_schema("Restorations already used (restore action)")),
                ("max_restorations", string_schema("Restoration quota (default 2)")),
            ],
            &["capsule_id", "remaining", "max_forks"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_senescence_assess",
            "Senescence Fleet Hygiene",
            "Classify capsules into active / intentionally-dormant / senescent-zombie states and order senolytic cleanup by harm emitted per consumed resource.",
        )
        .schema(object_schema(
            [
                ("capsule_id", string_schema("Capsule identifier")),
                ("productive_ticks", string_schema("Ticks with meaningful output")),
                ("idle_ticks", string_schema("Ticks alive without output")),
                ("resources_consumed", string_schema("Resources consumed in the window")),
                (
                    "negative_externalities",
                    string_schema("External harm units: blocking locks, stale pheromones, empty alerts"),
                ),
                ("intentional_dormancy", string_schema("True when idleness is deliberate (spore, standby)")),
            ],
            &["capsule_id", "productive_ticks", "idle_ticks", "resources_consumed"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_neoteny_quota",
            "Neoteny Fleet Quota",
            "Gate a spawn request against the fleet's neotenic reserve: specialists are converted or deferred when the plasticity floor would be breached.",
        )
        .schema(object_schema(
            [
                ("total_agents", string_schema("Current fleet size")),
                ("neotenic_agents", string_schema("Current neotenic count")),
                ("request", string_schema("neotenic | specialist")),
                ("fraction", string_schema("Reserved fraction, clamped to 0.05..0.5 (default 0.2)")),
            ],
            &["total_agents", "neotenic_agents", "request"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_speciation_check",
            "Speciation Compatibility Check",
            "Assess breeding/merge compatibility between two lineages from their allele sets: same species, hybrid-sterile, or incompatible species.",
        )
        .schema(object_schema(
            [
                ("allele-a", string_array_schema("Allele markers of lineage A")),
                ("allele-b", string_array_schema("Allele markers of lineage B")),
                ("hybrid_threshold", string_schema("Distance above which hybrids are sterile (default 0.30)")),
                ("speciation_threshold", string_schema("Distance above which species are incompatible (default 0.60)")),
            ],
            &["allele-a", "allele-b"],
        ))
        .build(),
        SpecBuilder::new(
            "biomimicry_bet_hedge_allocate",
            "Bet-Hedging Allocation",
            "Split a fork-generation budget between the main bet and evenly-spread insurance scenarios; the insured fraction grows with environmental entropy.",
        )
        .schema(object_schema(
            [
                ("total_budget", string_schema("Total budget units for this fork generation")),
                ("entropy", string_schema("Environmental uncertainty in [0,1] (default 0.3)")),
                (
                    "scenario",
                    string_array_schema("Plausible scenario as name:expected_fitness (repeatable)"),
                ),
            ],
            &["total_budget", "scenario"],
        ))
        .build(),
    ]
}








