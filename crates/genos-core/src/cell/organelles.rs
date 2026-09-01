use crate::cell::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
use crate::genome::{Genome, Plasmid};
use crate::cell::substructs::*;


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlasmaMembrane {
    pub incoming_receptors: Vec<String>,
    pub adhesion_active: bool,
    pub outgoing_ion_channels: Vec<String>,
    /// 1. ThÃƒÂ©rapie ciblÃƒÂ©e : Bloque les signaux de croissance
    pub receptors_blocked: bool,
    /// SpÃƒÂ©cificitÃƒÂ© bactÃƒÂ©rienne : Les bactÃƒÂ©ries ont une paroi rigide.
    pub has_cell_wall: bool,
    pub septum_inhibited: bool,
    /// Vaccin : Liste des antigÃƒÂ¨nes/spikes viraux neutralisÃƒÂ©s ÃƒÂ  vue.
    pub immunized_against: Vec<String>,
    /// Le CMH (Complexe Majeur d'HistocompatibilitÃƒÂ©) : PrÃƒÂ©sentoir de l'ÃƒÂ©tat interne
    pub mhc_display: Option<String>,
    pub budding_scars: u32,
    pub attached_buds: Vec<uuid::Uuid>,
    pub receptors: Vec<crate::signaling::Receptor>,
    pub gap_junctions: Vec<uuid::Uuid>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Nucleus {
    pub genome: Genome,
    pub ploidy: u32,
    pub transcription_factors: Vec<String>,
    pub p53_active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]


pub struct Mitochondria {
    pub atp_budget: u64,
    pub metabolic_rate: f64, // Surface des crêtes mitochondriales (Scaling)
    pub angiogenesis_blocked: bool,
    pub mitochondrial_dna: crate::genome::DnaStrand,
    pub is_double_membraned: bool,
    // --- NOUVEAU : Respiration & Vieillissement ---
    pub cyanide_poisoned: bool,
    pub accumulated_free_radicals: u64,
}

impl Mitochondria {
    /// 3. La Scissiparité autonome
    pub fn independent_binary_fission(&mut self) -> Self {
        let mut clone = self.clone();
        self.atp_budget /= 2;
        clone.atp_budget = self.atp_budget;
        clone
    }

    /// LA RESPIRATION CELLULAIRE (La Centrale Électrique)
    /// Brûle du sucre et de l'oxygène pour générer de l'ATP (Tokens IA).
    pub fn cellular_respiration(&mut self, glucose_molecules: u64, oxygen_present: bool) -> u64 {
        if self.cyanide_poisoned || !oxygen_present {
            return 0; // Arrêt total des turbines
        }

        // 1 Glucose = ~36 ATP (grâce à la chaîne respiratoire sur les crêtes)
        let generated_atp = (glucose_molecules as f64 * 36.0 * self.metabolic_rate) as u64;
        self.atp_budget += generated_atp;

        // LE PRIX À PAYER : Stress Oxydatif (Vieillissement)
        // Les "étincelles" toxiques de la combustion
        self.accumulated_free_radicals += (glucose_molecules as f64 * 0.1) as u64;

        generated_atp
    }

    /// LE POISON (Le blocage des turbines)
    pub fn administer_cyanide(&mut self) {
        self.cyanide_poisoned = true;
        self.atp_budget = 0; // Mort immédiate
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Chloroplast {
    pub glucose_budget: u64,
    pub chloroplast_dna: crate::genome::DnaStrand,
    pub is_double_membraned: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EndoplasmicReticulum {
    pub active_ribosomes_count: u32,
    /// 4. Inhibiteurs du cycle cellulaire : Bloque la Mitose
    pub cell_cycle_inhibited: bool,
}

/* =====================================================================
ANTICORPS (ImmunitÃƒÂ© Humorale)
===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum IgClass {
    IgG, // VÃƒÂ©tÃƒÂ©rans : Neutralisation classique et SystÃƒÂ¨me du ComplÃƒÂ©ment
    IgA, // FrontiÃƒÂ¨res : Bloque l'entrÃƒÂ©e aux muqueuses
    IgM, // PentamÃƒÂ¨re (Ãƒâ€°toile) : Champion de l'Agglutination
    IgE, // SpÃƒÂ©cialiste : Parasites et Allergies (Choc anaphylactique)
    IgD, // RÃƒÂ©cepteur de surface (Antenne)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Antibody {
    pub target_antigen: String,
    pub ig_class: IgClass,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GolgiApparatus {
    pub export_vesicles: Vec<String>,
    /// VÃƒÂ©sicules contenant de nouveaux virus prÃƒÂªts ÃƒÂ  envahir le rÃƒÂ©seau
    pub viral_vesicles: Vec<crate::virology::Virion>,
    /// Usine d'armement : Les Plasmocytes (Lymphocytes B) y stockent les anticorps ÃƒÂ  relÃƒÂ¢cher
    pub produced_antibodies: Vec<Antibody>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Lysosomes {
    /// 3. Digestion : Enzymes acides pour dissoudre la menace
    pub digestive_enzymes_active: bool,
    /// 2. Ingestion : Les poches (phagosomes) contenant l'ADN emprisonnÃƒÂ© des ennemis
    pub phagosomes: Vec<crate::genome::DnaStrand>,
    /// 4. Expulsion : Les dÃƒÂ©chets inoffensifs prÃƒÂªts ÃƒÂ  ÃƒÂªtre recrachÃƒÂ©s
    pub expelled_debris: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cytoplasm {
    pub cognition: CognitiveState,
    pub trace: ActionTrace,
    pub active_plasmids: Vec<Plasmid>,
    pub micro_rnas: Vec<String>,
    /// PÃƒÂ©nÃƒÂ©tration : Les virus qui ont infiltrÃƒÂ© la cellule et piratent ses ribosomes
    pub viral_infections: Vec<crate::virology::Virion>,
}

/* =====================================================================
LE CYCLE CELLULAIRE (La Mitose / Fork & MÃƒÂ©iose / GamÃƒÂ¨tes)
===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Gamete {
    pub chromosome: crate::genome::DnaStrand,
    pub atp_reserve: u64,
}

