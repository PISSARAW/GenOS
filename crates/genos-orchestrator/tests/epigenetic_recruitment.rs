use genos_dna::{codec, compile, manifest::Manifest, model::EpiMark};
use genos_orchestrator::{Demand, GenosEcosystem};

fn candidate_dna() -> genos_dna::AgentDna {
    let manifest: Manifest = serde_json::from_str(
        r#"{
            "apiVersion": "v0alpha1",
            "kind": "AgentGenome",
            "metadata": { "name": "EvidenceLedger", "version": "0.1.0" },
            "identity": { "role": "historian", "name": "EvidenceLedger", "name_meaning": "preuve" },
            "objectives": { "primary": "archiver", "source_doc": "docs/README.md" },
            "capabilities": [],
            "tool_policy": { "allowed_tools": [] }
        }"#,
    )
    .expect("manifest");
    compile::compile_manifest(&manifest).expect("DNA compilé")
}

#[test]
fn persisted_methylation_changes_runtime_recruitment_role() {
    let dna = candidate_dna();
    let mut marked = dna.clone();
    marked.epigenome.marks.insert(
        "ROLE".to_string(),
        EpiMark {
            kind: "Methylation".to_string(),
            level: 1.0,
        },
    );
    let restored = codec::decode(&codec::encode(&marked).expect("encodage"))
        .expect("décodage après persistance");
    let demand = Demand {
        roles: vec!["historian".to_string()],
        capabilities: Vec::new(),
        budget: 10.0,
    };

    let mut baseline = GenosEcosystem::new("epigenetic-baseline");
    let baseline_result = baseline.recruit_dna("Archive", &demand, &[(&dna, 1.0)]);
    assert!(baseline_result.feasible);
    assert_eq!(baseline_result.selected[0].candidate, "EvidenceLedger");
    assert_eq!(baseline.orchestrator.tissues["Archive"].somatic_cells.len(), 1);

    let mut silenced = GenosEcosystem::new("epigenetic-silenced");
    let silenced_result = silenced.recruit_dna("Archive", &demand, &[(&restored, 1.0)]);
    assert!(!silenced_result.feasible);
    assert!(silenced_result.selected.is_empty());
    assert!(!silenced.orchestrator.tissues.contains_key("Archive"));
}
