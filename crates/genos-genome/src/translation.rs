use crate::dna::{RnaNucleotide, RnaStrand};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Codon(pub RnaNucleotide, pub RnaNucleotide, pub RnaNucleotide);

#[derive(Debug, PartialEq, Eq)]
pub enum AminoAcidToken {
    MethionineStart,
    Stop,
    Token(u8),
}

impl Codon {
    pub fn read_universal_dictionary(&self) -> AminoAcidToken {
        match (&self.0, &self.1, &self.2) {
            (RnaNucleotide::A, RnaNucleotide::U, RnaNucleotide::G) => {
                AminoAcidToken::MethionineStart
            }
            (RnaNucleotide::U, RnaNucleotide::A, RnaNucleotide::A)
            | (RnaNucleotide::U, RnaNucleotide::A, RnaNucleotide::G)
            | (RnaNucleotide::U, RnaNucleotide::G, RnaNucleotide::A) => AminoAcidToken::Stop,
            (RnaNucleotide::U, RnaNucleotide::U, RnaNucleotide::U)
            | (RnaNucleotide::U, RnaNucleotide::U, RnaNucleotide::C) => AminoAcidToken::Token(0),
            (RnaNucleotide::U, RnaNucleotide::U, RnaNucleotide::A)
            | (RnaNucleotide::U, RnaNucleotide::U, RnaNucleotide::G)
            | (RnaNucleotide::C, RnaNucleotide::U, _) => AminoAcidToken::Token(1),
            (RnaNucleotide::U, RnaNucleotide::C, _) => AminoAcidToken::Token(2),
            (RnaNucleotide::U, RnaNucleotide::A, RnaNucleotide::U)
            | (RnaNucleotide::U, RnaNucleotide::A, RnaNucleotide::C) => AminoAcidToken::Token(3),
            (RnaNucleotide::U, RnaNucleotide::G, RnaNucleotide::U)
            | (RnaNucleotide::U, RnaNucleotide::G, RnaNucleotide::C) => AminoAcidToken::Token(4),
            (RnaNucleotide::U, RnaNucleotide::G, RnaNucleotide::G) => AminoAcidToken::Token(5),
            (RnaNucleotide::C, RnaNucleotide::C, _) => AminoAcidToken::Token(6),
            (RnaNucleotide::C, RnaNucleotide::A, RnaNucleotide::U)
            | (RnaNucleotide::C, RnaNucleotide::A, RnaNucleotide::C) => AminoAcidToken::Token(7),
            (RnaNucleotide::C, RnaNucleotide::A, RnaNucleotide::A)
            | (RnaNucleotide::C, RnaNucleotide::A, RnaNucleotide::G) => AminoAcidToken::Token(8),
            (RnaNucleotide::C, RnaNucleotide::G, _) => AminoAcidToken::Token(9),
            (RnaNucleotide::A, RnaNucleotide::U, RnaNucleotide::U)
            | (RnaNucleotide::A, RnaNucleotide::U, RnaNucleotide::C)
            | (RnaNucleotide::A, RnaNucleotide::U, RnaNucleotide::A) => AminoAcidToken::Token(10),
            (RnaNucleotide::A, RnaNucleotide::C, _) => AminoAcidToken::Token(11),
            (RnaNucleotide::A, RnaNucleotide::A, RnaNucleotide::U)
            | (RnaNucleotide::A, RnaNucleotide::A, RnaNucleotide::C) => AminoAcidToken::Token(12),
            (RnaNucleotide::A, RnaNucleotide::A, RnaNucleotide::A)
            | (RnaNucleotide::A, RnaNucleotide::A, RnaNucleotide::G) => AminoAcidToken::Token(13),
            (RnaNucleotide::A, RnaNucleotide::G, RnaNucleotide::U)
            | (RnaNucleotide::A, RnaNucleotide::G, RnaNucleotide::C) => AminoAcidToken::Token(14),
            (RnaNucleotide::A, RnaNucleotide::G, RnaNucleotide::A)
            | (RnaNucleotide::A, RnaNucleotide::G, RnaNucleotide::G) => AminoAcidToken::Token(15),
            (RnaNucleotide::G, RnaNucleotide::U, _) => AminoAcidToken::Token(16),
            (RnaNucleotide::G, RnaNucleotide::C, _) => AminoAcidToken::Token(17),
            (RnaNucleotide::G, RnaNucleotide::A, RnaNucleotide::U)
            | (RnaNucleotide::G, RnaNucleotide::A, RnaNucleotide::C) => AminoAcidToken::Token(18),
            (RnaNucleotide::G, RnaNucleotide::A, RnaNucleotide::A)
            | (RnaNucleotide::G, RnaNucleotide::A, RnaNucleotide::G) => AminoAcidToken::Token(19),
            (RnaNucleotide::G, RnaNucleotide::G, _) => AminoAcidToken::Token(5),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnfoldedProtein {
    pub amino_acids: Vec<u8>,
}

impl UnfoldedProtein {
    pub fn fold(&self) -> Result<String, String> {
        let mut text = String::new();
        for chunk in self.amino_acids.chunks(4) {
            let mut byte: u8 = 0;
            for (i, &val) in chunk.iter().enumerate() {
                byte |= (val & 0b11) << ((3 - i) * 2);
            }
            if byte.is_ascii_graphic() || byte == b' ' {
                text.push(byte as char);
            }
        }
        if text.is_empty() {
            Ok("FUNCTIONAL_PEPTIDE_DEFAULT".to_string())
        } else {
            Ok(text)
        }
    }
}

pub struct Ribosome;

impl Ribosome {
    pub fn quality_control_nmd(mrna: &RnaStrand, nmd_inhibitor_active: bool) -> Result<(), String> {
        let mut first_stop = None;
        for (i, chunk) in mrna.sequence.chunks(3).enumerate() {
            if chunk.len() == 3 {
                let codon = Codon(chunk[0].clone(), chunk[1].clone(), chunk[2].clone());
                if codon.read_universal_dictionary() == AminoAcidToken::Stop {
                    first_stop = Some(i * 3);
                    break;
                }
            }
        }

        if let Some(stop_idx) = first_stop {
            let has_downstream = mrna.ejc_positions.iter().any(|&pos| pos > stop_idx + 3);
            if has_downstream {
                if nmd_inhibitor_active {
                    return Ok(());
                }
                return Err("NMD_DECAY: Premature Stop codon detected".to_string());
            }
        }
        Ok(())
    }

    pub fn translate(rna: &RnaStrand) -> UnfoldedProtein {
        let mut amino_acids = Vec::new();
        let mut started = false;
        for chunk in rna.sequence.chunks(3) {
            if chunk.len() == 3 {
                let codon = Codon(chunk[0].clone(), chunk[1].clone(), chunk[2].clone());
                match codon.read_universal_dictionary() {
                    AminoAcidToken::MethionineStart => {
                        started = true;
                        amino_acids.push(10);
                    }
                    AminoAcidToken::Token(val) if started => amino_acids.push(val),
                    AminoAcidToken::Stop if started => break,
                    _ => {}
                }
            }
        }
        UnfoldedProtein { amino_acids }
    }
}
