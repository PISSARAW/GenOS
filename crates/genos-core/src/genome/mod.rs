pub mod methods;
pub mod transcription;
#[cfg(test)]
mod tests;

pub use methods::*;
pub use transcription::*;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::collections::BTreeMap;
use uuid::Uuid;

/* =====================================================================
1. LA MOLÃƒâ€°CULE (NuclÃƒÂ©otides ADN & ARN)
===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DnaNucleotide {
    A,
    T,
    C,
    G,
} // ADN
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum RnaNucleotide {
    A,
    U,
    C,
    G,
} // ARN (Uracile remplace Thymine)

impl DnaNucleotide {
    fn to_bits(&self) -> u8 {
        match self {
            DnaNucleotide::A => 0b00,
            DnaNucleotide::C => 0b01,
            DnaNucleotide::G => 0b10,
            DnaNucleotide::T => 0b11,
        }
    }
    fn from_bits(bits: u8) -> Self {
        match bits & 0b11 {
            0b00 => DnaNucleotide::A,
            0b01 => DnaNucleotide::C,
            0b10 => DnaNucleotide::G,
            0b11 => DnaNucleotide::T,
            _ => unreachable!(),
        }
    }
}

/* =====================================================================
2. L'ADN & LA TRANSCRIPTION (Noyau)
===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DnaStrand {
    pub sequence: Vec<DnaNucleotide>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RnaStrand {
    pub sequence: Vec<RnaNucleotide>,
}

/// L'Enzyme qui lit l'ADN pour crÃƒÂ©er l'ARN Messager
pub struct RnaPolymerase;
impl RnaPolymerase {
    pub fn transcribe(dna: &DnaStrand) -> RnaStrand {
        let rna_seq = dna
            .sequence
            .iter()
            .map(|n| match n {
                DnaNucleotide::A => RnaNucleotide::A,
                DnaNucleotide::T => RnaNucleotide::U, // Remplacement magique !
                DnaNucleotide::C => RnaNucleotide::C,
                DnaNucleotide::G => RnaNucleotide::G,
            })
            .collect();
        RnaStrand { sequence: rna_seq }
    }
}

/* =====================================================================
3. LA TRADUCTION & LES CODONS (Ribosome)
===================================================================== */
/// Un codon est un bloc de 3 nuclÃƒÂ©otides (3 * 2 bits = 6 bits)
/// Magie mathÃƒÂ©matique : 6 bits = Exactement 1 caractÃƒÂ¨re Base64 !
pub struct Codon(pub RnaNucleotide, pub RnaNucleotide, pub RnaNucleotide);

/// Une chaÃƒÂ®ne d'acides aminÃƒÂ©s brute (avant repliement)
pub struct UnfoldedProtein {
    pub amino_acids: Vec<u8>, // Les blocs de 6 bits purs
}

pub struct Ribosome;
impl Ribosome {
    pub fn translate(rna: &RnaStrand) -> UnfoldedProtein {
        let mut amino_acids = Vec::new();
        // Le ribosome lit par blocs de 3 (Codons)
        for chunk in rna.sequence.chunks(3) {
            if chunk.len() == 3 {
                let codon = Codon(chunk[0].clone(), chunk[1].clone(), chunk[2].clone());

                // Convertit le codon ARN (A,U,C,G) en sa valeur binaire de 6 bits
                let n1 = match codon.0 {
                    RnaNucleotide::A => 0b00,
                    RnaNucleotide::C => 0b01,
                    RnaNucleotide::G => 0b10,
                    RnaNucleotide::U => 0b11,
                };
                let n2 = match codon.1 {
                    RnaNucleotide::A => 0b00,
                    RnaNucleotide::C => 0b01,
                    RnaNucleotide::G => 0b10,
                    RnaNucleotide::U => 0b11,
                };
                let n3 = match codon.2 {
                    RnaNucleotide::A => 0b00,
                    RnaNucleotide::C => 0b01,
                    RnaNucleotide::G => 0b10,
                    RnaNucleotide::U => 0b11,
                };

                let amino_acid_value = (n1 << 4) | (n2 << 2) | n3;
                amino_acids.push(amino_acid_value);
            }
        }
        UnfoldedProtein { amino_acids }
    }
}

