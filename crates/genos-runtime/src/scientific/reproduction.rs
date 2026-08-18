use anyhow::Context;
use std::collections::HashMap;

use super::artifacts::{push_json_artifact, JsonArtifactDetail};
use super::compression::benchmark;
use super::types::{
    CompressionStrategy, ScientificArtifact, ScientificArtifactKind, ScientificExperimentManifest,
    ScientificHypothesisOutcome, ScientificProtocol, ScientificReproductionOutcome,
};

pub fn process_reproductions(
    manifest: &ScientificExperimentManifest,
    by_id: &HashMap<String, &ScientificHypothesisOutcome>,
    strategy_by_id: &HashMap<String, CompressionStrategy>,
    protocol_by_id: &HashMap<String, ScientificProtocol>,
    artifacts: &mut Vec<ScientificArtifact>,
) -> anyhow::Result<Vec<ScientificReproductionOutcome>> {
    let mut reproductions = Vec::new();
    for spec in &manifest.reproductions {
        let target = by_id.get(&spec.target_hypothesis).with_context(|| {
            format!(
                "reproduction targets unknown hypothesis {}",
                spec.target_hypothesis
            )
        })?;
        let records = if spec.records.is_empty() {
            &manifest.records
        } else {
            &spec.records
        };
        let protocol = if spec.records.is_empty() {
            protocol_by_id
                .get(&spec.target_hypothesis)
                .expect("validated target")
                .clone()
        } else {
            ScientificProtocol {
                repetitions: target.metrics.repetitions,
                metric: "compression_ratio".to_string(),
                holdout_records: Vec::new(),
            }
        };
        let reproduced = benchmark(
            strategy_by_id
                .get(&spec.target_hypothesis)
                .expect("validated target"),
            records,
            &protocol,
        )?;
        let consistent = (target.metrics.compression_ratio - reproduced.compression_ratio).abs()
            <= spec.tolerance
            && reproduced.round_trip_valid;
        let artifact_id = push_json_artifact(
            artifacts,
            ScientificArtifactKind::Reproduction,
            JsonArtifactDetail {
                owner: &spec.researcher_id,
                value: &reproduced,
                summary: "independent reproduction result",
            },
        )?;
        reproductions.push(ScientificReproductionOutcome {
            researcher_id: spec.researcher_id.clone(),
            target_hypothesis: spec.target_hypothesis.clone(),
            original_ratio: target.metrics.compression_ratio,
            reproduced_ratio: reproduced.compression_ratio,
            consistent,
            artifact_id,
        });
    }
    Ok(reproductions)
}
