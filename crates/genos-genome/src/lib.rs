pub mod dna;
pub mod gene;
pub mod genome;
pub mod translation;

pub use dna::{DnaNucleotide, DnaStrand, Mutagen, RnaNucleotide, RnaPolymerase, RnaStrand};
pub use gene::{ChromatinState, ExpressionContext, Gene, Plasmid, Spliceosome};
pub use genome::Genome;
pub use translation::{AminoAcidToken, Codon, Ribosome, UnfoldedProtein};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dna_synthesis_and_transcription() {
        let dna = DnaStrand::new(vec![DnaNucleotide::A, DnaNucleotide::C, DnaNucleotide::G, DnaNucleotide::T]);
        let rna = RnaPolymerase::transcribe(&dna);
        assert_eq!(rna.sequence, vec![RnaNucleotide::U, RnaNucleotide::G, RnaNucleotide::C, RnaNucleotide::A]);
    }

    #[test]
    fn test_gene_expression() {
        let gene = Gene::new("TEST_LOCUS", "AGENT_PROMPT");
        let tfs = Vec::new();
        let rnas = Vec::new();
        let res = gene.express(ExpressionContext {
            active_tfs: &tfs,
            alternative_splicing: None,
            micro_rnas: &rnas,
        });
        assert!(res.is_ok());
    }

    #[test]
    fn test_ribosome_uses_start_and_stop_codons() {
        let rna = RnaStrand {
            sequence: vec![
                RnaNucleotide::G, RnaNucleotide::G, RnaNucleotide::G,
                RnaNucleotide::A, RnaNucleotide::U, RnaNucleotide::G,
                RnaNucleotide::G, RnaNucleotide::C, RnaNucleotide::U,
                RnaNucleotide::U, RnaNucleotide::A, RnaNucleotide::A,
            ],
            ejc_positions: Vec::new(),
        };
        assert_eq!(Ribosome::translate(&rna).amino_acids, vec![10, 17]);
    }
}
