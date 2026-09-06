pub mod dna;
pub mod gene;
pub mod genome;
pub mod translation;

pub use dna::{DnaNucleotide, DnaStrand, Mutagen, RnaNucleotide, RnaPolymerase, RnaStrand};
pub use gene::{ChromatinState, ExpressionContext, Gene, Plasmid, Spliceosome};
pub use genome::{DEFAULT_HAYFLICK_LIMIT, Genome};
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

    #[test]
    fn test_pioneer_transcription_factor_unlocks_facultative_heterochromatin() {
        let mut gene = Gene::new("SOMATIC_GENE", "AGENT_INSTRUCTION");
        gene.chromatin_state = ChromatinState::HeterochromatinFacultative;
        gene.developmentally_locked = true;

        let empty_tfs = Vec::new();
        let empty_rnas = Vec::new();
        let res_locked = gene.express(ExpressionContext {
            active_tfs: &empty_tfs,
            alternative_splicing: None,
            micro_rnas: &empty_rnas,
        });
        assert_eq!(res_locked, Err("OFF: Heterochromatin locked".to_string()));

        // Generic pioneer factor
        let pioneer_generic = vec!["PIONEER_FACTOR".to_string()];
        let res_generic = gene.express(ExpressionContext {
            active_tfs: &pioneer_generic,
            alternative_splicing: None,
            micro_rnas: &empty_rnas,
        });
        assert!(res_generic.is_ok(), "Generic pioneer factor must unlock facultative heterochromatin");

        // Locus-specific pioneer factor
        let pioneer_locus = vec!["PIONEER_SOMATIC_GENE".to_string()];
        let res_locus = gene.express(ExpressionContext {
            active_tfs: &pioneer_locus,
            alternative_splicing: None,
            micro_rnas: &empty_rnas,
        });
        assert!(res_locus.is_ok(), "Locus pioneer factor must unlock facultative heterochromatin");
    }

    #[test]
    fn test_constitutive_heterochromatin_resists_pioneer_factors() {
        let mut gene = Gene::new("CENTROMERE", "SATELLITE_DNA");
        gene.chromatin_state = ChromatinState::HeterochromatinConstitutive;
        gene.developmentally_locked = true;

        let pioneer_generic = vec!["PIONEER_FACTOR".to_string(), "PIONEER_CENTROMERE".to_string()];
        let empty_rnas = Vec::new();
        let res = gene.express(ExpressionContext {
            active_tfs: &pioneer_generic,
            alternative_splicing: None,
            micro_rnas: &empty_rnas,
        });
        assert_eq!(res, Err("OFF: Heterochromatin locked".to_string()), "Constitutive heterochromatin cannot be opened by pioneer factors");
    }
}
