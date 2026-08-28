//! Cell-cycle checkpoints (G1/S, G2/M, spindle) mapped to GenOS vital phases.
//!
//! A capsule never advances blindly through its life cycle: every transition
//! (init → fork → run → diff → merge) must pass an explicit gate whose
//! predicates are evaluated against declared facts. A failed gate never
//! "skips" — it blocks, repairs or escalates to apoptosis upstream.
//! Every gate crossing is designed to be journaled as a signed DAG event.

use std::collections::BTreeMap;

/// Vital phases of a capsule, in strict order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Phase {
    /// Birth: genome coherence and resources.
    Init,
    /// Divergence hypothesis creation.
    Fork,
    /// Execution inside a sealed world.
    Run,
    /// Deterministic comparison of diverged branches.
    Diff,
    /// Conditional promotion of validated hypotheses.
    Merge,
}

impl Phase {
    pub fn as_str(&self) -> &'static str {
        match self {
            Phase::Init => "init",
            Phase::Fork => "fork",
            Phase::Run => "run",
            Phase::Diff => "diff",
            Phase::Merge => "merge",
        }
    }

    pub fn parse(value: &str) -> Option<Phase> {
        match value.to_ascii_lowercase().as_str() {
            "init" => Some(Phase::Init),
            "fork" => Some(Phase::Fork),
            "run" => Some(Phase::Run),
            "diff" => Some(Phase::Diff),
            "merge" => Some(Phase::Merge),
            _ => None,
        }
    }
}

/// One boolean fact about the capsule / world state, keyed by name.
pub type Facts = BTreeMap<String, bool>;

/// A single predicate attached to a gate: `fact_name` must equal `expected`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateRule {
    pub name: String,
    pub fact: String,
    pub expected: bool,
}

impl GateRule {
    pub fn requires(fact: &str) -> Self {
        GateRule {
            name: format!("requires_{fact}"),
            fact: fact.to_string(),
            expected: true,
        }
    }

    pub fn forbids(fact: &str) -> Self {
        GateRule {
            name: format!("forbids_{fact}"),
            fact: fact.to_string(),
            expected: false,
        }
    }
}

/// Outcome of a gate evaluation. Blocking semantics are absolute: a failed
/// gate means the caller MUST NOT advance to the next phase.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateReport {
    pub phase: Phase,
    pub passed: bool,
    pub checked_rules: usize,
    pub missing_facts: Vec<String>,
    pub violated_rules: Vec<String>,
}

/// Registry of gates, one rule set per phase. Defaults mirror the canonical
/// GenOS invariants (`spec/GENOME_SPEC.md`, overview architecture docs).
#[derive(Debug, Clone, Default)]
pub struct CycleGateKeeper {
    rules: BTreeMap<Phase, Vec<GateRule>>,
}

impl CycleGateKeeper {
    pub fn with_defaults() -> Self {
        let mut keeper = CycleGateKeeper::default();
        // G1-equivalent: birth prerequisites.
        keeper.register(
            Phase::Init,
            vec![
                GateRule::requires("genome_coherent"),
                GateRule::requires("niche_available"),
                GateRule::requires("budget_allocated"),
                GateRule::forbids("genome_state_leak"),
            ],
        );
        // G2-equivalent: replication prerequisites.
        keeper.register(
            Phase::Fork,
            vec![
                GateRule::requires("parent_snapshot_sealed"),
                GateRule::requires("world_isolated_cow"),
                GateRule::requires("budget_allocated"),
            ],
        );
        // Spindle-equivalent: execution integrity.
        keeper.register(
            Phase::Run,
            vec![
                GateRule::requires("pre_run_snapshot_sealed"),
                GateRule::requires("invariants_respected"),
                GateRule::forbids("cross_world_leak"),
            ],
        );
        // Diff integrity.
        keeper.register(
            Phase::Diff,
            vec![
                GateRule::requires("diff_complete"),
                GateRule::requires("replay_verified"),
            ],
        );
        // M-equivalent: conditional promotion.
        keeper.register(
            Phase::Merge,
            vec![
                GateRule::requires("pareto_validated"),
                GateRule::requires("heredity_proven"),
                GateRule::requires("replay_verified"),
                GateRule::forbids("cross_world_leak"),
            ],
        );
        keeper
    }

    pub fn register(&mut self, phase: Phase, rules: Vec<GateRule>) {
        self.rules.entry(phase).or_default().extend(rules);
    }

    pub fn rules_for(&self, phase: Phase) -> &[GateRule] {
        self.rules.get(&phase).map(Vec::as_slice).unwrap_or(&[])
    }

    /// Evaluate every rule of `phase` against `facts`.
    ///
    /// A rule whose fact is absent counts as *missing* and blocks the gate
    /// (fail-closed, like a biological checkpoint that halts on uncertainty).
    pub fn evaluate(&self, phase: Phase, facts: &Facts) -> GateReport {
        let mut missing = Vec::new();
        let mut violated = Vec::new();
        let rules = self.rules_for(phase);
        for rule in rules {
            match facts.get(&rule.fact) {
                None => missing.push(rule.fact.clone()),
                Some(&actual) if actual == rule.expected => {}
                Some(_) => violated.push(rule.name.clone()),
            }
        }
        GateReport {
            phase,
            passed: missing.is_empty() && violated.is_empty(),
            checked_rules: rules.len(),
            missing_facts: missing,
            violated_rules: violated,
        }
    }
}

