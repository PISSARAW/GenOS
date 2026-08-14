use genos_core::{LineageRelation, SnapshotId};
use genos_runtime::{
    run_scientific_experiment, CompressionStrategy, ScientificCritiqueSpec,
    ScientificExperimentManifest, ScientificHypothesisSpec, ScientificProtocol,
    ScientificReproductionSpec, ScientificRewindSpec,
};

fn protocol() -> ScientificProtocol {
    ScientificProtocol {
        repetitions: 2,
        metric: "compression_ratio".to_string(),
        holdout_records: vec!["ABCDABCD".to_string()],
    }
}

fn hypothesis(
    id: &str,
    parent: Option<&str>,
    strategy: CompressionStrategy,
) -> ScientificHypothesisSpec {
    ScientificHypothesisSpec {
        id: id.to_string(),
        parent: parent.map(str::to_string),
        claim: format!("claim {id}"),
        strategy,
        implementation_source: format!("fn compress_{id}() {{}}"),
        protocol: protocol(),
        prior_confidence: 0.5,
        critiques: if id == "H4" {
            vec![ScientificCritiqueSpec {
                target: "H3".to_string(),
                concern: "corpus bias".to_string(),
            }]
        } else {
            Vec::new()
        },
    }
}

#[test]
fn scientific_process_versions_recursive_hypotheses_reproduction_and_rewind() {
    let hypotheses = vec![
        hypothesis("H0", None, CompressionStrategy::Raw),
        hypothesis("H1", Some("H0"), CompressionStrategy::RunLength),
        hypothesis("H2", Some("H0"), CompressionStrategy::DeltaRunLength),
        hypothesis(
            "H3",
            Some("H0"),
            CompressionStrategy::ChunkDedup { chunk_size: 4 },
        ),
        hypothesis(
            "H3a",
            Some("H3"),
            CompressionStrategy::ChunkDedup { chunk_size: 2 },
        ),
        hypothesis(
            "H3b",
            Some("H3"),
            CompressionStrategy::ChunkDedup { chunk_size: 8 },
        ),
        hypothesis(
            "H3c",
            Some("H3"),
            CompressionStrategy::ChunkDedup { chunk_size: 6 },
        ),
        hypothesis("H4", Some("H0"), CompressionStrategy::Adaptive),
    ];
    let report = run_scientific_experiment(ScientificExperimentManifest {
        name: "compression-science".to_string(),
        question: "better compression".to_string(),
        snapshot_ref: "research@H0".to_string(),
        records: vec!["AAAABBBB".to_string(), "ABCDABCDABCD".to_string()],
        hypotheses,
        reproductions: vec![
            ScientificReproductionSpec {
                researcher_id: "peer-1".to_string(),
                target_hypothesis: "H1".to_string(),
                records: Vec::new(),
                tolerance: 0.0,
            },
            ScientificReproductionSpec {
                researcher_id: "peer-2".to_string(),
                target_hypothesis: "H3".to_string(),
                records: vec!["unrelated-control-data".to_string()],
                tolerance: 0.0,
            },
        ],
        rewinds: vec![ScientificRewindSpec {
            id: "H3-recheck".to_string(),
            suspicious_hypothesis: "H3".to_string(),
            restore_snapshot: "H0".to_string(),
            reason: "suspect result".to_string(),
            strategy: CompressionStrategy::Adaptive,
            implementation_source: "fn recheck() {}".to_string(),
            protocol: protocol(),
            prior_confidence: 0.4,
        }],
    })
    .expect("scientific experiment failed");

    assert_eq!(report.hypotheses.len(), 8);
    assert!(report
        .hypotheses
        .iter()
        .all(|outcome| outcome.metrics.round_trip_valid));
    assert_eq!(
        report
            .lineage
            .children_of(&SnapshotId("science-H3".to_string()))
            .len(),
        3
    );
    assert!(report.reproductions[0].consistent);
    assert!(!report.reproductions[1].consistent);
    assert_eq!(
        report.rewinds[0].restored_from_snapshot,
        SnapshotId("science-H0".to_string())
    );
    assert!(report.lineage.edges.iter().any(|edge| {
        edge.relation == LineageRelation::Restore
            && edge.child_snapshot == SnapshotId("science-H3-recheck".to_string())
    }));
    assert!(report
        .hypotheses
        .iter()
        .any(|outcome| outcome.hypothesis_id == "H3"));
    assert!(report
        .final_beliefs
        .iter()
        .find(|belief| belief.hypothesis_id == "H3")
        .expect("H3 belief missing")
        .rationale
        .contains("reproduction mismatch"));
    assert!(report
        .artifacts
        .iter()
        .any(|artifact| artifact.summary == "researcher implementation source"));
    assert!(report
        .artifacts
        .iter()
        .any(|artifact| artifact.summary == "versioned experimental protocol"));
    assert!(report
        .artifacts
        .iter()
        .any(|artifact| artifact.summary == "peer critique"));
}
