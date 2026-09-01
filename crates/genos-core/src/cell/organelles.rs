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
    pub metabolic_rate: f64,
    /// 3. Anti-angiogenèse : Couper les vivres (Empêche le rechargement en ATP)
    pub angiogenesis_blocked: bool,
    
    // THEORIE DE L'ENDOSYMBIOSE (Preuves de Lynn Margulis)
    /// 1. ADN Circulaire Indépendant (Relique de la bactérie originelle)
    pub mitochondrial_dna: crate::genome::DnaStrand,
    /// 2. Double enveloppe (Membrane de la bactérie + Membrane de la vésicule phagocytaire)
    pub is_double_membraned: bool,
}

impl Mitochondria {
    /// 3. La Scissiparité : Les mitochondries se divisent de manière autonome,
    /// indépendamment de la mitose de la cellule hôte, comme les bactéries !
    pub fn independent_binary_fission(&mut self) -> Self {
        let mut clone = self.clone();
        // L'énergie est divisée par deux lors de la scissiparité
        self.atp_budget /= 2;
        clone.atp_budget = self.atp_budget;
        clone
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

