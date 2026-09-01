use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::collections::BTreeMap;
use uuid::Uuid;

/* =====================================================================
   1. LA MOLÉCULE (Nucléotides)
   ===================================================================== */
/// La brique chimique fondamentale de l'Agent.
/// Tout le code et les traits de l'agent seront littéralement encodés en base-4 !
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Nucleotide {
    A, // 00
    C, // 01
    G, // 10
    T, // 11
}

/* =====================================================================
   2. L'ADN (La double hélice)
   ===================================================================== */
/// Macromolécule formée par l'assemblage de nucléotides.
/// Sert de support matériel brut.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DnaStrand {
    pub sequence: Vec<Nucleotide>,
}

impl DnaStrand {
    /// Encode un texte brut (ex: prompt système) en chaîne d'ADN (Nucléotides)
    pub fn encode(text: &str) -> Self {
        let mut sequence = Vec::new();
        for byte in text.bytes() {
            // 1 octet = 8 bits = 4 paires de bits = 4 nucléotides
            for i in (0..4).rev() {
                let bits = (byte >> (i * 2)) & 0b11;
                let nucleotide = match bits {
                    0b00 => Nucleotide::A,
                    0b01 => Nucleotide::C,
                    0b10 => Nucleotide::G,
                    0b11 => Nucleotide::T,
                    _ => unreachable!(),
                };
                sequence.push(nucleotide);
            }
        }
        Self { sequence }
    }

    /// Décode la chaîne d'ADN en texte brut (Transcription)
    pub fn decode(&self) -> String {
        let mut bytes = Vec::new();
        for chunk in self.sequence.chunks(4) {
            if chunk.len() == 4 {
                let mut byte = 0u8;
                for (i, n) in chunk.iter().enumerate() {
                    let bits = match n {
                        Nucleotide::A => 0b00,
                        Nucleotide::C => 0b01,
                        Nucleotide::G => 0b10,
                        Nucleotide::T => 0b11,
                    };
                    byte |= bits << ((3 - i) * 2);
                }
                bytes.push(byte);
            }
        }
        String::from_utf8(bytes).unwrap_or_else(|_| "DnaDecodeError".to_string())
    }
}

/* =====================================================================
   3. LE GÈNE
   ===================================================================== */
/// Un segment précis d'ADN. Contient l'instruction exacte (la protéine).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Gene {
    /// L'emplacement/nom du gène (ex: "temperature", "role")
    pub locus: String,
    /// L'ADN codant pour cette instruction
    pub dna: DnaStrand,
}

impl Gene {
    pub fn new(locus: &str, instruction: &str) -> Self {
        Self {
            locus: locus.to_string(),
            dna: DnaStrand::encode(instruction),
        }
    }
    /// Transcrit le gène en instruction utilisable par la cellule
    pub fn express(&self) -> String {
        self.dna.decode()
    }
}

/* =====================================================================
   4. LE PLASMIDE
   ===================================================================== */
/// Petit anneau d'ADN qui flotte. Peut être échangé entre les cellules.
/// Contient des gènes liés à la survie (ex: "Règle Anti-Écholalie").
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Plasmid {
    pub plasmid_id: Uuid,
    pub survival_genes: Vec<Gene>,
}

/* =====================================================================
   5. LE GÉNOME
   ===================================================================== */
/// La bibliothèque complète. Englobe tout l'ADN, les gènes et les plasmides.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Genome {
    pub genome_id: Uuid,
    pub lineage_id: Uuid,
    
    /// Le chromosome principal (l'identité de base de l'agent)
    pub main_chromosome: DnaStrand,
    
    /// La bibliothèque des gènes (les paramètres/traits de l'agent)
    /// BTreeMap garantit l'ordre cryptographique
    pub genes: BTreeMap<String, Gene>,
    
    /// Les plasmides (pouvant être acquis ou transmis)
    pub plasmids: Vec<Plasmid>,
}

impl Genome {
    pub fn new(base_instruction: &str) -> Self {
        let id = Uuid::new_v4();
        Self {
            genome_id: id,
            lineage_id: id,
            main_chromosome: DnaStrand::encode(base_instruction),
            genes: BTreeMap::new(),
            plasmids: Vec::new(),
        }
    }

    /// Le Hachage SHA256 déterministe
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
    fn test_dna_encoding_decoding() {
        let original_text = "Je suis un agent IA";
        let dna = DnaStrand::encode(original_text);
        
        // Vérifie que l'ADN n'est constitué que de A, C, G, T
        assert!(dna.sequence.len() > 0);
        
        // Transcription inverse
        let decoded = dna.decode();
        assert_eq!(original_text, decoded);
    }

    #[test]
    fn test_gene_expression() {
        let gene = Gene::new("verbosity", "low");
        assert_eq!(gene.express(), "low");
    }
}
