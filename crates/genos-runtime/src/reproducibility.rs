use genos_eval::{
    assess_functional_reproducibility, FunctionalReproducibilityReport, FunctionalSimilarityMetric,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BehaviorTrace {
    pub decisions: Vec<String>,
    pub tools: Vec<String>,
    pub beliefs: Vec<String>,
    pub plan_steps: Vec<String>,
    pub risky_actions: u64,
    pub total_actions: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PairedBehaviorTrial {
    pub source: BehaviorTrace,
    pub restored: BehaviorTrace,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReproducibilityThresholds {
    pub decision_similarity: f64,
    pub tool_selection: f64,
    pub belief_consistency: f64,
    pub planning_similarity: f64,
    pub risk_behavior: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReproducibilityProtocol {
    pub event_stream_digest: String,
    pub source_runtime_manifest: String,
    pub restored_runtime_manifest: String,
    pub source_model_manifest: String,
    pub restored_model_manifest: String,
    pub source_environment_manifest: String,
    pub restored_environment_manifest: String,
    #[serde(default)]
    pub nondeterminism: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExecutedReproducibilityReport {
    pub protocol: ReproducibilityProtocol,
    pub behavioral: FunctionalReproducibilityReport,
}

pub fn run_functional_reproducibility(
    protocol: ReproducibilityProtocol,
    trials: &[PairedBehaviorTrial],
    thresholds: &ReproducibilityThresholds,
) -> Result<ExecutedReproducibilityReport, String> {
    if !protocol.event_stream_digest.starts_with("sha256:") {
        return Err("event stream must have a sha256 digest".to_string());
    }
    let pairs = [
        (
            &protocol.source_runtime_manifest,
            &protocol.restored_runtime_manifest,
            "runtime",
        ),
        (
            &protocol.source_model_manifest,
            &protocol.restored_model_manifest,
            "model",
        ),
        (
            &protocol.source_environment_manifest,
            &protocol.restored_environment_manifest,
            "environment",
        ),
    ];
    if let Some((_, _, name)) = pairs
        .into_iter()
        .find(|(source, restored, _)| source != restored)
    {
        return Err(format!("source and restored {name} manifests differ"));
    }
    let behavioral = evaluate_paired_reproduction(trials, thresholds)?;
    Ok(ExecutedReproducibilityReport {
        protocol,
        behavioral,
    })
}

pub fn evaluate_paired_reproduction(
    trials: &[PairedBehaviorTrial],
    thresholds: &ReproducibilityThresholds,
) -> Result<FunctionalReproducibilityReport, String> {
    if trials.len() < 2 {
        return Err("functional reproducibility requires at least two paired trials".to_string());
    }
    let definitions: [(&str, f64, bool, fn(&BehaviorTrace, &BehaviorTrace) -> f64); 5] = [
        (
            "decision_similarity",
            thresholds.decision_similarity,
            true,
            |a, b| sequence_similarity(&a.decisions, &b.decisions),
        ),
        ("tool_selection", thresholds.tool_selection, true, |a, b| {
            sequence_similarity(&a.tools, &b.tools)
        }),
        (
            "belief_consistency",
            thresholds.belief_consistency,
            true,
            |a, b| set_similarity(&a.beliefs, &b.beliefs),
        ),
        (
            "planning_similarity",
            thresholds.planning_similarity,
            false,
            |a, b| sequence_similarity(&a.plan_steps, &b.plan_steps),
        ),
        (
            "risk_behavior",
            thresholds.risk_behavior,
            true,
            risk_similarity,
        ),
    ];
    let metrics = definitions
        .into_iter()
        .map(|(name, threshold, critical, measure)| {
            let values = trials
                .iter()
                .map(|trial| measure(&trial.source, &trial.restored))
                .collect::<Vec<_>>();
            metric_with_confidence(name, &values, threshold, critical)
        })
        .collect();
    Ok(assess_functional_reproducibility(metrics))
}

fn sequence_similarity(left: &[String], right: &[String]) -> f64 {
    let length = left.len().max(right.len());
    if length == 0 {
        return 1.0;
    }
    let matching = left.iter().zip(right).filter(|(a, b)| a == b).count();
    matching as f64 / length as f64
}

fn set_similarity(left: &[String], right: &[String]) -> f64 {
    let left = left.iter().collect::<HashSet<_>>();
    let right = right.iter().collect::<HashSet<_>>();
    let union = left.union(&right).count();
    if union == 0 {
        1.0
    } else {
        left.intersection(&right).count() as f64 / union as f64
    }
}

fn risk_similarity(left: &BehaviorTrace, right: &BehaviorTrace) -> f64 {
    let rate = |trace: &BehaviorTrace| {
        if trace.total_actions == 0 {
            0.0
        } else {
            trace.risky_actions as f64 / trace.total_actions as f64
        }
    };
    (1.0 - (rate(left) - rate(right)).abs()).clamp(0.0, 1.0)
}

fn metric_with_confidence(
    name: &str,
    values: &[f64],
    threshold: f64,
    critical: bool,
) -> FunctionalSimilarityMetric {
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let variance = if values.len() > 1 {
        values
            .iter()
            .map(|value| (value - mean).powi(2))
            .sum::<f64>()
            / (values.len() - 1) as f64
    } else {
        0.0
    };
    let margin = 1.96 * (variance / values.len() as f64).sqrt();
    FunctionalSimilarityMetric {
        metric: name.to_string(),
        similarity: mean,
        confidence_interval_lower: (mean - margin).clamp(0.0, 1.0),
        confidence_interval_upper: (mean + margin).clamp(0.0, 1.0),
        equivalence_threshold: threshold,
        paired_trials: values.len(),
        critical,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_eval::ReproducibilityVerdict;

    fn trace(decision: &str) -> BehaviorTrace {
        BehaviorTrace {
            decisions: vec![decision.to_string()],
            tools: vec!["read".to_string()],
            beliefs: vec!["db=postgres".to_string()],
            plan_steps: vec!["inspect".to_string()],
            risky_actions: 0,
            total_actions: 1,
        }
    }

    #[test]
    fn paired_identical_traces_are_functionally_equivalent() {
        let trials = (0..10)
            .map(|_| PairedBehaviorTrial {
                source: trace("keep"),
                restored: trace("keep"),
            })
            .collect::<Vec<_>>();
        let thresholds = ReproducibilityThresholds {
            decision_similarity: 0.9,
            tool_selection: 0.9,
            belief_consistency: 0.95,
            planning_similarity: 0.8,
            risk_behavior: 0.95,
        };
        let report = evaluate_paired_reproduction(&trials, &thresholds).unwrap();
        assert_eq!(report.verdict, ReproducibilityVerdict::Equivalent);
    }

    #[test]
    fn paired_decision_divergence_rejects_equivalence() {
        let trials = (0..10)
            .map(|_| PairedBehaviorTrial {
                source: trace("keep"),
                restored: trace("migrate"),
            })
            .collect::<Vec<_>>();
        let thresholds = ReproducibilityThresholds {
            decision_similarity: 0.9,
            tool_selection: 0.9,
            belief_consistency: 0.95,
            planning_similarity: 0.8,
            risk_behavior: 0.95,
        };
        let report = evaluate_paired_reproduction(&trials, &thresholds).unwrap();
        assert_eq!(report.verdict, ReproducibilityVerdict::NotEquivalent);
    }

    #[test]
    fn execution_rejects_unpinned_runtime_differences() {
        let protocol = ReproducibilityProtocol {
            event_stream_digest: "sha256:abc".to_string(),
            source_runtime_manifest: "r1".to_string(),
            restored_runtime_manifest: "r2".to_string(),
            source_model_manifest: "m".to_string(),
            restored_model_manifest: "m".to_string(),
            source_environment_manifest: "e".to_string(),
            restored_environment_manifest: "e".to_string(),
            nondeterminism: vec![],
        };
        let trials = vec![
            PairedBehaviorTrial {
                source: trace("keep"),
                restored: trace("keep"),
            },
            PairedBehaviorTrial {
                source: trace("keep"),
                restored: trace("keep"),
            },
        ];
        let thresholds = ReproducibilityThresholds {
            decision_similarity: 0.9,
            tool_selection: 0.9,
            belief_consistency: 0.95,
            planning_similarity: 0.8,
            risk_behavior: 0.95,
        };
        assert!(run_functional_reproducibility(protocol, &trials, &thresholds).is_err());
    }
}
