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
        ("vaccination", "train") => vaccination_train(params),
        ("interferon", "emit") => interferon_emit(params),
        ("sar", "prime" | "assess" | "inherit") => sar_action(params, action),
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

fn vaccination_train(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{ImmuneProfile, VaccineCorpus};
    let malicious: Vec<String> =
        collect_params(params, "malicious").iter().map(|s| s.to_string()).collect();
    let benign: Vec<String> =
        collect_params(params, "benign").iter().map(|s| s.to_string()).collect();
    if malicious.is_empty() {
        bail!("at least one --param malicious=<signature> is required");
    }
    let corpus = VaccineCorpus { malicious, benign };
    let profile = ImmuneProfile::vaccinate(&corpus);
    println!(
        "Vaccination complete: {} memory cells formed, {} candidates rejected by self-tolerance",
        profile.cells.len(),
        profile.rejected.len()
    );
    for (i, cell) in profile.cells.iter().enumerate() {
        println!(
            "  cell[{i}] exposures={} tokens={}",
            cell.exposure_count,
            cell.centroid_tokens.join(" ")
        );
    }
    for rejected in &profile.rejected {
        println!("  rejected (self-reactive): {rejected}");
    }
    if let Some(probe) = param_value(params, "probe") {
        match profile.respond(probe) {
            Some(hit) => println!(
                "Secondary response for probe '{probe}': MATCH cell[{}] similarity={:.2}",
                hit.cell_index, hit.similarity
            ),
            None => println!("Secondary response for probe '{probe}': no memory"),
        }
    }
    Ok(())
}

fn interferon_emit(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{emit, InterferonSignal};
    let source = param_value(params, "source")
        .ok_or_else(|| anyhow::anyhow!("missing --param source=<capsule id>"))?
        .to_string();
    let signature = param_value(params, "signature")
        .ok_or_else(|| anyhow::anyhow!("missing --param signature=<threat tokens>"))?
        .to_string();
    let ttl: u64 = param_value(params, "ttl_seconds").and_then(|v| v.parse().ok()).unwrap_or(300);
    let now: u64 = param_value(params, "now_secs").and_then(|v| v.parse().ok()).unwrap_or(0);
    let neighbors: Vec<String> =
        collect_params(params, "neighbor").iter().map(|s| s.to_string()).collect();
    if neighbors.is_empty() {
        bail!("at least one --param neighbor=<capsule id> is required (paracrine radius)");
    }
    let signal = InterferonSignal::new(&source, &signature, ttl);
    println!(
        "Interferon emitted by {source}: {} neighbors primed for {ttl}s",
        neighbors.len()
    );
    for (id, state) in emit(&signal, &neighbors, now) {
        println!(
            "  {id}: sensitivity x{:.2}, writes frozen until t+{}s",
            state.sensitivity_boost,
            state.expires_at_secs - now
        );
    }
    Ok(())
}

fn sar_action(params: &[String], action: &str) -> Result<()> {
    use genos_core::biomimicry::{Priming, SystemResistance, tokenize};
    match action {
        "prime" => {
            let incident = param_value(params, "incident_id")
                .ok_or_else(|| anyhow::anyhow!("missing --param incident_id=<id>"))?
                .to_string();
            let signature = param_value(params, "signature")
                .ok_or_else(|| anyhow::anyhow!("missing --param signature=<threat tokens>"))?
                .to_string();
            let half_life: f64 = param_value(params, "half_life_days")
                .and_then(|v| v.parse().ok())
                .unwrap_or(30.0);
            let now_day: f64 =
                param_value(params, "now_day").and_then(|v| v.parse().ok()).unwrap_or(0.0);
            let mut sar = SystemResistance::default();
            let index = sar.prime(&incident, &signature, half_life, now_day);
            println!(
                "Primed: incident {incident} at slot {index} (half-life {half_life} days) — systemic defense raised"
            );
            Ok(())
        }
        "assess" => {
            let probe = param_value(params, "probe")
                .ok_or_else(|| anyhow::anyhow!("missing --param probe=<signature>"))?;
            let now_day: f64 =
                param_value(params, "now_day").and_then(|v| v.parse().ok()).unwrap_or(0.0);
            // Primings are passed as repeated --param priming=id:signature:half_life_days:primed_at_day
            let mut sar = SystemResistance::default();
            for raw in collect_params(params, "priming") {
                let parts: Vec<&str> = raw.splitn(4, ':').collect();
                if parts.len() != 4 {
                    bail!("invalid priming '{raw}' (expected id:signature:half_life_days:primed_at_day)");
                }
                sar.primings.push(Priming {
                    incident_id: parts[0].to_string(),
                    signature_tokens: tokenize(parts[1]),
                    half_life_days: parts[2].parse()?,
                    primed_at_day: parts[3].parse()?,
                });
            }
            let score = sar.resistance_against(probe, now_day);
            println!(
                "Resistance against '{probe}': score={:.2} matched={} recommended={}",
                score.score,
                score.matched_incident_id.as_deref().unwrap_or("none"),
                if score.primed_response_recommended { "yes" } else { "no" }
            );
            Ok(())
        }
        _ => bail!("unknown sar action"),
    }
}
