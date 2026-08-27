//! Immune-family biomimicry handlers (vaccination, interferon, SAR).

use anyhow::{bail, Result};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params
        .iter()
        .find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

fn collect_params<'a>(params: &'a [String], key: &str) -> Vec<&'a str> {
    params
        .iter()
        .filter_map(|p| p.strip_prefix(key)?.strip_prefix('='))
        .collect()
}

pub(crate) fn vaccination_train(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{ImmuneProfile, VaccineCorpus};
    let malicious: Vec<String> = collect_params(params, "malicious")
        .iter()
        .map(|s| s.to_string())
        .collect();
    let benign: Vec<String> = collect_params(params, "benign")
        .iter()
        .map(|s| s.to_string())
        .collect();
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

pub(crate) fn interferon_emit(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{emit, InterferonSignal};
    let source = param_value(params, "source")
        .ok_or_else(|| anyhow::anyhow!("missing --param source=<capsule id>"))?
        .to_string();
    let signature = param_value(params, "signature")
        .ok_or_else(|| anyhow::anyhow!("missing --param signature=<threat tokens>"))?
        .to_string();
    let ttl: u64 = param_value(params, "ttl_seconds")
        .and_then(|v| v.parse().ok())
        .unwrap_or(300);
    let now: u64 = param_value(params, "now_secs")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let neighbors: Vec<String> = collect_params(params, "neighbor")
        .iter()
        .map(|s| s.to_string())
        .collect();
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

pub(crate) fn sar_action(params: &[String], action: &str) -> Result<()> {
    use genos_core::biomimicry::{tokenize, Priming, SystemResistance};
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
            let now_day: f64 = param_value(params, "now_day")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.0);
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
            let now_day: f64 = param_value(params, "now_day")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.0);
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
                if score.primed_response_recommended {
                    "yes"
                } else {
                    "no"
                }
            );
            Ok(())
        }
        _ => bail!("unknown sar action"),
    }
}