/// Parse CLI-style `key=value` parameters into [`Facts`].
///
/// Accepted truthy values: `true`, `yes`, `1`. Everything else is false.
pub fn parse_facts(params: &[String]) -> Result<Facts, String> {
    let mut facts = Facts::new();
    for param in params {
        let (key, value) = param
            .split_once('=')
            .ok_or_else(|| format!("invalid --param '{param}' (expected key=true|false)"))?;
        if key.is_empty() {
            return Err(format!("empty fact key in '{param}'"));
        }
        let parsed = matches!(value.to_ascii_lowercase().as_str(), "true" | "yes" | "1");
        facts.insert(key.to_string(), parsed);
    }
    Ok(facts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_phase_accepts_all_vital_phases() {
        for raw in ["init", "fork", "run", "diff", "merge"] {
            assert!(Phase::parse(raw).is_some());
        }
        assert_eq!(Phase::parse("nope"), None);
    }

    #[test]
    fn fork_gate_blocks_without_sealed_parent_snapshot() {
        let keeper = CycleGateKeeper::with_defaults();
        let facts = Facts::new();
        let report = keeper.evaluate(Phase::Fork, &facts);
        assert!(!report.passed);
        assert_eq!(report.missing_facts.len(), 3);
        assert_eq!(report.checked_rules, 3);
    }

    #[test]
    fn fork_gate_passes_with_all_facts_true() {
        let keeper = CycleGateKeeper::with_defaults();
        let mut facts = Facts::new();
        facts.insert("parent_snapshot_sealed".into(), true);
        facts.insert("world_isolated_cow".into(), true);
        facts.insert("budget_allocated".into(), true);
        let report = keeper.evaluate(Phase::Fork, &facts);
        assert!(
            report.passed,
            "violated={:?} missing={:?}",
            report.violated_rules, report.missing_facts
        );
    }

    #[test]
    fn merge_gate_fail_closed_on_cross_world_leak() {
        let keeper = CycleGateKeeper::with_defaults();
        let mut facts = Facts::new();
        for key in ["pareto_validated", "heredity_proven", "replay_verified"] {
            facts.insert(key.into(), true);
        }
        facts.insert("cross_world_leak".into(), false);
        let report = keeper.evaluate(Phase::Merge, &facts);
        assert!(report.passed);

        facts.insert("cross_world_leak".into(), true);
        let report = keeper.evaluate(Phase::Merge, &facts);
        assert!(!report.passed);
        assert_eq!(report.violated_rules, vec!["forbids_cross_world_leak"]);
    }

    #[test]
    fn init_gate_requires_genome_coherence() {
        let keeper = CycleGateKeeper::with_defaults();
        let mut facts = Facts::new();
        facts.insert("genome_coherent".into(), false);
        let report = keeper.evaluate(Phase::Init, &facts);
        assert!(!report.passed);
        assert!(report
            .violated_rules
            .contains(&"requires_genome_coherent".to_string()));
    }

    #[test]
    fn parse_facts_handles_truthy_and_rejects_garbage() {
        let params = vec!["a=true".to_string(), "b=no".to_string(), "c=1".to_string()];
        let facts = parse_facts(&params).unwrap();
        assert_eq!(facts.get("a"), Some(&true));
        assert_eq!(facts.get("b"), Some(&false));
        assert_eq!(facts.get("c"), Some(&true));
        assert!(parse_facts(&["garbage".to_string()]).is_err());
    }
}

/// The p53 Checkpoint (Allosteric Governance)
/// Physical barrier enforcing policies (RBAC, File Length, Aesthetic) before execution.
pub fn p53_checkpoint(action_type: &str, payload: &str, clearance_level: &str) -> Result<(), String> {
    // Policy 1: File Length (Rule 1)
    if action_type == "WRITE_FILE" {
        let lines = payload.lines().count();
        if lines > 400 {
            return Err(format!("[p53 Checkpoint: ACCESS DENIED] Rule 1 Violation: File exceeds 400 lines (current: {}).", lines));
        }
    }

    // Policy 2: Intransigent Security (Rule 6)
    if action_type == "WRITE_FILE" || action_type == "READ_FILE" {
        let is_sensitive = payload.contains("/secrets") || payload.contains(".env");
        if is_sensitive && clearance_level != "ADMIN" {
            return Err("[p53 Checkpoint: ACCESS DENIED] Rule 6 Violation: Unauthorized access to sensitive path. Requires ADMIN clearance.".to_string());
        }
    }

    // Policy 3: Strict Aesthetic (Rule 5)
    if action_type == "UPDATE_FRONTEND" {
        let has_forbidden = payload.to_lowercase().contains("linear-gradient") || payload.contains("??");
        if has_forbidden {
            return Err("[p53 Checkpoint: ACCESS DENIED] Rule 5 Violation: Forbidden aesthetic detected (gradients or emojis). GitHub strict style required.".to_string());
        }
    }

    Ok(())
}
