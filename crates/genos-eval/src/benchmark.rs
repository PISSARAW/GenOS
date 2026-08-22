use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvaluationDataset {
    pub name: String,
    pub version: String,
    pub cases: Vec<EvaluationCase>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvaluationCase {
    pub id: String,
    pub input: Value,
    #[serde(default)]
    pub expected: Option<Value>,
    #[serde(default)]
    pub metadata: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvaluationSample {
    pub case_id: String,
    pub output: Value,
    pub score: f64,
    #[serde(default)]
    pub details: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvaluationReport {
    pub dataset: String,
    pub dataset_version: String,
    pub evaluator: String,
    pub samples: Vec<EvaluationSample>,
    pub mean_score: f64,
    pub pass_rate: f64,
}

pub trait EvaluationTarget {
    fn run(&mut self, input: &Value) -> anyhow::Result<Value>;
}

pub trait Evaluator {
    fn name(&self) -> &str;
    fn score(
        &self,
        case: &EvaluationCase,
        output: &Value,
    ) -> anyhow::Result<(f64, BTreeMap<String, Value>)>;
}

pub struct BatchRunner<E> {
    evaluator: E,
    pass_threshold: f64,
}
impl<E: Evaluator> BatchRunner<E> {
    pub fn new(evaluator: E, pass_threshold: f64) -> Self {
        Self {
            evaluator,
            pass_threshold: pass_threshold.clamp(0.0, 1.0),
        }
    }
    pub fn run<T: EvaluationTarget>(
        &self,
        dataset: &EvaluationDataset,
        target: &mut T,
    ) -> anyhow::Result<EvaluationReport> {
        let mut samples = Vec::with_capacity(dataset.cases.len());
        for case in &dataset.cases {
            let output = target.run(&case.input)?;
            let (score, details) = self.evaluator.score(case, &output)?;
            samples.push(EvaluationSample {
                case_id: case.id.clone(),
                output,
                score: score.clamp(0.0, 1.0),
                details,
            });
        }
        let mean_score = if samples.is_empty() {
            0.0
        } else {
            samples.iter().map(|sample| sample.score).sum::<f64>() / samples.len() as f64
        };
        let pass_rate = if samples.is_empty() {
            0.0
        } else {
            samples
                .iter()
                .filter(|sample| sample.score >= self.pass_threshold)
                .count() as f64
                / samples.len() as f64
        };
        Ok(EvaluationReport {
            dataset: dataset.name.clone(),
            dataset_version: dataset.version.clone(),
            evaluator: self.evaluator.name().into(),
            samples,
            mean_score,
            pass_rate,
        })
    }
}

#[derive(Clone, Debug, Default)]
pub struct ExactMatchEvaluator;
impl Evaluator for ExactMatchEvaluator {
    fn name(&self) -> &str {
        "exact_match"
    }
    fn score(
        &self,
        case: &EvaluationCase,
        output: &Value,
    ) -> anyhow::Result<(f64, BTreeMap<String, Value>)> {
        let expected = case
            .expected
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("case {} has no expected output", case.id))?;
        let matched = expected == output;
        let mut details = BTreeMap::new();
        details.insert("matched".into(), Value::Bool(matched));
        Ok((if matched { 1.0 } else { 0.0 }, details))
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReportComparison {
    pub baseline_mean: f64,
    pub candidate_mean: f64,
    pub delta: f64,
    pub regression: bool,
    pub changed_cases: usize,
}

pub fn compare_reports(
    baseline: &EvaluationReport,
    candidate: &EvaluationReport,
    minimum_delta: f64,
) -> anyhow::Result<ReportComparison> {
    if baseline.dataset != candidate.dataset {
        anyhow::bail!("reports belong to different datasets");
    }
    let baseline_by_id = baseline
        .samples
        .iter()
        .map(|sample| (&sample.case_id, sample.score))
        .collect::<BTreeMap<_, _>>();
    let changed_cases = candidate
        .samples
        .iter()
        .filter(|sample| {
            baseline_by_id
                .get(&sample.case_id)
                .is_some_and(|score| (*score - sample.score).abs() > f64::EPSILON)
        })
        .count();
    let delta = candidate.mean_score - baseline.mean_score;
    Ok(ReportComparison {
        baseline_mean: baseline.mean_score,
        candidate_mean: candidate.mean_score,
        delta,
        regression: delta < -minimum_delta.abs(),
        changed_cases,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Echo;
    impl EvaluationTarget for Echo {
        fn run(&mut self, input: &Value) -> anyhow::Result<Value> {
            Ok(input.clone())
        }
    }
    #[test]
    fn batch_report_and_regression_comparison() {
        let dataset = EvaluationDataset {
            name: "smoke".into(),
            version: "1".into(),
            cases: vec![EvaluationCase {
                id: "a".into(),
                input: Value::String("ok".into()),
                expected: Some(Value::String("ok".into())),
                metadata: BTreeMap::new(),
            }],
        };
        let runner = BatchRunner::new(ExactMatchEvaluator, 1.0);
        let baseline = runner.run(&dataset, &mut Echo).unwrap();
        let candidate = EvaluationReport {
            mean_score: 0.0,
            samples: vec![EvaluationSample {
                case_id: "a".into(),
                output: Value::Null,
                score: 0.0,
                details: BTreeMap::new(),
            }],
            ..baseline.clone()
        };
        let comparison = compare_reports(&baseline, &candidate, 0.1).unwrap();
        assert!(comparison.regression);
        assert_eq!(comparison.changed_cases, 1);
    }
}
