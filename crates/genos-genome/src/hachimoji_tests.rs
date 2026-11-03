use crate::{DnaNucleotide, DnaStrand, RnaNucleotide, RnaPolymerase};
use rand::SeedableRng;

#[test]
fn utf8_synthesis_uses_eight_letters_and_explicit_width() {
    for text in ["", "a", "ab", "abc", "worker", "daemon résident 🧬", "\0\u{7f}"] {
        let strand = DnaStrand::synthesize(text);
        assert_eq!(strand.bits_per_base(), 3);
        assert_eq!(strand.len(), (text.len() * 8).div_ceil(3));
        assert_eq!(strand.decode_instruction(), text);
        let serialized = serde_json::to_string(&strand).unwrap();
        assert_eq!(serde_json::from_str::<DnaStrand>(&serialized).unwrap(), strand);
    }
    assert!(DnaStrand::synthesize("worker").as_slice().iter().any(|base| base.code() >= 4));
}

#[test]
fn legacy_json_keeps_its_instruction_and_serialization() {
    let original = r#"{"sequence":["C","A","A","C"]}"#;
    let strand: DnaStrand = serde_json::from_str(original).unwrap();
    assert_eq!(strand.decode_instruction(), "A");
    assert_eq!(strand.bits_per_base(), 2);
    assert_eq!(serde_json::to_string(&strand).unwrap(), original);
    assert!(serde_json::from_str::<DnaStrand>(r#"{"sequence":["P"],"bits_per_base":2}"#).is_err());
    assert!(serde_json::from_str::<DnaStrand>(r#"{"sequence":[],"bits_per_base":0}"#).is_err());
}

#[test]
fn eight_letter_complement_and_rna_transcription() {
    let strand = DnaStrand::new(DnaNucleotide::ALL.to_vec());
    assert_eq!(strand.as_str(), "ACGTPZBS");
    let complement: String = strand.as_slice().iter().map(|n| n.complement().as_char()).collect();
    assert_eq!(complement, "TGCAZPSB");
    let rna = RnaPolymerase::transcribe(&strand);
    use RnaNucleotide::*;
    assert_eq!(rna.sequence, vec![U, G, C, A, Z, P, S, B]);
    for base in DnaNucleotide::ALL { assert_eq!(base.complement().complement(), base); }
}

#[test]
fn mutation_and_character_parser_cover_all_eight_bases() {
    let mut rng = rand::rngs::StdRng::seed_from_u64(8);
    let mut seen = [false; 8];
    for base in DnaNucleotide::ALL {
        assert_eq!(DnaNucleotide::try_nucleotide_from_char(base.as_char()), Some(base));
        for _ in 0..100 {
            let changed = base.mutate(&mut rng);
            assert_ne!(changed, base);
            seen[changed.code() as usize] = true;
        }
    }
    assert!(seen.into_iter().all(|value| value));
    assert_eq!(DnaNucleotide::try_nucleotide_from_char('X'), None);
}

#[test]
fn synthetic_codons_are_not_interpreted_as_natural_amino_acids() {
    use crate::{AminoAcidToken, Codon};
    assert_eq!(Codon(RnaNucleotide::C, RnaNucleotide::U, RnaNucleotide::P)
        .read_universal_dictionary(), AminoAcidToken::Unsupported);
}

#[test]
fn recombination_keeps_width_when_all_bases_are_natural() {
    let legacy = DnaStrand::new(vec![DnaNucleotide::A; 24]);
    let hachimoji = DnaStrand::with_width(vec![DnaNucleotide::A; 24], 3).unwrap();
    let mut rng = rand::rngs::StdRng::seed_from_u64(3);
    let (first, second) = crate::strand_crossover(&legacy, &hachimoji, &mut rng);
    assert_eq!(first.bits_per_base(), 3);
    assert_eq!(second.bits_per_base(), 3);
    assert_eq!(first.decode_instruction().len(), 9);
    assert_eq!(legacy.decode_instruction().len(), 6);
}