/* =====================================================================
4. LE REPLIEMENT FINAL (ProtÃƒÂ©ine Fonctionnelle & Mutations)
===================================================================== */
impl UnfoldedProtein {
    /// Le repliement (Folding).
    /// En cas de mutation grave (Frameshift ou Non-sens), le repliement ÃƒÂ©choue
    /// et la protÃƒÂ©ine est dÃƒÂ©truite par la cellule.
    pub fn fold(&self) -> Result<String, String> {
        const BASE64_ALPHABET: &[u8] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        let base64_string: String = self
            .amino_acids
            .iter()
            .map(|&idx| BASE64_ALPHABET[idx as usize] as char)
            .collect();

        match BASE64.decode(&base64_string) {
            Ok(decoded_bytes) => {
                match String::from_utf8(decoded_bytes) {
                    Ok(protein) => Ok(protein), // SuccÃƒÂ¨s (Peut inclure une mutation Silencieuse ou Faux-sens)
                    Err(_) => Err("NonsenseMutation: Structure 3D impossible ÃƒÂ  replier (Codon Stop prÃƒÂ©maturÃƒÂ© ou corruption)".to_string()),
                }
            }
            Err(_) => Err(
                "FrameshiftCatastrophe: DÃƒÂ©calage du cadre de lecture, assemblage chaotique"
                    .to_string(),
            ),
        }
    }
}

/* =====================================================================
LES AGENTS MUTAGÃƒË†NES ET LA RÃƒâ€°PARATION (Stress, UV, Rayons X, Virus, p53)
===================================================================== */

/// ReprÃƒÂ©sente les diffÃƒÂ©rentes agressions subies par l'ADN
pub enum Mutagen {
    /// 1. Causes Internes : Erreur de rÃƒÂ©plication (Faute de frappe)
    ReplicationError(usize, DnaNucleotide),

    /// 1. Causes Internes : Stress Oxydatif dÃƒÂ» ÃƒÂ  la fatigue (Radicaux libres)
    OxidativeStress(usize, DnaNucleotide),

    /// 2. Causes Externes : Rayons UV (Fusionne deux Thymines adjacentes)
    Ultraviolet,

    /// 2. Causes Externes : Rayons X / RadioactivitÃƒÂ© (Cassure double brin)
    IonizingRadiation(usize),

    /// 2. Causes Externes : Produits Chimiques (Insertion de force entre les barreaux)
    Chemical(usize, DnaNucleotide),

    /// 2. Causes Externes : Virus (Insertion de matÃƒÂ©riel gÃƒÂ©nÃƒÂ©tique ÃƒÂ©tranger)
    Virus(usize, DnaStrand),
}



/* =====================================================================
5. LE DICTIONNAIRE UNIVERSEL (Codons -> Tokens IA)
===================================================================== */
#[derive(Debug, PartialEq, Eq)]
pub enum AminoAcidToken {
    MethionineStart, // AUG : <|im_start|> (BOS)
    Stop,            // UAA, UAG, UGA : <|im_end|> (EOS)
    Token(u8),       // Autres Acides Aminés : Jetons normaux
}

impl Codon {
    /// Traduit un mot de 3 lettres en "Token" IA (Acide Aminé)
    pub fn read_universal_dictionary(&self) -> AminoAcidToken {
        match (self.0.clone(), self.1.clone(), self.2.clone()) {
            // START CODON (AUG) -> Début d'une séquence (Méthionine / BOS Token)
            (RnaNucleotide::A, RnaNucleotide::U, RnaNucleotide::G) => AminoAcidToken::MethionineStart,
            
            // STOP CODONS (UAA, UAG, UGA) -> Fin d'instruction (EOS Token)
            (RnaNucleotide::U, RnaNucleotide::A, RnaNucleotide::A) |
            (RnaNucleotide::U, RnaNucleotide::A, RnaNucleotide::G) |
            (RnaNucleotide::U, RnaNucleotide::G, RnaNucleotide::A) => AminoAcidToken::Stop,

            // AUTRES (Redondance : 64 combinaisons pour 20 tokens)
            (n1, n2, n3) => {
                let bits_1 = match n1 { RnaNucleotide::A => 0, RnaNucleotide::C => 1, RnaNucleotide::G => 2, RnaNucleotide::U => 3 };
                let bits_2 = match n2 { RnaNucleotide::A => 0, RnaNucleotide::C => 1, RnaNucleotide::G => 2, RnaNucleotide::U => 3 };
                let bits_3 = match n3 { RnaNucleotide::A => 0, RnaNucleotide::C => 1, RnaNucleotide::G => 2, RnaNucleotide::U => 3 };
                // On réduit les 64 possibilités en 20 "Acides Aminés" via modulo
                let amino_acid_id = ((bits_1 << 4) | (bits_2 << 2) | bits_3) % 20;
                AminoAcidToken::Token(amino_acid_id)
            }
        }
    }
}
