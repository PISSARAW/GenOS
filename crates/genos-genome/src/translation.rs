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
            (n1, n2, n3) => {
                let b1 = match n1 {
                    RnaNucleotide::A => 0,
                    RnaNucleotide::C => 1,
                    RnaNucleotide::G => 2,
                    RnaNucleotide::U => 3,
                };
                let b2 = match n2 {
                    RnaNucleotide::A => 0,
                    RnaNucleotide::C => 1,
                    RnaNucleotide::G => 2,
                    RnaNucleotide::U => 3,
                };
                let b3 = match n3 {
                    RnaNucleotide::A => 0,
                    RnaNucleotide::C => 1,
                    RnaNucleotide::G => 2,
                    RnaNucleotide::U => 3,
                };
                AminoAcidToken::Token(((b1 << 4) | (b2 << 2) | b3) % 20)
            }
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
        for chunk in rna.sequence.chunks(3) {
            if chunk.len() == 3 {
                let codon = Codon(chunk[0].clone(), chunk[1].clone(), chunk[2].clone());
                match codon.read_universal_dictionary() {
                    AminoAcidToken::Token(val) => amino_acids.push(val),
                    AminoAcidToken::MethionineStart => amino_acids.push(0),
                    AminoAcidToken::Stop => break,
                }
            }
        }
        UnfoldedProtein { amino_acids }
    }
}
