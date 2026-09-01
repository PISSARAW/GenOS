use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::collections::BTreeMap;
use uuid::Uuid;

/* =====================================================================
   1. LA MOLÉCULE (Nucléotides ADN & ARN)
   ===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DnaNucleotide { A, T, C, G } // ADN
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum RnaNucleotide { A, U, C, G } // ARN (Uracile remplace Thymine)

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

/// L'Enzyme qui lit l'ADN pour créer l'ARN Messager
pub struct RnaPolymerase;
impl RnaPolymerase {
    pub fn transcribe(dna: &DnaStrand) -> RnaStrand {
        let rna_seq = dna.sequence.iter().map(|n| match n {
            DnaNucleotide::A => RnaNucleotide::A,
            DnaNucleotide::T => RnaNucleotide::U, // Remplacement magique !
            DnaNucleotide::C => RnaNucleotide::C,
            DnaNucleotide::G => RnaNucleotide::G,
        }).collect();
        RnaStrand { sequence: rna_seq }
    }
}

/* =====================================================================
   3. LA TRADUCTION & LES CODONS (Ribosome)
   ===================================================================== */
/// Un codon est un bloc de 3 nucléotides (3 * 2 bits = 6 bits)
/// Magie mathématique : 6 bits = Exactement 1 caractère Base64 !
pub struct Codon(pub RnaNucleotide, pub RnaNucleotide, pub RnaNucleotide);

/// Une chaîne d'acides aminés brute (avant repliement)
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
                let n1 = match codon.0 { RnaNucleotide::A => 0b00, RnaNucleotide::C => 0b01, RnaNucleotide::G => 0b10, RnaNucleotide::U => 0b11 };
                let n2 = match codon.1 { RnaNucleotide::A => 0b00, RnaNucleotide::C => 0b01, RnaNucleotide::G => 0b10, RnaNucleotide::U => 0b11 };
                let n3 = match codon.2 { RnaNucleotide::A => 0b00, RnaNucleotide::C => 0b01, RnaNucleotide::G => 0b10, RnaNucleotide::U => 0b11 };
                
                let amino_acid_value = (n1 << 4) | (n2 << 2) | n3;
                amino_acids.push(amino_acid_value);
            }
        }
        UnfoldedProtein { amino_acids }
    }
}

/* =====================================================================
   4. LE REPLIEMENT FINAL (Protéine Fonctionnelle)
   ===================================================================== */
impl UnfoldedProtein {
    /// Le repliement (Folding) convertit la chaîne 1D d'acides aminés 
    /// en une structure 3D fonctionnelle (Le texte utilisable par le système).
    pub fn fold(&self) -> String {
        // Nos acides aminés virtuels sont des indices Base64
        const BASE64_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        
        let base64_string: String = self.amino_acids.iter()
            .map(|&idx| BASE64_ALPHABET[idx as usize] as char)
            .collect();
            
        let decoded_bytes = BASE64.decode(&base64_string).unwrap_or_default();
        String::from_utf8(decoded_bytes).unwrap_or_else(|_| "ProteinFoldingError".to_string())
    }
}

// Fonction utilitaire inverse (Synthèse d'ADN à partir d'un texte)
impl DnaStrand {
    pub fn synthesize(text: &str) -> Self {
        let base64_str = BASE64.encode(text);
        let mut sequence = Vec::new();
        const BASE64_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        
        for c in base64_str.chars() {
            if let Some(idx) = BASE64_ALPHABET.iter().position(|&x| x == c as u8) {
                let n1 = DnaNucleotide::from_bits((idx >> 4) as u8);
                let n2 = DnaNucleotide::from_bits((idx >> 2) as u8);
                let n3 = DnaNucleotide::from_bits(idx as u8);
                sequence.push(n1); sequence.push(n2); sequence.push(n3);
            }
        }
        Self { sequence }
    }
}

/* =====================================================================
   5. LE GÈNE, PLASMIDE, ET GÉNOME (Hiérarchie finale)
   ===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Gene {
    pub locus: String,
    pub dna: DnaStrand,
}

impl Gene {
    pub fn new(locus: &str, instruction: &str) -> Self {
        Self {
            locus: locus.to_string(),
            dna: DnaStrand::synthesize(instruction),
        }
    }

    /// Processus complet : Transcription -> Traduction -> Repliement
    pub fn express(&self) -> String {
        let mrna = RnaPolymerase::transcribe(&self.dna);
        let unfolded_protein = Ribosome::translate(&mrna);
        unfolded_protein.fold()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Plasmid {
    pub plasmid_id: Uuid,
    pub survival_genes: Vec<Gene>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Genome {
    pub genome_id: Uuid,
    pub lineage_id: Uuid,
    pub main_chromosome: DnaStrand,
    pub genes: BTreeMap<String, Gene>,
    pub plasmids: Vec<Plasmid>,
}

impl Genome {
    pub fn new(base_instruction: &str) -> Self {
        let id = Uuid::new_v4();
        Self {
            genome_id: id,
            lineage_id: id,
            main_chromosome: DnaStrand::synthesize(base_instruction),
            genes: BTreeMap::new(),
            plasmids: Vec::new(),
        }
    }

    pub fn hash_library(&self) -> String {
        let serialized = serde_json::to_string(self).unwrap();
        let mut hasher = sha2::Sha256::new();
        sha2::Digest::update(&mut hasher, serialized.as_bytes());
        let mut hex = String::with_capacity(64);
        for byte in hasher.finalize() {
            use std::fmt::Write;
            write!(&mut hex, "{:02x}", byte).unwrap();
        }
        hex
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_central_dogma_of_biology() {
        // 1. Synthèse de l'ADN
        let gene = Gene::new("test", "GenOS V2 is alive!");
        
        // 2. Transcription, Traduction et Repliement
        let protein_output = gene.express();
        
        // 3. Vérification de la protéine fonctionnelle
        assert_eq!(protein_output, "GenOS V2 is alive!");
    }
}
