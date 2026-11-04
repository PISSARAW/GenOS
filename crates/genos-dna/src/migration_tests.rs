use genos_genome::{DnaNucleotide, DnaStrand};
use crate::{codec, express, migration, validate, DnaStatus, UnknownSection};

const LEGACY: &[u8] = include_bytes!("../../../backend/tests/fixtures/agent-dna-v1/local_code_worker.dna");

#[test]
fn migration_preserves_instructions_regulation_and_lineage_without_promoting() {
    let mut source = validate::validate_bytes(LEGACY).unwrap();
    source.genes.get_mut("ROLE").unwrap().is_methylated = true;
    source.extra_chromosomes.push(DnaStrand::synthesize_legacy("mémoire 🧬"));
    source.unknown_sections.push(UnknownSection { tag: *b"TEST", payload: vec![4, 8, 15] });
    let before_hash = codec::content_hash(&source).unwrap();
    let migrated = migration::to_hachimoji(&source).unwrap();
    assert!(!migration::requires_hachimoji(&migrated));
    assert_eq!(migrated.meta.status, DnaStatus::Draft);
    assert_ne!(migrated.meta.genome_id, source.meta.genome_id);
    assert_eq!(migrated.meta.lineage_id, source.meta.lineage_id);
    assert_eq!(migrated.meta.parent_ids, vec![source.meta.genome_id]);
    assert_eq!(migrated.meta.generation, source.meta.generation + 1);
    assert_eq!(migrated.provenance.mutations.last().unwrap().from, before_hash);
    assert!(migrated.provenance.selection.is_none());
    assert_eq!(express::express(&migrated), express::express(&source));
    for (locus, gene) in &source.genes {
        let mut expected = gene.clone();
        expected.dna = DnaStrand::synthesize(&gene.dna.decode_instruction());
        assert_eq!(migrated.genes[locus], expected);
    }
    let bytes = codec::encode(&migrated).unwrap();
    let reread = validate::validate_bytes(&bytes).unwrap();
    assert_eq!(reread.unknown_sections[0].payload, vec![4, 8, 15]);
    assert_eq!(reread.extra_chromosomes[0].decode_instruction(), "mémoire 🧬");
    assert_eq!(codec::content_hash(&source).unwrap(), before_hash);
    assert_eq!(codec::content_hash(&migration::to_hachimoji(&reread).unwrap()).unwrap(),
        codec::content_hash(&reread).unwrap());
}

#[test]
fn migration_refuses_signed_sealed_and_ambiguous_sources() {
    let source = validate::validate_bytes(LEGACY).unwrap();
    let mut sealed = source.clone();
    sealed.meta.status = DnaStatus::Sealed;
    assert!(migration::to_hachimoji(&sealed).unwrap_err().contains("re-signing"));
    let mut signed = source.clone();
    let bytes = codec::encode_signed(&mut signed, &[7; 32]).unwrap();
    let signed = validate::validate_bytes(&bytes).unwrap();
    assert!(migration::to_hachimoji(&signed).unwrap_err().contains("re-signing"));
    let mut partial = source.clone();
    partial.maternal = DnaStrand::new(vec![DnaNucleotide::A]);
    assert!(migration::to_hachimoji(&partial).unwrap_err().contains("lossless"));
    let mut invalid_utf8 = source.clone();
    invalid_utf8.maternal = DnaStrand::new(vec![DnaNucleotide::T; 4]);
    assert!(migration::to_hachimoji(&invalid_utf8).unwrap_err().contains("lossless"));
    let mut spliced = source;
    spliced.genes.get_mut("ROLE").unwrap().default_exons = vec![(0, 3)];
    assert!(migration::to_hachimoji(&spliced).unwrap_err().contains("remapping"));
}
