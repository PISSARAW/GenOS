//! Evolutionary-strategy biomimicry handlers (speciation, bet-hedging).

use anyhow::{bail, Result};
use genos_core::biomimicry::{genetic_distance, SpeciesBoundary};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params.iter().find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

fn collect_params<'a>(params: &'a [String], key: &str) -> Vec<&'a str> {
    params
        .iter()
        .filter_map(|p| p.strip_prefix(key)?.strip_prefix('='))
        .collect()
}

/// Speciation check: alleles are passed as repeated --param allele-a=... /
/// --param allele-b=...; thresholds default to the canonical bands.
pub fn speciation_check(params: &[String]) -> Result<()> {
    let alleles_a: Vec<String> =
        collect_params(params, "allele-a").iter().map(|s| s.to_string()).collect();
    let alleles_b: Vec<String> =
        collect_params(params, "allele-b").iter().map(|s| s.to_string()).collect();
    if alleles_a.is_empty() || alleles_b.is_empty() {
        bail!("at least one --param allele-a=<gene> and one --param allele-b=<gene> are required");
    }
    let hybrid_threshold: f64 = param_value(params, "hybrid_threshold")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.30);
    let speciation_threshold: f64 = param_value(params, "speciation_threshold")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.60);
    let boundary =
        SpeciesBoundary { hybrid_threshold, speciation_threshold };
    let distance = genetic_distance(&alleles_a, &alleles_b);
    let verdict = boundary.verdict(distance);
    println!("Genetic distance: {distance:.2}");
    match verdict {
        genos_core::biomimicry::PairingVerdict::SameSpecies => {
            println!("Verdict: SAME SPECIES — crossing allowed");
            Ok(())
        }
        genos_core::biomimicry::PairingVerdict::HybridSterile => {
            let mark = genos_core::biomimicry::sterility_mark(distance, &boundary)
                .ok_or_else(|| anyhow::anyhow!("expected sterility mark"))?;
            println!(
                "Verdict: HYBRID STERILE — crossing tolerated, offspring non-breedable ({})",
                mark.reason
            );
            bail!("hybrid offspring must carry a sterility mark")
        }
        genos_core::biomimicry::PairingVerdict::IncompatibleSpecies => {
            bail!("INCOMPATIBLE SPECIES at distance {distance:.2}: merge/crossing refused")
        }
    }
}

/// Bet-hedging allocation: scenarios passed as repeated
/// --param scenario=name:expected_fitness ; entropy in [0,1].
pub fn bet_hedge_allocate(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{allocate, Scenario};
    let total_budget: u64 = param_value(params, "total_budget")
        .ok_or_else(|| anyhow::anyhow!("missing --param total_budget=<n>"))?
        .parse()?;
    let entropy: f64 =
        param_value(params, "entropy").and_then(|v| v.parse().ok()).unwrap_or(0.3);
    let mut scenarios = Vec::new();
    for raw in collect_params(params, "scenario") {
        let (name, fitness) = raw
            .split_once(':')
            .ok_or_else(|| anyhow::anyhow!("invalid scenario '{raw}' (expected name:fitness)"))?;
        scenarios.push(Scenario {
            name: name.to_string(),
            expected_fitness: fitness.parse()?,
        });
    }
    if scenarios.is_empty() {
        bail!("at least one --param scenario=<name:expected_fitness> is required");
    }
    let plan = allocate(total_budget, &scenarios, entropy).map_err(anyhow::Error::msg)?;
    println!(
        "Main bet: {} gets {}/{} units",
        plan.main_scenario, plan.main_budget, total_budget
    );
    for (name, budget) in &plan.insurance {
        println!("  insurance: {name} gets {budget}");
    }
    println!("Insurance fraction: {:.1}%", plan.insurance_fraction * 100.0);
    Ok(())
}
