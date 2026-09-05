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
        let dna = DnaStrand::synthesize("HELLO GENOS");
        assert!(!dna.sequence.is_empty());
        let rna = RnaPolymerase::transcribe(&dna);
        assert_eq!(rna.sequence.len(), dna.sequence.len());
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
}
