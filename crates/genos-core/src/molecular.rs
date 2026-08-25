use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Nucleotide {
    A,
    C,
    G,
    T,
    U, // For RNA
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Codon(pub Nucleotide, pub Nucleotide, pub Nucleotide);

impl Codon {
    /// Translates a codon into a simulated amino acid (or structural instruction).
    pub fn translate(&self) -> char {
        match (&self.0, &self.1, &self.2) {
            (Nucleotide::A, Nucleotide::U, Nucleotide::G) => 'M', // Start / Methionine
            (Nucleotide::U, Nucleotide::A, Nucleotide::A) | 
            (Nucleotide::U, Nucleotide::A, Nucleotide::G) | 
            (Nucleotide::U, Nucleotide::G, Nucleotide::A) => '*', // Stop
            _ => 'X', // Generic amino acid for simulation
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RnaSequence {
    pub sequence: Vec<Nucleotide>,
}

impl RnaSequence {
    /// Simule la traduction d"un ARN messager en protine (ou composant logiciel)
    pub fn translate_to_protein(&self) -> String {
        let mut protein = String::new();
        let mut in_frame = false;
        
        let mut i = 0;
        while i + 2 < self.sequence.len() {
            let codon = Codon(
                self.sequence[i].clone(),
                self.sequence[i+1].clone(),
                self.sequence[i+2].clone()
            );
            
            let aa = codon.translate();
            if aa == 'M' && !in_frame {
                in_frame = true;
            }
            
            if in_frame {
                if aa == '*' {
                    break;
                }
                protein.push(aa);
            }
            i += 3;
        }
        protein
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DnaSequence {
    pub sequence: Vec<Nucleotide>,
}

impl DnaSequence {
    /// Transcrit l"ADN en ARN (remplace T par U)
    pub fn transcribe(&self) -> RnaSequence {
        let rna_seq = self.sequence.iter().map(|n| {
            if *n == Nucleotide::T { Nucleotide::U } else { n.clone() }
        }).collect();
        RnaSequence { sequence: rna_seq }
    }
    
    /// Simule un splicing (retrait des introns)
    pub fn splice(&self, exons: &[(usize, usize)]) -> DnaSequence {
        let mut mature_seq = Vec::new();
        for (start, end) in exons {
            if *start < self.sequence.len() && *end <= self.sequence.len() && start < end {
                mature_seq.extend_from_slice(&self.sequence[*start..*end]);
            }
        }
        DnaSequence { sequence: mature_seq }
    }
}

