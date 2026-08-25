//! Biomimicry feature handlers behind the generic `bio-feature` entry point.
//!
//! Each feature module (gate, chaperone, vaccination, interferon, sar, ...)
//! exposes typed actions and consumes `key=value` parameters, so new features
//! wire in without touching the CLI dispatch table again.

use anyhow::{bail, Result};
use genos_core::biomimicry::{parse_facts, CycleGateKeeper, Phase};

/// Generic dispatcher for biomimicry feature modules. Each new feature only
/// adds a routing arm here; the CLI surface stays stable.
pub async fn cmd_biomimicry_feature(
    feature: &str,
    action: &str,
    params: &[String],
) -> Result<()> {
    match (feature, action) {
        ("gate", "evaluate") => gate_evaluate(params),
        ("chaperone", "repair") => chaperone_repair(params),
        ("vaccination", "train") => crate::cmd_bio_immunity::vaccination_train(params),
        ("interferon", "emit") => crate::cmd_bio_immunity::interferon_emit(params),
        ("sar", "prime" | "assess" | "inherit") => crate::cmd_bio_immunity::sar_action(params, action),
        ("reciprocity", "decide") => reciprocity_decide(params),
        ("proceduralization", "compile" | "monitor") => {
            proceduralization_action(params, action)
        }
        ("telomere", "fork" | "restore") => telomere_action(params, action),
        ("epigenetic_chromatin", "modulate") => {
            crate::cmd_biomimicry::chromatin_modulate(params)
        }
        (feature, action) => bail!("unknown bio-feature '{feature}/{action}'"),
    }
}

fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params.iter().find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

fn collect_params<'a>(params: &'a [String], key: &str) -> Vec<&'a str> {
    params
        .iter()
        .filter_map(|p| p.strip_prefix(key)?.strip_prefix('='))
        .collect()
}

fn gate_evaluate(params: &[String]) -> Result<()> {
    let phase_raw = param_value(params, "phase")
        .ok_or_else(|| anyhow::anyhow!("missing --param phase=<init|fork|run|diff|merge>"))?;
    let phase =
        Phase::parse(phase_raw).ok_or_else(|| anyhow::anyhow!("unknown phase '{phase_raw}'"))?;
    let facts: Vec<String> = params
        .iter()
        .filter(|p| !p.starts_with("phase="))
        .cloned()
        .collect();
    let facts = parse_facts(&facts).map_err(anyhow::Error::msg)?;
    let keeper = CycleGateKeeper::with_defaults();
    let report = keeper.evaluate(phase, &facts);
    println!(
        "Gate {} : {} ({} règles vérifiées)",
        report.phase.as_str(),
        if report.passed { "PASSED" } else { "BLOCKED" },
        report.checked_rules
    );
    for rule in &report.violated_rules {
        println!("  violated: {rule}");
    }
    for fact in &report.missing_facts {
        println!("  missing fact: {fact}");
    }
    if !report.passed {
        bail!("checkpoint gate blocked; progression to next phase is forbidden");
    }
    Ok(())
}

