use anyhow::{bail, Context};
use chrono::{Duration, Utc};
use genos_core::{LineageDag, LineageEdge, LineageRelation, SnapshotId};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CompressionStrategy {
    Raw,
    RunLength,
    DeltaRunLength,
    ChunkDedup { chunk_size: usize },
    Adaptive,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScientificProtocol {
    pub repetitions: u32,
    pub metric: String,
    #[serde(default)]
    pub holdout_records: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificCritiqueSpec {
    pub target: String,
    pub concern: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificHypothesisSpec {
    pub id: String,
    pub parent: Option<String>,
    pub claim: String,
    pub strategy: CompressionStrategy,
    pub implementation_source: String,
    pub protocol: ScientificProtocol,
    pub prior_confidence: f64,
    #[serde(default)]
    pub critiques: Vec<ScientificCritiqueSpec>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificReproductionSpec {
    pub researcher_id: String,
    pub target_hypothesis: String,
    #[serde(default)]
    pub records: Vec<String>,
    pub tolerance: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificRewindSpec {
    pub id: String,
    pub suspicious_hypothesis: String,
    pub restore_snapshot: String,
    pub reason: String,
    pub strategy: CompressionStrategy,
    pub implementation_source: String,
    pub protocol: ScientificProtocol,
    pub prior_confidence: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificExperimentManifest {
    pub name: String,
    pub question: String,
    pub snapshot_ref: String,
    pub records: Vec<String>,
    pub hypotheses: Vec<ScientificHypothesisSpec>,
    #[serde(default)]
    pub reproductions: Vec<ScientificReproductionSpec>,
    #[serde(default)]
    pub rewinds: Vec<ScientificRewindSpec>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScientificArtifactKind {
    Implementation,
    Protocol,
    Results,
    Critique,
    Reproduction,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScientificArtifact {
    pub artifact_id: String,
    pub kind: ScientificArtifactKind,
    pub owner: String,
    pub sha256: String,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CompressionMetrics {
    pub input_bytes: usize,
    pub compressed_bytes: usize,
    pub compression_ratio: f64,
    pub round_trip_valid: bool,
    pub repetitions: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BeliefRevision {
    pub hypothesis_id: String,
    pub prior_confidence: f64,
    pub posterior_confidence: f64,
    pub evidence: Vec<String>,
    pub rationale: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificHypothesisOutcome {
    pub hypothesis_id: String,
    pub parent_hypothesis_id: Option<String>,
    pub snapshot_id: SnapshotId,
    pub claim: String,
    pub strategy: CompressionStrategy,
    pub metrics: CompressionMetrics,
    pub belief: BeliefRevision,
    pub artifact_ids: Vec<String>,
    pub critiques: Vec<ScientificCritiqueSpec>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificReproductionOutcome {
    pub researcher_id: String,
    pub target_hypothesis: String,
    pub original_ratio: f64,
    pub reproduced_ratio: f64,
    pub consistent: bool,
    pub artifact_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificRewindOutcome {
    pub investigation_id: String,
    pub suspicious_hypothesis: String,
    pub restored_from_snapshot: SnapshotId,
    pub new_snapshot_id: SnapshotId,
    pub reason: String,
    pub metrics: CompressionMetrics,
    pub belief: BeliefRevision,
    pub artifact_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificExperimentReport {
    pub name: String,
    pub question: String,
    pub snapshot_ref: String,
    pub hypotheses: Vec<ScientificHypothesisOutcome>,
    pub reproductions: Vec<ScientificReproductionOutcome>,
    pub rewinds: Vec<ScientificRewindOutcome>,
    pub final_beliefs: Vec<BeliefRevision>,
    pub artifacts: Vec<ScientificArtifact>,
    pub lineage: LineageDag,
    pub primitive_trace: crate::AgentPrimitiveTrace,
}

/// Execute a deterministic, provider-free scientific workflow. Compression is
/// really performed and round-tripped; source, protocol, measurements,
/// critiques and reproductions are persisted as content-addressed artifacts.
pub fn run_scientific_experiment(
    manifest: ScientificExperimentManifest,
) -> anyhow::Result<ScientificExperimentReport> {
    if manifest.records.is_empty() || manifest.hypotheses.is_empty() {
        bail!("scientific experiments require records and hypotheses");
    }
    let mut known = HashSet::new();
    let mut outcomes = Vec::new();
    let mut artifacts = Vec::new();
    let mut lineage = LineageDag::default();
    let root = SnapshotId(manifest.snapshot_ref.clone());
    let started = Utc::now();

    for (index, hypothesis) in manifest.hypotheses.iter().enumerate() {
        if !known.insert(hypothesis.id.clone()) {
            bail!("duplicate hypothesis id {}", hypothesis.id);
        }
        let parent_snapshot = match &hypothesis.parent {
            Some(parent) => {
                if !known.contains(parent) {
                    bail!(
                        "hypothesis {} references unavailable parent {}",
                        hypothesis.id,
                        parent
                    );
                }
                SnapshotId(format!("science-{parent}"))
            }
            None => root.clone(),
        };
        validate_protocol(&hypothesis.protocol)?;
        let snapshot_id = SnapshotId(format!("science-{}", hypothesis.id));
        let metrics = benchmark(
            &hypothesis.strategy,
            &manifest.records,
            &hypothesis.protocol,
        )?;
        let belief = revise_belief(
            &hypothesis.id,
            hypothesis.prior_confidence,
            &metrics,
            vec![format!("results:{}", hypothesis.id)],
        );
        let mut artifact_ids = Vec::new();
        artifact_ids.push(push_artifact(
            &mut artifacts,
            ScientificArtifactKind::Implementation,
            &hypothesis.id,
            &hypothesis.implementation_source,
            "researcher implementation source",
        ));
        artifact_ids.push(push_json_artifact(
            &mut artifacts,
            ScientificArtifactKind::Protocol,
            &hypothesis.id,
            &hypothesis.protocol,
            "versioned experimental protocol",
        )?);
        artifact_ids.push(push_json_artifact(
            &mut artifacts,
            ScientificArtifactKind::Results,
            &hypothesis.id,
            &metrics,
            "collected compression measurements",
        )?);
        for critique in &hypothesis.critiques {
            artifact_ids.push(push_json_artifact(
                &mut artifacts,
                ScientificArtifactKind::Critique,
                &hypothesis.id,
                critique,
                "peer critique",
            )?);
        }
        lineage.edges.push(LineageEdge {
            parent_snapshot,
            child_snapshot: snapshot_id.clone(),
            relation: LineageRelation::Fork,
            created_at: started + Duration::milliseconds(index as i64),
            metadata: json!({"hypothesis": hypothesis.id, "claim": hypothesis.claim}),
        });
        outcomes.push(ScientificHypothesisOutcome {
            hypothesis_id: hypothesis.id.clone(),
            parent_hypothesis_id: hypothesis.parent.clone(),
            snapshot_id,
            claim: hypothesis.claim.clone(),
            strategy: hypothesis.strategy.clone(),
            metrics,
            belief,
            artifact_ids,
            critiques: hypothesis.critiques.clone(),
        });
    }

    let by_id = outcomes
        .iter()
        .map(|outcome| (outcome.hypothesis_id.clone(), outcome))
        .collect::<HashMap<_, _>>();
    let strategy_by_id = manifest
        .hypotheses
        .iter()
        .map(|hypothesis| (hypothesis.id.clone(), hypothesis.strategy.clone()))
        .collect::<HashMap<_, _>>();
    let protocol_by_id = manifest
        .hypotheses
        .iter()
        .map(|hypothesis| (hypothesis.id.clone(), hypothesis.protocol.clone()))
        .collect::<HashMap<_, _>>();
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
            &mut artifacts,
            ScientificArtifactKind::Reproduction,
            &spec.researcher_id,
            &reproduced,
            "independent reproduction result",
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

    let mut rewinds = Vec::new();
    for (index, rewind) in manifest.rewinds.iter().enumerate() {
        let suspicious = by_id.get(&rewind.suspicious_hypothesis).with_context(|| {
            format!(
                "rewind targets unknown hypothesis {}",
                rewind.suspicious_hypothesis
            )
        })?;
        let restore_snapshot = if rewind.restore_snapshot == manifest.snapshot_ref {
            root.clone()
        } else {
            let restore = by_id.get(&rewind.restore_snapshot).with_context(|| {
                format!(
                    "rewind references unknown snapshot {}",
                    rewind.restore_snapshot
                )
            })?;
            restore.snapshot_id.clone()
        };
        validate_protocol(&rewind.protocol)?;
        let metrics = benchmark(&rewind.strategy, &manifest.records, &rewind.protocol)?;
        let belief = revise_belief(
            &rewind.id,
            rewind.prior_confidence,
            &metrics,
            vec![format!("rewind-before:{}", rewind.suspicious_hypothesis)],
        );
        let new_snapshot_id = SnapshotId(format!("science-{}", rewind.id));
        let artifact_ids = vec![
            push_artifact(
                &mut artifacts,
                ScientificArtifactKind::Implementation,
                &rewind.id,
                &rewind.implementation_source,
                "rewound investigation implementation",
            ),
            push_json_artifact(
                &mut artifacts,
                ScientificArtifactKind::Protocol,
                &rewind.id,
                &rewind.protocol,
                "rewound experimental protocol",
            )?,
            push_json_artifact(
                &mut artifacts,
                ScientificArtifactKind::Results,
                &rewind.id,
                &metrics,
                "rewound investigation measurements",
            )?,
        ];
        lineage.edges.push(LineageEdge {
            parent_snapshot: restore_snapshot.clone(),
            child_snapshot: new_snapshot_id.clone(),
            relation: LineageRelation::Restore,
            created_at: started + Duration::seconds(1) + Duration::milliseconds(index as i64),
            metadata: json!({
                "suspicious_hypothesis": suspicious.hypothesis_id,
                "reason": rewind.reason,
            }),
        });
        rewinds.push(ScientificRewindOutcome {
            investigation_id: rewind.id.clone(),
            suspicious_hypothesis: rewind.suspicious_hypothesis.clone(),
            restored_from_snapshot: restore_snapshot,
            new_snapshot_id,
            reason: rewind.reason.clone(),
            metrics,
            belief,
            artifact_ids,
        });
    }

    let mut final_beliefs = outcomes
        .iter()
        .map(|outcome| outcome.belief.clone())
        .collect::<Vec<_>>();
    for reproduction in &reproductions {
        if let Some(belief) = final_beliefs
            .iter_mut()
            .find(|belief| belief.hypothesis_id == reproduction.target_hypothesis)
        {
            belief
                .evidence
                .push(format!("reproduction:{}", reproduction.researcher_id));
            if reproduction.consistent {
                belief.posterior_confidence = (belief.posterior_confidence + 0.1).min(1.0);
                belief.rationale.push_str("; independently reproduced");
            } else {
                belief.posterior_confidence = (belief.posterior_confidence - 0.3).max(0.0);
                belief
                    .rationale
                    .push_str("; reproduction mismatch lowers confidence");
            }
        }
    }
    final_beliefs.extend(rewinds.iter().map(|rewind| rewind.belief.clone()));

    let mut primitive_trace = crate::AgentPrimitiveTrace::default();
    primitive_trace.completed(
        crate::AgentPrimitive::Snapshot,
        manifest.snapshot_ref.clone(),
        json!({ "question": manifest.question.clone() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Fork,
        manifest.name.clone(),
        json!({ "hypotheses": outcomes.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Run,
        "experimental-protocols",
        json!({ "executed": outcomes.len(), "artifacts": artifacts.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Replay,
        "independent-reproductions",
        json!({ "reproductions": reproductions.len() }),
    );
    for rewind in &rewinds {
        primitive_trace.completed(
            crate::AgentPrimitive::Restore,
            rewind.investigation_id.clone(),
            json!({
                "from_snapshot": rewind.restored_from_snapshot.0.clone(),
                "suspicious_hypothesis": rewind.suspicious_hypothesis.clone(),
            }),
        );
    }
    primitive_trace.completed(
        crate::AgentPrimitive::Merge,
        "scientific-belief-synthesis",
        json!({ "beliefs": final_beliefs.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Lineage,
        manifest.name.clone(),
        json!({ "edges": lineage.edges.len() }),
    );

    Ok(ScientificExperimentReport {
        name: manifest.name,
        question: manifest.question,
        snapshot_ref: manifest.snapshot_ref,
        hypotheses: outcomes,
        reproductions,
        rewinds,
        final_beliefs,
        artifacts,
        lineage,
        primitive_trace,
    })
}

fn validate_protocol(protocol: &ScientificProtocol) -> anyhow::Result<()> {
    if protocol.repetitions == 0 {
        bail!("protocol repetitions must be positive");
    }
    if protocol.metric != "compression_ratio" {
        bail!("unsupported scientific metric {}", protocol.metric);
    }
    Ok(())
}

fn benchmark(
    strategy: &CompressionStrategy,
    records: &[String],
    protocol: &ScientificProtocol,
) -> anyhow::Result<CompressionMetrics> {
    let all = records
        .iter()
        .chain(&protocol.holdout_records)
        .collect::<Vec<_>>();
    let mut input_bytes = 0;
    let mut compressed_bytes = 0;
    let mut valid = true;
    for _ in 0..protocol.repetitions {
        for record in &all {
            let input = record.as_bytes();
            let encoded = compress(strategy, input)?;
            input_bytes += input.len();
            compressed_bytes += encoded.size;
            valid &= encoded.decoded == input;
        }
    }
    let compression_ratio = if input_bytes == 0 {
        1.0
    } else {
        compressed_bytes as f64 / input_bytes as f64
    };
    Ok(CompressionMetrics {
        input_bytes,
        compressed_bytes,
        compression_ratio,
        round_trip_valid: valid,
        repetitions: protocol.repetitions,
    })
}

struct Encoded {
    size: usize,
    decoded: Vec<u8>,
}

fn compress(strategy: &CompressionStrategy, input: &[u8]) -> anyhow::Result<Encoded> {
    match strategy {
        CompressionStrategy::Raw => Ok(Encoded {
            size: input.len(),
            decoded: input.to_vec(),
        }),
        CompressionStrategy::RunLength => rle(input),
        CompressionStrategy::DeltaRunLength => {
            let mut previous = 0_u8;
            let deltas = input
                .iter()
                .map(|byte| {
                    let delta = byte.wrapping_sub(previous);
                    previous = *byte;
                    delta
                })
                .collect::<Vec<_>>();
            let encoded = rle(&deltas)?;
            let mut previous = 0_u8;
            let decoded = encoded
                .decoded
                .iter()
                .map(|delta| {
                    let byte = previous.wrapping_add(*delta);
                    previous = byte;
                    byte
                })
                .collect();
            Ok(Encoded {
                size: encoded.size + 1,
                decoded,
            })
        }
        CompressionStrategy::ChunkDedup { chunk_size } => {
            if *chunk_size == 0 {
                bail!("chunk_size must be positive");
            }
            let mut dictionary: Vec<Vec<u8>> = Vec::new();
            let mut indexes = Vec::new();
            for chunk in input.chunks(*chunk_size) {
                let index = dictionary
                    .iter()
                    .position(|known| known == chunk)
                    .unwrap_or_else(|| {
                        dictionary.push(chunk.to_vec());
                        dictionary.len() - 1
                    });
                indexes.push(index);
            }
            let decoded = indexes
                .iter()
                .flat_map(|index| dictionary[*index].clone())
                .collect();
            let dictionary_bytes = dictionary
                .iter()
                .map(|chunk| chunk.len() + 1)
                .sum::<usize>();
            Ok(Encoded {
                size: dictionary_bytes + indexes.len() * 2 + 2,
                decoded,
            })
        }
        CompressionStrategy::Adaptive => {
            let candidates = [
                compress(&CompressionStrategy::Raw, input)?,
                rle(input)?,
                compress(&CompressionStrategy::DeltaRunLength, input)?,
            ];
            let mut best = candidates
                .into_iter()
                .min_by_key(|candidate| candidate.size)
                .unwrap();
            best.size += 1;
            Ok(best)
        }
    }
}

fn rle(input: &[u8]) -> anyhow::Result<Encoded> {
    if input.is_empty() {
        return Ok(Encoded {
            size: 0,
            decoded: Vec::new(),
        });
    }
    let mut pairs = Vec::new();
    let mut current = input[0];
    let mut count = 1_u8;
    for byte in &input[1..] {
        if *byte == current && count < u8::MAX {
            count += 1;
        } else {
            pairs.push((count, current));
            current = *byte;
            count = 1;
        }
    }
    pairs.push((count, current));
    let decoded = pairs
        .iter()
        .flat_map(|(count, byte)| std::iter::repeat_n(*byte, *count as usize))
        .collect();
    Ok(Encoded {
        size: pairs.len() * 2,
        decoded,
    })
}

fn revise_belief(
    id: &str,
    prior: f64,
    metrics: &CompressionMetrics,
    evidence: Vec<String>,
) -> BeliefRevision {
    let evidence_strength = if metrics.round_trip_valid {
        (1.0 - metrics.compression_ratio).clamp(-1.0, 1.0) * 0.4
    } else {
        -0.8
    };
    BeliefRevision {
        hypothesis_id: id.to_string(),
        prior_confidence: prior,
        posterior_confidence: (prior + evidence_strength).clamp(0.0, 1.0),
        evidence,
        rationale: format!(
            "round_trip={}, measured compression ratio={:.4}",
            metrics.round_trip_valid, metrics.compression_ratio,
        ),
    }
}

fn push_artifact(
    artifacts: &mut Vec<ScientificArtifact>,
    kind: ScientificArtifactKind,
    owner: &str,
    contents: &str,
    summary: &str,
) -> String {
    let digest = format!("{:x}", Sha256::digest(contents.as_bytes()));
    let artifact_id = format!("sha256:{digest}");
    if !artifacts
        .iter()
        .any(|artifact| artifact.artifact_id == artifact_id)
    {
        artifacts.push(ScientificArtifact {
            artifact_id: artifact_id.clone(),
            kind,
            owner: owner.to_string(),
            sha256: digest,
            summary: summary.to_string(),
        });
    }
    artifact_id
}

fn push_json_artifact<T: Serialize>(
    artifacts: &mut Vec<ScientificArtifact>,
    kind: ScientificArtifactKind,
    owner: &str,
    value: &T,
    summary: &str,
) -> anyhow::Result<String> {
    Ok(push_artifact(
        artifacts,
        kind,
        owner,
        &serde_json::to_string(value)?,
        summary,
    ))
}
