use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::collections::BTreeMap;
use uuid::Uuid;

/* =====================================================================
1. LA MOLÉCULE (Nucléotides ADN & ARN)
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

/// L'Enzyme qui lit l'ADN pour créer l'ARN Messager
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
4. LE REPLIEMENT FINAL (Protéine Fonctionnelle & Mutations)
===================================================================== */
impl UnfoldedProtein {
    /// Le repliement (Folding).
    /// En cas de mutation grave (Frameshift ou Non-sens), le repliement échoue
    /// et la protéine est détruite par la cellule.
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
                    Ok(protein) => Ok(protein), // Succès (Peut inclure une mutation Silencieuse ou Faux-sens)
                    Err(_) => Err("NonsenseMutation: Structure 3D impossible à replier (Codon Stop prématuré ou corruption)".to_string()),
                }
            }
            Err(_) => Err(
                "FrameshiftCatastrophe: Décalage du cadre de lecture, assemblage chaotique"
                    .to_string(),
            ),
        }
    }
}

/* =====================================================================
LES AGENTS MUTAGÈNES ET LA RÉPARATION (Stress, UV, Rayons X, Virus, p53)
===================================================================== */

/// Représente les différentes agressions subies par l'ADN
pub enum Mutagen {
    /// 1. Causes Internes : Erreur de réplication (Faute de frappe)
    ReplicationError(usize, DnaNucleotide),

    /// 1. Causes Internes : Stress Oxydatif dû à la fatigue (Radicaux libres)
    OxidativeStress(usize, DnaNucleotide),

    /// 2. Causes Externes : Rayons UV (Fusionne deux Thymines adjacentes)
    Ultraviolet,

    /// 2. Causes Externes : Rayons X / Radioactivité (Cassure double brin)
    IonizingRadiation(usize),

    /// 2. Causes Externes : Produits Chimiques (Insertion de force entre les barreaux)
    Chemical(usize, DnaNucleotide),

    /// 2. Causes Externes : Virus (Insertion de matériel génétique étranger)
    Virus(usize, DnaStrand),
}

impl DnaStrand {
    pub fn synthesize(text: &str) -> Self {
        let base64_str = BASE64.encode(text);
        let mut sequence = Vec::new();
        const BASE64_ALPHABET: &[u8] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        for c in base64_str.chars() {
            if let Some(idx) = BASE64_ALPHABET.iter().position(|&x| x == c as u8) {
                let n1 = DnaNucleotide::from_bits((idx >> 4) as u8);
                let n2 = DnaNucleotide::from_bits((idx >> 2) as u8);
                let n3 = DnaNucleotide::from_bits(idx as u8);
                sequence.push(n1);
                sequence.push(n2);
                sequence.push(n3);
            }
        }
        Self { sequence }
    }

    /// Expose l'ADN à un agent mutagène
    pub fn expose_to_mutagen(&mut self, mutagen: Mutagen) {
        match mutagen {
            // Erreurs internes (Substitution / Faux-sens)
            Mutagen::ReplicationError(idx, base) | Mutagen::OxidativeStress(idx, base) => {
                if idx < self.sequence.len() {
                    self.sequence[idx] = base;
                }
            }
            // Rayons X : Cassure nette
            Mutagen::IonizingRadiation(idx) => {
                if idx < self.sequence.len() {
                    self.sequence.truncate(idx);
                }
            }
            // Agents Chimiques : Insertion de force (Décalage du cadre)
            Mutagen::Chemical(idx, base) => {
                if idx <= self.sequence.len() {
                    self.sequence.insert(idx, base);
                }
            }
            // Virus : Coupe un gène sain et s'insère au milieu
            Mutagen::Virus(idx, viral_dna) => {
                if idx <= self.sequence.len() {
                    for (i, base) in viral_dna.sequence.iter().enumerate() {
                        self.sequence.insert(idx + i, base.clone());
                    }
                }
            }
            // UV : Cherche les Thymines (T) adjacentes et les fusionne (créant un décalage)
            Mutagen::Ultraviolet => {
                let mut to_remove = Vec::new();
                for i in 0..self.sequence.len().saturating_sub(1) {
                    if self.sequence[i] == DnaNucleotide::T
                        && self.sequence[i + 1] == DnaNucleotide::T
                    {
                        to_remove.push(i + 1); // Fusion
                    }
                }
                for (offset, idx) in to_remove.into_iter().enumerate() {
                    self.sequence.remove(idx - offset); // Compense le décalage lors de la suppression
                }
            }
        }
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
    /// Renvoie une Erreur si la protéine est détruite suite à une mutation
    pub fn express(&self) -> Result<String, String> {
        let mrna = RnaPolymerase::transcribe(&self.dna);
        let unfolded_protein = Ribosome::translate(&mrna);
        unfolded_protein.fold()
    }

    /// Enzyme de réparation (p53) : Patrouille l'ADN et détecte les erreurs graves (Frameshift/Nonsense)
    /// Renvoie `true` si le gène est sain, `false` s'il est gravement muté.
    pub fn p53_repair_check(&self) -> bool {
        self.express().is_ok()
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
    /// L'ADN d'un agent est diploïde (2 paires de chromosomes)
    pub chromosome_maternal: DnaStrand,
    pub chromosome_paternal: DnaStrand,
    pub genes: BTreeMap<String, Gene>,
    pub plasmids: Vec<Plasmid>,
}

impl Genome {
    pub fn new(base_instruction: &str) -> Self {
        let id = Uuid::new_v4();
        let strand = DnaStrand::synthesize(base_instruction);
        Self {
            genome_id: id,
            lineage_id: id,
            chromosome_maternal: strand.clone(),
            chromosome_paternal: strand,
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
        let gene = Gene::new("test", "GenOS V2 is alive!");
        let protein_output = gene.express().unwrap();
        assert_eq!(protein_output, "GenOS V2 is alive!");
        assert!(gene.p53_repair_check()); // p53 confirme que le gène est sain
    }

    #[test]
    fn test_environmental_mutagens() {
        let gene = Gene::new("test", "Hello World!");

        // 1. Rayons X (Cassure double brin)
        let mut x_ray_gene = gene.clone();
        x_ray_gene
            .dna
            .expose_to_mutagen(Mutagen::IonizingRadiation(5));

        let result = x_ray_gene.express();
        assert!(result.is_err());
        assert!(!x_ray_gene.p53_repair_check()); // p53 détecte la mutation fatale

        // 2. Erreur de Réplication (Faux-sens ou Silencieuse)
        let mut rep_error_gene = gene.clone();
        rep_error_gene
            .dna
            .expose_to_mutagen(Mutagen::ReplicationError(2, DnaNucleotide::C));

        let result = rep_error_gene.express();
        // Si ça ne casse pas la structure, p53 laisse passer (mutation silencieuse/légère)
        assert!(result.is_ok() || result.unwrap_err().contains("NonsenseMutation"));

        // 3. Produit Chimique (Insertion provoquant un décalage Frameshift)
        let mut chem_gene = gene.clone();
        chem_gene
            .dna
            .expose_to_mutagen(Mutagen::Chemical(5, DnaNucleotide::A));
        assert!(chem_gene.express().is_err()); // Le décodage Base64 ou UTF-8 va crasher
    }
}
