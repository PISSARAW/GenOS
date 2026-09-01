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
