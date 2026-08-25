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



#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DynamicPromptBuilder {
    pub base_prompt: String,
    pub rna_sequence: RnaSequence,
}

impl DynamicPromptBuilder {
    pub fn new(base_prompt: &str, rna_sequence: RnaSequence) -> Self {
        Self {
            base_prompt: base_prompt.to_string(),
            rna_sequence,
        }
    }

    /// Construit le prompt systme dynamique final en "traduisant" l"ARN
    /// en directives comportementales pour le LLM.
    pub fn build_system_prompt(&self, in_torpor_mode: bool) -> String {
        let mut final_prompt = self.base_prompt.clone();
        
        final_prompt.push_str("\n\n=== GENOS BIOLOGICAL DIRECTIVES ===\n");
        
        // 1. Transcription/Traduction de l"ARN
        let translated = self.rna_sequence.translate_to_protein();
        if translated.contains('M') {
            final_prompt.push_str("- [RNA] Methionine detected: Agent is in an ACTIVE growth phase. Prioritize expansion and refactoring.\n");
        } else {
            final_prompt.push_str("- [RNA] No start codon detected: Agent is in a DORMANT or maintenance phase. Do not invent new features.\n");
        }
        
        if translated.contains('*') {
            final_prompt.push_str("- [RNA] Stop codon reached: Strictly limit your output length and avoid rambling.\n");
        }

        // 2. Torpeur (Conservation d"nergie / Jetons)
        if in_torpor_mode {
            final_prompt.push_str("\n[CRITICAL HOMEOSTASIS ALERT]\n");
            final_prompt.push_str("URGENCE: Mode conservation actif (Torpeur). Tu dois gnrer MOINS DE 50 MOTS.\n");
            final_prompt.push_str("N'utilise aucun appel rseau ou outil lourd (pas de fuzzing, pas de compilation complxe).\n");
            final_prompt.push_str("Concentre-toi uniquement sur la rsolution du bug immdiat pour survivre.\n");
        }
        
        final_prompt
    }
}
