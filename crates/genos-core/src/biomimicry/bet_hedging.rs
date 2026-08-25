//! Bet-hedging mapped to diversification of forks under uncertainty.
//!
//! Biological mechanism: bacteria in unpredictable environments emit
//! deliberately heterogeneous descendants (some active, some dormant) even
//! though they are genetically identical. Bet-hedging maximizes LONG-RUN
//! geometric fitness, not the arithmetic mean: it accepts lower expectation
//! in exchange for variance reduction — it is insurance, not exploration.
//! GenOS mapping: instead of N forks toward the single most probable
//! hypothesis, a fraction φ (growing with measured environmental entropy) is
//! spread across insurance phenotypes.

/// One plausible future scenario with its expected fitness if it realizes.
#[derive(Debug, Clone, PartialEq)]
pub struct Scenario {
    pub name: String,
    pub expected_fitness: f64,
}

/// Measured environmental uncertainty, normalized to [0,1] (e.g. from the
/// existing entropy thresholds: `evolution_set_entropy_threshold`).
pub type Entropy = f64;

/// Insurance fraction φ as a function of uncertainty.
/// φ ∈ [0.05, 0.4]; 0 at zero entropy is refused: a floor of insurance
/// always exists (the biological baseline of stochastic switching).
pub fn insurance_fraction(entropy: Entropy) -> f64 {
    let e = entropy.clamp(0.0, 1.0);
    let raw = 0.10 + 0.30 * e;
    raw.clamp(0.05, 0.40)
}

/// The diversification plan for one generation of forks.
#[derive(Debug, Clone, PartialEq)]
pub struct HedgePlan {
    /// Scenario receiving the main bet (highest expected fitness).
    pub main_scenario: String,
    pub main_budget: u64,
    /// (scenario, budget) pairs for the insurance phenotypes.
    pub insurance: Vec<(String, u64)>,
    pub insurance_fraction: f64,
}

/// Allocate `total_budget` across scenarios.
///
/// Criterion: maximize E[log fitness] proxy — the main bet goes to the
/// best-expected scenario, the insurance fraction is split EVENLY across
/// every other non-zero-probability scenario (equal-weight hedging, robust
/// without probability estimates). With a single scenario there is nothing
/// to hedge against: everything goes to it.
pub fn allocate(
    total_budget: u64,
    scenarios: &[Scenario],
    entropy: Entropy,
) -> Result<HedgePlan, String> {
    if scenarios.is_empty() {
        return Err("no scenarios provided".to_string());
    }
    if scenarios.len() == 1 {
        return Ok(HedgePlan {
            main_scenario: scenarios[0].name.clone(),
            main_budget: total_budget,
            insurance: vec![],
            insurance_fraction: 0.0,
        });
    }
    let mut ranked: Vec<&Scenario> = scenarios.iter().collect();
    ranked.sort_by(|a, b| b.expected_fitness.partial_cmp(&a.expected_fitness).unwrap_or(std::cmp::Ordering::Equal));
    // Deterministic tie-break by name keeps plans reproducible.
    ranked.sort_by(|a, b| b.expected_fitness.partial_cmp(&a.expected_fitness).unwrap_or(std::cmp::Ordering::Equal).then_with(|| a.name.cmp(&b.name)));

    let phi = insurance_fraction(entropy);
    let insurance_budget =
        ((total_budget as f64) * phi).floor() as u64;
    let main_budget = total_budget - insurance_budget;
    let others = &ranked[1..];
    let share = insurance_budget / others.len() as u64;
    let mut distributed = 0u64;
    let mut insurance = Vec::new();
    for (index, scenario) in others.iter().enumerate() {
        let mut amount = share;
        // Remainder units go to the first insurance scenarios deterministically.
        let remainder = insurance_budget - share * others.len() as u64;
        if (index as u64) < remainder {
            amount += 1;
        }
        distributed += amount;
        insurance.push((scenario.name.clone(), amount));
    }
    debug_assert_eq!(distributed + main_budget, total_budget);
    Ok(HedgePlan {
        main_scenario: ranked[0].name.clone(),
        main_budget,
        insurance,
        insurance_fraction: distributed as f64 / total_budget.max(1) as f64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scenarios() -> Vec<Scenario> {
        vec![
            Scenario { name: "conservative".into(), expected_fitness: 0.6 },
            Scenario { name: "aggressive".into(), expected_fitness: 0.9 },
            Scenario { name: "regulatory-b".into(), expected_fitness: 0.3 },
        ]
    }

    #[test]
    fn no_scenarios_is_an_error() {
        assert!(allocate(100, &[], 0.2).is_err());
    }

    #[test]
    fn single_scenario_takes_everything() {
        let only = vec![Scenario { name: "only".into(), expected_fitness: 1.0 }];
        let plan = allocate(100, &only, 0.8).unwrap();
        assert_eq!(plan.main_budget, 100);
        assert!(plan.insurance.is_empty());
    }

    #[test]
    fn main_bet_goes_to_highest_expectation() {
        let plan = allocate(1000, &scenarios(), 0.2).unwrap();
        assert_eq!(plan.main_scenario, "aggressive");
        assert!(plan.main_budget > 500);
    }

    #[test]
    fn insurance_grows_with_uncertainty() {
        let calm = allocate(1000, &scenarios(), 0.1).unwrap();
        let chaotic = allocate(1000, &scenarios(), 0.9).unwrap();
        let calm_insured: u64 = calm.insurance.iter().map(|(_, b)| b).sum();
        let chaotic_insured: u64 = chaotic.insurance.iter().map(|(_, b)| b).sum();
        assert!(chaotic_insured > calm_insured);
        assert!(chaotic_insured <= 400); // φ ceiling
        assert!(calm_insured >= 50); // φ floor
    }

    #[test]
    fn budgets_are_conserved_exactly() {
        let plan = allocate(1003, &scenarios(), 0.55).unwrap();
        let insured: u64 = plan.insurance.iter().map(|(_, b)| b).sum();
        assert_eq!(plan.main_budget + insured, 1003);
        assert_eq!(plan.insurance.len(), 2);
    }
}
