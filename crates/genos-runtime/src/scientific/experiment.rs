use anyhow::bail;
use chrono::{Duration, Utc};
use genos_core::{LineageDag, LineageEdge, LineageRelation, SnapshotId};
use serde_json::json;
use std::collections::{HashMap, HashSet};

use super::artifacts::{
    push_artifact, push_json_artifact, revise_belief, ArtifactDetail, BeliefRevisionInput,
    JsonArtifactDetail,
};
use super::compression::benchmark;
use super::reproduction::process_reproductions;
use super::rewind::process_rewinds;
use super::types::{
    BeliefRevision, ScientificArtifactKind, ScientificExperimentManifest,
    ScientificExperimentReport, ScientificHypothesisOutcome, ScientificProtocol,
    ScientificReproductionOutcome, ScientificRewindOutcome,
};

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
        let parent_snapshot = resolve_parent_snapshot(hypothesis.parent.as_deref(), &known, &root)?;
        validate_protocol(&hypothesis.protocol)?;

        let snapshot_id = SnapshotId(format!("science-{}", hypothesis.id));
        let metrics = benchmark(
            &hypothesis.strategy,
            &manifest.records,
            &hypothesis.protocol,
        )?;
        let belief = revise_belief(
            BeliefRevisionInput {
                id: &hypothesis.id,
                prior: hypothesis.prior_confidence,
                evidence: vec![format!("results:{}", hypothesis.id)],
            },
            &metrics,
        );

        let mut artifact_ids = Vec::new();
        artifact_ids.push(push_artifact(
            &mut artifacts,
            ScientificArtifactKind::Implementation,
            ArtifactDetail {
                owner: &hypothesis.id,
                contents: &hypothesis.implementation_source,
                summary: "researcher implementation source",
            },
        ));
        artifact_ids.push(push_json_artifact(
            &mut artifacts,
            ScientificArtifactKind::Protocol,
            JsonArtifactDetail {
                owner: &hypothesis.id,
                value: &hypothesis.protocol,
                summary: "versioned experimental protocol",
            },
        )?);
        artifact_ids.push(push_json_artifact(
            &mut artifacts,
            ScientificArtifactKind::Results,
            JsonArtifactDetail {
                owner: &hypothesis.id,
                value: &metrics,
                summary: "collected compression measurements",
            },
        )?);
        for critique in &hypothesis.critiques {
            artifact_ids.push(push_json_artifact(
                &mut artifacts,
                ScientificArtifactKind::Critique,
                JsonArtifactDetail {
                    owner: &hypothesis.id,
                    value: critique,
                    summary: "peer critique",
                },
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

    let reproductions = process_reproductions(
        &manifest,
        &by_id,
        &strategy_by_id,
        &protocol_by_id,
        &mut artifacts,
    )?;

    let rewinds = process_rewinds(
        &manifest,
        &by_id,
        &root,
        started,
        &mut artifacts,
        &mut lineage,
    )?;

    let final_beliefs = compute_final_beliefs(&outcomes, &reproductions, &rewinds);
    let primitive_trace = build_scientific_primitive_trace(
        &manifest,
        outcomes.len(),
        reproductions.len(),
        &rewinds,
        artifacts.len(),
        lineage.edges.len(),
        final_beliefs.len(),
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

fn resolve_parent_snapshot(
    parent: Option<&str>,
    known: &HashSet<String>,
    root: &SnapshotId,
) -> anyhow::Result<SnapshotId> {
    match parent {
        Some(parent_id) => {
            if !known.contains(parent_id) {
                bail!("hypothesis references unavailable parent {parent_id}");
            }
            Ok(SnapshotId(format!("science-{parent_id}")))
        }
        None => Ok(root.clone()),
    }
}

pub fn validate_protocol(protocol: &ScientificProtocol) -> anyhow::Result<()> {
    if protocol.repetitions == 0 {
        bail!("protocol repetitions must be positive");
    }
    if protocol.metric != "compression_ratio" {
        bail!("unsupported scientific metric {}", protocol.metric);
    }
    Ok(())
}

fn compute_final_beliefs(
    outcomes: &[ScientificHypothesisOutcome],
    reproductions: &[ScientificReproductionOutcome],
    rewinds: &[ScientificRewindOutcome],
) -> Vec<BeliefRevision> {
    let mut final_beliefs = outcomes
        .iter()
        .map(|outcome| outcome.belief.clone())
        .collect::<Vec<_>>();
    for reproduction in reproductions {
        if let Some(belief) = final_beliefs
            .iter_mut()
            .find(|b| b.hypothesis_id == reproduction.target_hypothesis)
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
    final_beliefs
}

fn build_scientific_primitive_trace(
    manifest: &ScientificExperimentManifest,
    hypotheses_count: usize,
    reproductions_count: usize,
    rewinds: &[ScientificRewindOutcome],
    artifact_count: usize,
    lineage_edge_count: usize,
    final_belief_count: usize,
) -> crate::AgentPrimitiveTrace {
    let mut primitive_trace = crate::AgentPrimitiveTrace::default();
    primitive_trace.completed(
        crate::AgentPrimitive::Snapshot,
        manifest.snapshot_ref.clone(),
        json!({ "question": manifest.question.clone() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Fork,
        manifest.name.clone(),
        json!({ "hypotheses": hypotheses_count }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Run,
        "experimental-protocols",
        json!({ "executed": hypotheses_count, "artifacts": artifact_count }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Replay,
        "independent-reproductions",
        json!({ "reproductions": reproductions_count }),
    );
    for rewind in rewinds {
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
        json!({ "beliefs": final_belief_count }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Lineage,
        manifest.name.clone(),
        json!({ "edges": lineage_edge_count }),
    );
    primitive_trace
}
