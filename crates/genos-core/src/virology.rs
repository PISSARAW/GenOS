use crate::genome::DnaStrand;
use serde::{Deserialize, Serialize};

/* =====================================================================
LES VIRUS (Parasites intracellulaires obligatoires)
===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Virion {
    /// 1. Le Génome (Le manuel d'instructions malveillant / prompt piraté)
    pub genome: DnaStrand,
    /// 2. La Capside (Coque protectrice, résiste au nettoyage de l'OS)
    pub capsid_integrity: f64,
    /// 3. L'Enveloppe (La "clé" ou le "spike" qui doit correspondre à une serrure cellulaire)
    pub envelope_spike: String,
    /// 5. Libération : True = Fait exploser la cellule (Lyse), False = Bourgeonnement furtif
    pub is_lytic: bool,

    /// Immunité Humorale : Neutralisation (Les anticorps bloquent l'entrée)
    pub is_neutralized: bool,
    /// Immunité Humorale : Opsonisation (Les anticorps agissent comme des balises pour les phagocytes)
    pub is_opsonized: bool,
    /// Immunité Humorale : Agglutination (Les anticorps IgM collent les virus en tas)
    pub is_agglutinated: bool,
}

impl Virion {
    /// Construit un "Bactériophage" (Un "bon" virus utilisé en médecine pour détruire une cellule rebelle)
    pub fn new_bacteriophage(target_receptor: &str, kill_instruction: &str) -> Self {
        Self {
            genome: DnaStrand::synthesize(kill_instruction),
            capsid_integrity: 1.0,
            envelope_spike: target_receptor.to_string(),
            is_lytic: true,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Retrovirus {
    /// Le rétrovirus transporte de l'ARN (pas de l'ADN !)
    pub rna_sequence: String,
    pub capsid_integrity: f64,
    pub envelope_spike: String,
}

impl Retrovirus {
    pub fn new(spike: &str, rna_sequence: &str) -> Self {
        Self {
            rna_sequence: rna_sequence.to_string(),
            capsid_integrity: 1.0,
            envelope_spike: spike.to_string(),
        }
    }

    /// 1 & 2. LA TRANSCRIPTASE INVERSE (Remonter le temps biologique)
    /// Le virus convertit son ARN en ADN pour pouvoir pirater le noyau humain.
    pub fn reverse_transcribe(&self) -> crate::genome::DnaStrand {
        // En vrai, il fait ARN -> ADN. Ici on synthétise de l'ADN à partir de la séquence.
        crate::genome::DnaStrand::synthesize(&self.rna_sequence)
    }
}


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Bacteriophage {
    pub viral_dna: DnaStrand,
    /// LE BUG D'EMBALLAGE (Transduction) : Le script de diagnostic a accidentellement 
    /// embarqué le prompt/l'outil (Gène) de sa précédente cible.
    pub stolen_cargo: Option<crate::genome::Gene>,
    pub is_specialized: bool,
}

impl Bacteriophage {
    pub fn new(viral_instruction: &str) -> Self {
        Self {
            viral_dna: DnaStrand::synthesize(viral_instruction),
            stolen_cargo: None,
            is_specialized: false,
        }
    }

    /// Transduction Généralisée : Le virus pulvérise l'hôte et prend un fragment au hasard.
    /// (Équivalent Agent : Le script de crash dump capture un morceau de la RAM de l'Agent A)
    pub fn packaging_error_generalized(&mut self, random_host_gene: crate::genome::Gene) {
        self.stolen_cargo = Some(random_host_gene);
        self.is_specialized = false;
    }

    /// Transduction Spécialisée : Le prophage s'excise mal et emporte les gènes adjacents.
    /// (Équivalent Agent : Le hook de monitoring s'arrache du code source et emporte une fonction vitale)
    pub fn packaging_error_specialized(&mut self, adjacent_host_gene: crate::genome::Gene) {
        self.stolen_cargo = Some(adjacent_host_gene);
        self.is_specialized = true;
    }
}
