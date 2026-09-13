use genos_genome::DnaStrand;

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