fn chaperone_repair(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{CanonicalSchema, Chaperone, DamagedComponent, SlotValidator};
    let component_id = param_value(params, "component_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param component_id=<id>"))?
        .to_string();
    let kind = param_value(params, "kind")
        .ok_or_else(|| anyhow::anyhow!("missing --param kind=<component kind>"))?
        .to_string();
    let fragments: Vec<String> =
        collect_params(params, "fragment").iter().map(|s| s.to_string()).collect();
    if fragments.is_empty() {
        bail!("at least one --param fragment=<value> is required ('' models a mis-folded slot)");
    }
    let templates: Vec<Option<String>> = collect_params(params, "template")
        .into_iter()
        .map(|t| if t == "-" { None } else { Some(t.to_string()) })
        .collect();
    let max_attempts: usize = param_value(params, "max_attempts")
        .and_then(|v| v.parse().ok())
        .unwrap_or(3);
    let atp_budget: u64 =
        param_value(params, "atp_budget").and_then(|v| v.parse().ok()).unwrap_or(5);

    let mut slot_templates: Vec<Option<String>> = vec![None; fragments.len()];
    for (i, template) in templates.into_iter().enumerate() {
        if i < slot_templates.len() {
            slot_templates[i] = template;
        }
    }
    let schema = CanonicalSchema {
        kind: kind.clone(),
        slots: vec![SlotValidator::NonEmpty; fragments.len()],
        templates: slot_templates,
    };
    let component = DamagedComponent { id: component_id.clone(), kind, fragments };
    let mut chaperone = Chaperone::new(max_attempts, atp_budget);
    match chaperone.repair(&component, &schema) {
        genos_core::biomimicry::RepairOutcome::Repaired(folded) => {
            println!("Component {component_id} repaired:");
            for (i, fragment) in folded.iter().enumerate() {
                println!("  slot[{i}] = {fragment}");
            }
            Ok(())
        }
        genos_core::biomimicry::RepairOutcome::RecommendProteolysis { reason } => {
            bail!("chaperone recommends proteolysis for {component_id}: {reason}")
        }
    }
}


fn proceduralization_action(params: &[String], action: &str) -> Result<()> {
    use genos_core::biomimicry::{
        compile, monitor, recompile, ExecutionStats, Health, ReadinessRule,
    };
    let skill = param_value(params, "skill")
        .ok_or_else(|| anyhow::anyhow!("missing --param skill=<name>"))?
        .to_string();
    match action {
        "compile" => {
            let successes: u32 = param_value(params, "successes")
                .ok_or_else(|| anyhow::anyhow!("missing --param successes=<n>"))?
                .parse()?;
            let failures: u32 =
                param_value(params, "failures").and_then(|v| v.parse().ok()).unwrap_or(0);
            let variance: f64 = param_value(params, "variance")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.0);
            let steps: Vec<String> =
                collect_params(params, "step").iter().map(|s| s.to_string()).collect();
            let preconditions: Vec<String> =
                collect_params(params, "precondition").iter().map(|s| s.to_string()).collect();
            let stats = ExecutionStats { successes, failures, variance_proxy: variance };
            match compile(&skill, preconditions, steps, vec![], &stats, &ReadinessRule::default()) {
                Ok(program) => {
                    println!(
                        "Skill '{skill}' proceduralized (version {}): {} steps installed as reflex",
                        program.version,
                        program.steps.len()
                    );
                    for (i, step) in program.steps.iter().enumerate() {
                        println!("  step[{i}] = {step}");
                    }
                    Ok(())
                }
                Err(reason) => bail!("skill '{skill}' stays deliberative: {reason}"),
            }
        }
        "monitor" => {
            let failure_rate: f64 = param_value(params, "failure_rate")
                .ok_or_else(|| anyhow::anyhow!("missing --param failure_rate=<0..1>"))?
                .parse()?;
            // Optional refinement path when new steps are supplied.
            let steps: Vec<String> =
                collect_params(params, "step").iter().map(|s| s.to_string()).collect();
            if !steps.is_empty() {
                let previous = genos_core::biomimicry::SkillProgram {
                    name: skill.clone(),
                    version: 1,
                    preconditions: vec![],
                    steps: steps.clone(),
                    postconditions: vec![],
                };
                let updated =
                    recompile(&previous, steps).map_err(anyhow::Error::msg)?;
                println!(
                    "Skill '{skill}' refined to version {}",
                    updated.version
                );
                return Ok(());
            }
            match monitor(failure_rate) {
                Health::Keep => {
                    println!("Skill '{skill}': healthy (failure rate {failure_rate:.2})");
                    Ok(())
                }
                Health::Uninstall { reason } => {
                    bail!("uninstalling reflex '{skill}' back to deliberative path: {reason}")
                }
            }
        }
        _ => bail!("unknown proceduralization action"),
    }
}

