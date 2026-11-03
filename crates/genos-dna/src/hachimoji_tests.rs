use genos_genome::{DnaNucleotide, DnaStrand};
use crate::{codec, compile, packing, validate};

#[test]
fn three_bit_packing_handles_cross_byte_boundaries_and_padding() {
    for length in 0..65 {
        let sequence = (0..length).map(|i| DnaNucleotide::ALL[i % 8]).collect();
        let strand = DnaStrand::with_width(sequence, 3).unwrap();
        let (count, bytes) = packing::pack_strand(&strand);
        assert_eq!(count & 0x7fffffff, length as u32);
        assert_eq!(bytes.len(), (length * 3).div_ceil(8));
        assert_eq!(packing::unpack_strand(count, &bytes).unwrap(), strand);
    }
    let strand = DnaStrand::new(DnaNucleotide::ALL.to_vec());
    assert_eq!(packing::pack_strand(&strand), (0x80000008, vec![0x05, 0x39, 0x77]));
    assert!(packing::unpack_strand(0x80000003, &[0]).is_err());
    assert!(packing::unpack_strand(0x80000001, &[1]).is_err());
}

#[test]
fn legacy_file_keeps_its_canonical_hash_and_signature_contract() {
    let bytes = include_bytes!("../../../agents/dna/fondations/preuve_evidence.dna");
    let mut dna = validate::validate_bytes(bytes).unwrap();
    assert_eq!(codec::format_version(&dna), 1);
    assert_eq!(dna.genes["ROLE"].dna.decode_instruction(), "historian");
    let original_hash = codec::content_hash(&dna).unwrap();
    assert_eq!(original_hash, "0367a702f237320510f89f3fda0d55821d6b02b89ff3ff71958d47248226f27b");
    let encoded = codec::encode(&dna).unwrap();
    assert_eq!(codec::content_hash(&codec::decode(&encoded).unwrap()).unwrap(), original_hash);
    assert_eq!(u16::from_le_bytes([encoded[4], encoded[5]]), 1);
    let signed = codec::encode_signed(&mut dna, &[7; 32]).unwrap();
    assert!(codec::verify_signature(&signed).unwrap().is_some());
    assert_eq!(validate::validate_bytes(&signed).unwrap().genes["ROLE"].dna.bits_per_base(), 2);
    let mut changed = codec::decode(bytes).unwrap();
    changed.meta.name.push_str("_changed");
    assert_ne!(codec::content_hash(&changed).unwrap(), original_hash);
    let changed_bytes = codec::encode(&changed).unwrap();
    assert_eq!(codec::decode(&changed_bytes).unwrap().meta.name, changed.meta.name);
}

#[test]
fn new_and_mixed_genomes_roundtrip_without_reinterpreting_legacy_genes() {
    let mut dna = compile::compile_manifest(&crate::tests::sample_manifest()).unwrap();
    dna.genes.get_mut("ROLE").unwrap().dna = DnaStrand::synthesize_legacy("historian");
    dna.extra_chromosomes.push(DnaStrand::synthesize("extra 🧬"));
    let encoded = codec::encode_signed(&mut dna, &[8; 32]).unwrap();
    assert_eq!(u16::from_le_bytes([encoded[4], encoded[5]]), 2);
    let decoded = validate::validate_bytes(&encoded).unwrap();
    assert_eq!(decoded.genes["ROLE"].dna.bits_per_base(), 2);
    assert_eq!(decoded.extra_chromosomes[0].decode_instruction(), "extra 🧬");
    assert_eq!(decoded.genes, dna.genes);
    assert_eq!(codec::content_hash(&decoded).unwrap(), codec::content_hash(&dna).unwrap());
    assert_eq!(crate::express::express(&decoded).role, "historian");
}

#[test]
fn version_downgrade_cannot_reinterpret_hachimoji_as_v1() {
    let dna = compile::compile_manifest(&crate::tests::sample_manifest()).unwrap();
    let mut bytes = codec::encode(&dna).unwrap();
    bytes[4..6].copy_from_slice(&1u16.to_le_bytes());
    let crc = crate::header::crc32(&bytes[..20]);
    bytes[20..24].copy_from_slice(&crc.to_le_bytes());
    assert!(codec::decode(&bytes).unwrap_err().contains("require AgentDNA v2"));
}

#[test]
fn worker_daemon_and_orchestrator_manifests_compile_to_hachimoji() {
    let manifests = [
        include_str!("../../../agents/fondations/preuve_evidence.agent.json"),
        include_str!("../../../agents/daemons/resident_daemon.agent.json"),
        include_str!("../../../agents/orchestration/mission_decomposer.agent.json"),
    ];
    for json in manifests {
        let manifest = serde_json::from_str(json).unwrap();
        let dna = compile::compile_manifest(&manifest).unwrap();
        let decoded = validate::validate_bytes(&codec::encode(&dna).unwrap()).unwrap();
        assert_eq!(codec::format_version(&decoded), 2);
        assert_eq!(decoded.maternal.bits_per_base(), 3);
        assert!(decoded.genes.values().all(|g| g.dna.bits_per_base() == 3));
        assert_eq!(crate::express::express(&decoded).role, manifest.identity.role);
    }
}
