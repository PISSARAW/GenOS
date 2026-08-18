use anyhow::Context;
use chrono::{Duration, Utc};
use genos_core::{LineageDag, LineageEdge, LineageRelation, SnapshotId};
use serde_json::json;
use std::collections::HashMap;

use super::artifacts::{
    push_artifact, push_json_artifact, revise_belief, ArtifactDetail, BeliefRevisionInput,
    JsonArtifactDetail,
};
use super::compression::benchmark;
use super::experiment::validate_protocol;
use super::types::{
    ScientificArtifact, ScientificArtifactKind, ScientificExperimentManifest,
    ScientificHypothesisOutcome, ScientificRewindOutcome,
};

pub fn process_rewinds(
    manifest: &ScientificExperimentManifest,
    by_id: &HashMap<String, &ScientificHypothesisOutcome>,
    root: &SnapshotId,
    started: chrono::DateTime<Utc>,
    artifacts: &mut Vec<ScientificArtifact>,
    lineage: &mut LineageDag,
) -> anyhow::Result<Vec<ScientificRewindOutcome>> {
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
            BeliefRevisionInput {
                id: &rewind.id,
                prior: rewind.prior_confidence,
                evidence: vec![format!("rewind-before:{}", rewind.suspicious_hypothesis)],
            },
            &metrics,
        );
        let new_snapshot_id = SnapshotId(format!("science-{}", rewind.id));
        let artifact_ids = vec![
            push_artifact(
                artifacts,
                ScientificArtifactKind::Implementation,
                ArtifactDetail {
                    owner: &rewind.id,
                    contents: &rewind.implementation_source,
                    summary: "rewound investigation implementation",
                },
            ),
            push_json_artifact(
                artifacts,
                ScientificArtifactKind::Protocol,
                JsonArtifactDetail {
                    owner: &rewind.id,
                    value: &rewind.protocol,
                    summary: "rewound experimental protocol",
                },
            )?,
            push_json_artifact(
                artifacts,
                ScientificArtifactKind::Results,
                JsonArtifactDetail {
                    owner: &rewind.id,
                    value: &metrics,
                    summary: "rewound investigation measurements",
                },
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
    Ok(rewinds)
}