fn telomere_action(params: &[String], action: &str) -> Result<()> {
    use genos_core::biomimicry::{ForkVerdict, TelomereCounter};
    let capsule_id = param_value(params, "capsule_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param capsule_id=<id>"))?
        .to_string();
    let remaining: u32 = param_value(params, "remaining")
        .ok_or_else(|| anyhow::anyhow!("missing --param remaining=<n>"))?
        .parse()?;
    let max_forks: u32 = param_value(params, "max_forks")
        .ok_or_else(|| anyhow::anyhow!("missing --param max_forks=<n>"))?
        .parse()?;
    let mut counter = TelomereCounter { remaining, max_forks };
    match action {
        "fork" => match counter.consume_for_fork() {
            ForkVerdict::Allowed { remaining_after } => {
                println!(
                    "Capsule {capsule_id}: fork allowed ({remaining_after} forks left, {:.0}% of budget)",
                    counter.remaining_ratio() * 100.0
                );
                Ok(())
            }
            ForkVerdict::AllowedWarning { remaining_after } => {
                println!(
                    "Capsule {capsule_id}: fork allowed but WARNING — {remaining_after} forks left; breeding advised"
                );
                Ok(())
            }
            ForkVerdict::Exhausted => bail!(
                "Hayflick limit reached for {capsule_id}: fork refused; renew through breeding or stem re-certification"
            ),
        },
        "restore" => {
            let new_max: u32 = param_value(params, "new_max")
                .ok_or_else(|| anyhow::anyhow!("missing --param new_max=<n> for restore"))?
                .parse()?;
            let restoration_count: u8 =
                param_value(params, "restoration_count").and_then(|v| v.parse().ok()).unwrap_or(0);
            let max_restorations: u8 =
                param_value(params, "max_restorations").and_then(|v| v.parse().ok()).unwrap_or(2);
            counter
                .telomerase_restore(new_max, restoration_count, max_restorations)
                .map_err(anyhow::Error::msg)?;
            println!(
                "Capsule {capsule_id}: telomerase re-certification applied (budget {new_max}, restorations {}/{}). Journal the human approval.",
                restoration_count + 1,
                max_restorations
            );
            Ok(())
        }
        _ => bail!("unknown telomere action"),
    }
}

fn reciprocity_decide(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{
        PeerAction, PeerRecord, ReciprocityPolicy, ReputationLedger,
    };
    let peer_id = param_value(params, "peer_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param peer_id=<id>"))?
        .to_string();
    let cooperations: u32 =
        param_value(params, "cooperations").and_then(|v| v.parse().ok()).unwrap_or(0);
    let defections: u32 =
        param_value(params, "defections").and_then(|v| v.parse().ok()).unwrap_or(0);
    let last: Option<PeerAction> = match param_value(params, "last_action") {
        Some("cooperate") => Some(PeerAction::Cooperate),
        Some("defect") => Some(PeerAction::Defect),
        Some(other) => {
            bail!("invalid last_action '{other}' (expected cooperate|defect)")
        }
        None => None,
    };
    let mut ledger = ReputationLedger::default();
    {
        let record = ledger.peers.entry(peer_id.clone()).or_default();
        record.cooperations = cooperations;
        record.defections = defections;
        if let Some(action) = last {
            record.last_action = Some(action);
        }
    }
    let policy = ReciprocityPolicy::default();
    let decision = ledger.decide(&policy, &peer_id);
    let record: &PeerRecord = &ledger.peers[&peer_id];
    println!(
        "Peer {peer_id}: interactions={} defection_ratio={:.2}",
        record.interactions(),
        record.defection_ratio()
    );
    match decision {
        genos_core::biomimicry::Decision::Cooperate => {
            println!("Decision: COOPERATE");
            Ok(())
        }
        genos_core::biomimicry::Decision::Retaliate => {
            println!("Decision: RETALIATE (free-riding contained)");
            bail!("reciprocity policy retaliates against {peer_id}")
        }
    }
}
