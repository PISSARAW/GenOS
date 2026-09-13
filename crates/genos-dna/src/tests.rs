use genos_genome::DnaStrand;

use crate::operations::{self, CloneOptions, CrossOptions, DecoyOptions, MutateOptions};
use crate::{codec, compile, manifest::Manifest, packing, validate};

fn sample_manifest() -> Manifest {
    let json = r#"{
        "apiVersion": "v0alpha1",
        "kind": "AgentGenome",
        "metadata": { "name": "EvidenceLedger", "version": "0.1.0" },
        "identity": { "role": "historian", "name": "EvidenceLedger", "name_meaning": "Preuve avant decision" },
        "objectives": { "primary": "Convertir les sorties en claims/evidence", "source_doc": "docs/EPISTEMOLOGIE_EVIDENCE.md" },
        "capabilities": ["enregistrer les rapports", "scorer l evidence"],
        "tool_policy": { "allowed_tools": ["genos_inspect", "genos_evidence_check"] }
    }"#;
    serde_json::from_str(json).expect("sample manifest must parse")
}

fn second_manifest() -> Manifest {
    let json = r#"{
        "apiVersion": "v0alpha1",
        "kind": "AgentGenome",
        "metadata": { "name": "SecurityAuditor", "version": "0.1.0" },
        "identity": { "role": "security", "name": "SecurityAuditor", "name_meaning": "Falsification adverse" },
        "objectives": { "primary": "Attaquer les hypotheses", "source_doc": "docs/SECURITE.md" },
        "capabilities": ["analyse adversariale"],
        "tool_policy": { "allowed_tools": ["genos_inspect", "genos_ais_prr_scan"] }
    }"#;
    serde_json::from_str(json).expect("second manifest must parse")
}

#[test]
fn packing_round_trip() {
    let strand = DnaStrand::synthesize("AGENT_PROMPT_42");
    let (count, packed) = packing::pack_strand(&strand);
    let restored = packing::unpack_strand(count, &packed).expect("unpack");
    assert_eq!(strand.as_slice(), restored.as_slice());
    assert!(packed.len() < strand.len());
}

#[test]
fn compile_encode_decode_validate() {
    let manifest = sample_manifest();
    let dna = compile::compile_manifest(&manifest).expect("compile");
    let bytes = codec::encode(&dna).expect("encode");
    assert_eq!(&bytes[0..4], b"GDNA");

    let decoded = validate::validate_bytes(&bytes).expect("validate");
    let phenotype = decoded.phenotype.expect("phenotype must be cached");
    assert_eq!(phenotype.role, "historian");
    assert!(phenotype.tools.contains(&"genos_inspect".to_string()));
    assert_eq!(phenotype.capabilities.len(), 2);
    assert!(phenotype.expressed >= 5);
}

#[test]
fn content_hash_is_stable() {
    let manifest = sample_manifest();
    let dna = compile::compile_manifest(&manifest).expect("compile");
    let first = codec::content_hash(&dna).expect("hash");
    let second = codec::content_hash(&dna).expect("hash");
    assert_eq!(first, second);
    assert_eq!(first.len(), 64);
}

#[test]
fn cross_produces_biparental_child() {
    let parent_a = compile::compile_manifest(&sample_manifest()).expect("compile a");
    let parent_b = compile::compile_manifest(&second_manifest()).expect("compile b");
    let options = CrossOptions { swap_prob: 0.5, point: None, seed: Some("crossover-test".to_string()), speciation_threshold: None };
    let child = operations::cross(&parent_a, &parent_b, &options).expect("cross");
    assert_eq!(child.provenance.parents.len(), 2);
    assert!(child.provenance.crossover.is_some());
    assert!(child.genes.contains_key("ROLE"));
    assert!(child.phenotype.is_some());
}

#[test]
fn mutate_records_and_changes_hash() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let options = MutateOptions { rate: 0.9, hyper: false, locus: Some("ROLE".to_string()), seed: Some("mutate-test".to_string()) };
    let mutated = operations::mutate(&dna, &options).expect("mutate");
    assert_eq!(mutated.provenance.mutations.len(), 1);
    assert_ne!(codec::content_hash(&dna).unwrap(), codec::content_hash(&mutated).unwrap());
}

#[test]
fn clone_keeps_lineage_and_new_identity() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let options = CloneOptions { mode: "mitosis".to_string(), daughter_volume: 0.25, mutation_rate: 0.0, seed: Some("clone-test".to_string()) };
    let child = operations::clone_dna(&dna, &options).expect("clone");
    assert_ne!(child.meta.genome_id, dna.meta.genome_id);
    assert_eq!(child.provenance.parents, vec![dna.meta.genome_id]);
}

#[test]
fn decoy_sets_flag_and_marker() {
    let dna = compile::compile_manifest(&sample_manifest()).expect("compile");
    let options = DecoyOptions { target_selector: "enemy".to_string(), detectability: 0.7, marker: Vec::new() };
    let decoy = operations::decoy(&dna, &options).expect("decoy");
    assert!(decoy.provenance.decoy.is_some());
    let bytes = codec::encode(&decoy).expect("encode");
    assert_ne!(bytes[6] & 0b1000_0000, 0, "DECOY flag must be set");
}
