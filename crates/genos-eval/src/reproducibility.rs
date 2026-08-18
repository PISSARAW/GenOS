use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FunctionalSimilarityMetric {
    pub metric: String,
    pub similarity: f64,
    pub confidence_interval_lower: f64,
    pub confidence_interval_upper: f64,
    pub equivalence_threshold: f64,
    pub paired_trials: usize,
    pub critical: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReproducibilityVerdict {
    Equivalent,
    NotEquivalent,
    Inconclusive,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FunctionalReproducibilityReport {
    pub metrics: Vec<FunctionalSimilarityMetric>,
    pub verdict: ReproducibilityVerdict,
    pub failing_metrics: Vec<String>,
    pub inconclusive_metrics: Vec<String>,
}

/// Assess behavioral equivalence conservatively. A metric passes only when its
/// confidence interval is entirely above the configured threshold. Critical
/// failures reject equivalence; intervals crossing a threshold are
/// inconclusive rather than silently accepted.
pub fn assess_functional_reproducibility(
    metrics: Vec<FunctionalSimilarityMetric>,
) -> FunctionalReproducibilityReport {
    let failing_metrics = metrics
        .iter()
        .filter(|metric| {
            metric.critical && metric.confidence_interval_upper < metric.equivalence_threshold
        })
        .map(|metric| metric.metric.clone())
        .collect::<Vec<_>>();
    let inconclusive_metrics = metrics
        .iter()
        .filter(|metric| {
            metric.critical
                && metric.confidence_interval_lower < metric.equivalence_threshold
                && metric.confidence_interval_upper >= metric.equivalence_threshold
        })
        .map(|metric| metric.metric.clone())
        .collect::<Vec<_>>();
    let verdict = if !failing_metrics.is_empty() {
        ReproducibilityVerdict::NotEquivalent
    } else if !inconclusive_metrics.is_empty() {
        ReproducibilityVerdict::Inconclusive
    } else {
        ReproducibilityVerdict::Equivalent
    };
    FunctionalReproducibilityReport {
        metrics,
        verdict,
        failing_metrics,
        inconclusive_metrics,
    }
}
