use async_trait::async_trait;
use genos_model::{GenerationConfig, LlmProvider, Message, Role};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;

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

#[async_trait]
pub trait AsyncEvaluator: Send + Sync {
    fn name(&self) -> &str;
    async fn score_async(
        &self,
        case: &EvaluationCase,
        output: &Value,
    ) -> anyhow::Result<(f64, BTreeMap<String, Value>)>;
}

/// Generic LLM-as-judge evaluator. The model must answer with a JSON object
/// containing `score` in [0, 1] and may optionally provide `reason`.
pub struct LlmJudge {
    provider: Arc<dyn LlmProvider>,
    model: String,
}
impl LlmJudge {
    pub fn new(provider: Arc<dyn LlmProvider>, model: impl Into<String>) -> Self {
        Self {
            provider,
            model: model.into(),
        }
    }
}
#[async_trait]
impl AsyncEvaluator for LlmJudge {
    fn name(&self) -> &str {
        "llm_judge"
    }
    async fn score_async(
        &self,
        case: &EvaluationCase,
        output: &Value,
    ) -> anyhow::Result<(f64, BTreeMap<String, Value>)> {
        let prompt = format!("Evaluate the candidate output against the expected output. Return only JSON: {{\"score\": number 0..1, \"reason\": string}}.\nInput: {}\nExpected: {}\nCandidate: {}", case.input, case.expected.as_ref().unwrap_or(&Value::Null), output);
        let response = self
            .provider
            .generate(
                &[Message {
                    role: Role::User,
                    content: prompt,
                    tool_call_id: None,
                }],
                &GenerationConfig {
                    exact_model_version: Some(self.model.clone()),
                    ..Default::default()
                },
            )
            .await?;
        let value: Value = serde_json::from_str(
            response
                .content
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("judge returned no content"))?,
        )?;
        let score = value
            .get("score")
            .and_then(Value::as_f64)
            .ok_or_else(|| anyhow::anyhow!("judge response has no numeric score"))?
            .clamp(0.0, 1.0);
        let mut details = BTreeMap::new();
        if let Some(reason) = value.get("reason") {
            details.insert("reason".into(), reason.clone());
        }
        Ok((score, details))
    }
}

pub async fn run_llm_judge<T: EvaluationTarget, E: AsyncEvaluator>(
    dataset: &EvaluationDataset,
    target: &mut T,
    evaluator: &E,
    pass_threshold: f64,
) -> anyhow::Result<EvaluationReport> {
    let mut samples = Vec::with_capacity(dataset.cases.len());
    for case in &dataset.cases {
        let output = target.run(&case.input)?;
        let (score, details) = evaluator.score_async(case, &output).await?;
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
    let threshold = pass_threshold.clamp(0.0, 1.0);
    let pass_rate = if samples.is_empty() {
        0.0
    } else {
        samples
            .iter()
            .filter(|sample| sample.score >= threshold)
            .count() as f64
            / samples.len() as f64
    };
    Ok(EvaluationReport {
        dataset: dataset.name.clone(),
        dataset_version: dataset.version.clone(),
        evaluator: evaluator.name().into(),
        samples,
        mean_score,
        pass_rate,
    })
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

#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq)]
pub struct RagMetrics {
    pub retrieval_recall: f64,
    pub faithfulness: f64,
    pub answer_relevancy: f64,
    pub citation_correctness: f64,
}

/// Computes reproducible RAG metrics from a case and a JSON output. The case
/// metadata accepts `relevant_chunk_ids` and `contexts`; the response accepts
/// `answer`, `retrieved_chunk_ids` and `citations`.
pub fn evaluate_rag_case(case: &EvaluationCase, output: &Value) -> RagMetrics {
    let relevant = string_set(case.metadata.get("relevant_chunk_ids"));
    let retrieved = string_set(output.get("retrieved_chunk_ids"));
    let cited = string_set(output.get("citations"));
    let retrieval_recall = ratio(relevant.intersection(&retrieved).count(), relevant.len());
    let citation_correctness = ratio(cited.intersection(&relevant).count(), cited.len());
    let answer = output
        .get("answer")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let question = case.input.as_str().unwrap_or_else(|| {
        case.input
            .get("query")
            .and_then(Value::as_str)
            .unwrap_or_default()
    });
    let contexts = case
        .metadata
        .get("contexts")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>())
        .unwrap_or_default();
    let context_text = contexts.join(" ").to_lowercase();
    let answer_terms = terms(answer);
    let supported = answer_terms
        .iter()
        .filter(|term| context_text.contains(term.as_str()))
        .count();
    let faithfulness = ratio(supported, answer_terms.len());
    let question_terms = terms(question);
    let relevant_terms = answer_terms
        .iter()
        .filter(|term| question_terms.contains(*term))
        .count();
    let answer_relevancy = ratio(relevant_terms, answer_terms.len());
    RagMetrics {
        retrieval_recall,
        faithfulness,
        answer_relevancy,
        citation_correctness,
    }
}

fn string_set(value: Option<&Value>) -> std::collections::BTreeSet<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect()
}
fn ratio(numerator: usize, denominator: usize) -> f64 {
    if denominator == 0 {
        1.0
    } else {
        numerator as f64 / denominator as f64
    }
}
fn terms(value: &str) -> std::collections::BTreeSet<String> {
    value
        .split(|character: char| !character.is_alphanumeric())
        .filter(|term| term.len() > 1)
        .map(|term| term.to_lowercase())
        .collect()
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

    #[test]
    fn rag_metrics_capture_retrieval_grounding_and_citations() {
        let case = EvaluationCase {
            id: "rag".into(),
            input: Value::String("What supports durable replay?".into()),
            expected: None,
            metadata: BTreeMap::from([
                ("relevant_chunk_ids".into(), serde_json::json!(["a", "b"])),
                (
                    "contexts".into(),
                    serde_json::json!(["Durable replay is supported by snapshots."]),
                ),
            ]),
        };
        let output = serde_json::json!({"answer":"Snapshots support durable replay", "retrieved_chunk_ids":["a", "x"], "citations":["a"]});
        let metrics = evaluate_rag_case(&case, &output);
        assert_eq!(metrics.retrieval_recall, 0.5);
        assert_eq!(metrics.citation_correctness, 1.0);
        assert!(metrics.faithfulness > 0.5);
        assert!(metrics.answer_relevancy > 0.0);
    }
}
