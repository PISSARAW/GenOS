use crate::operations::{self, CloneOptions, CrossOptions, MutateOptions, SealOptions, SpeciateOptions};

#[test]
fn compiled_genome_is_draft_by_default() {
    use crate::compile;
    let dna = compile::compile_manifest(&crate::tests::sample_manifest()).expect("compile");
    assert_eq!(dna.meta.status, crate::model::DnaStatus::Draft);
}

#[test]
fn seal_flips_status_to_sealed_without_key() {
    use crate::compile;
    let dna = compile::compile_manifest(&crate::tests::sample_manifest()).expect("compile");
    assert_eq!(dna.meta.status, crate::model::DnaStatus::Draft);
    let sealed = operations::seal(&dna, &SealOptions::default()).expect("seal");
    assert_eq!(sealed.meta.status, crate::model::DnaStatus::Sealed);
    assert_eq!(sealed.meta.genome_id, dna.meta.genome_id);
    assert_eq!(sealed.meta.name, dna.meta.name);
}

#[test]
fn seal_with_key_signs_and_seals() {
    use crate::compile;
    let dna = compile::compile_manifest(&crate::tests::sample_manifest()).expect("compile");
    let sealed = operations::seal(&dna, &SealOptions { secret_key: Some(vec![7u8; 32]) }).expect("seal with key");
    assert_eq!(sealed.meta.status, crate::model::DnaStatus::Sealed);
    assert!(sealed.provenance.signer.is_some());
    let mut to_sign = sealed.clone();
    let signed_bytes = crate::codec::encode_signed(&mut to_sign, &vec![7u8; 32]).expect("encode signed");
    assert!(crate::codec::verify_signature(&signed_bytes).expect("verify sealed").is_some());
}

#[test]
fn seal_rejects_already_sealed() {
    use crate::compile;
    let dna = compile::compile_manifest(&crate::tests::sample_manifest()).expect("compile");
    let sealed = operations::seal(&dna, &SealOptions::default()).expect("first seal");
    assert!(operations::seal(&sealed, &SealOptions::default()).is_err());
}

#[test]
fn derived_genomes_are_always_draft() {
    use crate::compile;
    let dna = compile::compile_manifest(&crate::tests::sample_manifest()).expect("compile");
    let sealed = operations::seal(&dna, &SealOptions::default()).expect("seal parent");

    let options = CrossOptions { swap_prob: 0.5, point: None, seed: Some("x".to_string()), speciation_threshold: None };
    let child = operations::cross(&sealed, &dna, &options).expect("cross sealed");
    assert_eq!(child.meta.status, crate::model::DnaStatus::Draft);

    let mutated = operations::mutate(&sealed, &MutateOptions { rate: 0.5, hyper: false, locus: None, seed: Some("m".to_string()) }).expect("mutate sealed");
    assert_eq!(mutated.meta.status, crate::model::DnaStatus::Draft);

    let cloned = operations::clone_dna(&sealed, &CloneOptions { mode: "mitosis".to_string(), daughter_volume: 0.25, mutation_rate: 0.0, seed: Some("c".to_string()) }).expect("clone sealed");
    assert_eq!(cloned.meta.status, crate::model::DnaStatus::Draft);

    let grafted = operations::graft(&sealed, &operations::GraftSpec { locus: "NEW_GENE".to_string(), instruction: "new".to_string(), plasmid: false }).expect("graft sealed");
    assert_eq!(grafted.meta.status, crate::model::DnaStatus::Draft);

    let speciated = operations::speciate(&sealed, &SpeciateOptions { name: "Speciated".to_string(), concept: Some("c".to_string()), grafts: vec![operations::GraftSpec { locus: "NEW_CONCEPT".to_string(), instruction: "concept".to_string(), plasmid: false }] }).expect("speciate sealed");
    assert_eq!(speciated.meta.status, crate::model::DnaStatus::Draft);
}
