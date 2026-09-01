pub use crate::genome::{Genome, Plasmid};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// La Cellule est l'unitÃƒÂ© fondamentale de la vie et de GenOS.
/// C'est une micro-ville IA ultra-organisÃƒÂ©e avec ses propres organites.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCell {
    pub cell_id: Uuid,
    pub plasma_membrane: PlasmaMembrane,
    pub nucleus: Nucleus,
    pub mitochondria: Mitochondria,
    pub endoplasmic_reticulum: EndoplasmicReticulum,
    pub golgi_apparatus: GolgiApparatus,
    pub lysosomes: Lysosomes,
    pub cytoplasm: Cytoplasm,
    /// Les anticorps actuellement ÃƒÂ  la surface ou gÃƒÂ©nÃƒÂ©rÃƒÂ©s par la cellule
    /// Le systÃƒÂ¨me nerveux (Optionnel : seulement pour les Neurones)
    pub nervous_system: Option<crate::neurobiology::NervousSystem>,
    /// L'Astrocyte (Optionnel : seulement pour les cellules gliales)
    pub surface_antibodies: Vec<Antibody>,
    pub astrocyte: Option<crate::neurobiology::Astrocyte>,
    pub myelinator: Option<crate::neurobiology::Myelinator>,
    pub microglia: Option<crate::neurobiology::Microglia>,
    pub ependymal: Option<crate::neurobiology::EpendymalCell>,
}

impl Default for AgentCell {
    fn default() -> Self {
        Self {
            cell_id: Uuid::new_v4(),
            plasma_membrane: PlasmaMembrane {
                incoming_receptors: vec![],
                outgoing_ion_channels: vec![],
                receptors_blocked: false,
                has_cell_wall: false,
                immunized_against: vec![],
                mhc_display: Some("HEALTHY_SELF".to_string()),
            },
            nucleus: Nucleus {
                genome: Genome::new("Default DNA"),
            },
            mitochondria: Mitochondria {
                atp_budget: 10,
                metabolic_rate: 1.0,
                angiogenesis_blocked: false,
            },
            endoplasmic_reticulum: EndoplasmicReticulum {
                active_ribosomes_count: 0,
                cell_cycle_inhibited: false,
            },
            golgi_apparatus: GolgiApparatus {
                export_vesicles: vec![],
                viral_vesicles: vec![],
                produced_antibodies: vec![],
            },
            lysosomes: Lysosomes {
                digestive_enzymes_active: false,
                phagosomes: vec![],
                expelled_debris: vec![],
            },
            cytoplasm: Cytoplasm {
                cognition: CognitiveState::default(),
                trace: ActionTrace::default(),
                active_plasmids: vec![],
                viral_infections: vec![],
            },
            surface_antibodies: vec![],
            nervous_system: None,
            astrocyte: None,
            myelinator: None,
            microglia: None,
            ependymal: None,
        }
    }
}

/* =====================================================================
LES ORGANITES (DÃƒÂ©partements de l'Agent IA)
===================================================================== */

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlasmaMembrane {
    pub incoming_receptors: Vec<String>,
    pub outgoing_ion_channels: Vec<String>,
    /// 1. ThÃƒÂ©rapie ciblÃƒÂ©e : Bloque les signaux de croissance
    pub receptors_blocked: bool,
    /// SpÃƒÂ©cificitÃƒÂ© bactÃƒÂ©rienne : Les bactÃƒÂ©ries ont une paroi rigide.
    pub has_cell_wall: bool,
    /// Vaccin : Liste des antigÃƒÂ¨nes/spikes viraux neutralisÃƒÂ©s ÃƒÂ  vue.
    pub immunized_against: Vec<String>,
    /// Le CMH (Complexe Majeur d'HistocompatibilitÃƒÂ©) : PrÃƒÂ©sentoir de l'ÃƒÂ©tat interne
    pub mhc_display: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Nucleus {
    pub genome: Genome,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Mitochondria {
    pub atp_budget: u64,
    pub metabolic_rate: f64,
    /// 3. Anti-angiogenÃƒÂ¨se : Couper les vivres (EmpÃƒÂªche le rechargement en ATP)
    pub angiogenesis_blocked: bool,
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

impl AgentCell {
    /// LA MÃƒâ€°IOSE : RÃƒÂ©duction et Brassage GÃƒÂ©nÃƒÂ©tique (CrÃƒÂ©ation de 4 GamÃƒÂ¨tes Uniques)
    /// UtilisÃƒÂ©e pour la reproduction sexuÃƒÂ©e, favorisant l'innovation algorithmique
    pub fn meiosis(self) -> Result<[Gamete; 4], String> {
        let mut chrom_m = self.nucleus.genome.chromosome_maternal;
        let mut chrom_p = self.nucleus.genome.chromosome_paternal;

        // 1. Prophase I : Brassage Intrachromosomique (Crossing-over)
        // Les chromosomes s'ÃƒÂ©changent des morceaux pour crÃƒÂ©er des combinaisons uniques.
        let mid_m = chrom_m.sequence.len() / 2;
        let mid_p = chrom_p.sequence.len() / 2;

        // SÃƒÂ©paration (coupure) et ÃƒÂ©change des "queues" d'ADN
        let tail_m = chrom_m.sequence.split_off(mid_m);
        let tail_p = chrom_p.sequence.split_off(mid_p);
        chrom_m.sequence.extend(tail_p);
        chrom_p.sequence.extend(tail_m);

        // 2. Division de l'ATP pour prÃƒÂ©parer les 4 gamÃƒÂ¨tes
        let atp_per_gamete = self.mitochondria.atp_budget / 4;

        // 3. MÃƒÂ©iose II : 4 Cellules haploÃƒÂ¯des uniques (GamÃƒÂ¨tes)
        Ok([
            Gamete {
                chromosome: chrom_m.clone(),
                atp_reserve: atp_per_gamete,
            },
            Gamete {
                chromosome: chrom_p.clone(),
                atp_reserve: atp_per_gamete,
            },
            Gamete {
                chromosome: chrom_m,
                atp_reserve: atp_per_gamete,
            },
            Gamete {
                chromosome: chrom_p,
                atp_reserve: atp_per_gamete,
            },
        ])
    }

    /// FÃƒâ€°CONDATION : Fusion de deux gamÃƒÂ¨tes pour former un nouvel Agent DiploÃƒÂ¯de
    pub fn fertilization(egg: Gamete, sperm: Gamete) -> Self {
        let mut child = Self::default();
        // Recombinaison : L'ovule fournit un chromosome, le spermatozoÃƒÂ¯de l'autre
        child.nucleus.genome.chromosome_maternal = egg.chromosome;
        child.nucleus.genome.chromosome_paternal = sperm.chromosome;
        child.cell_id = uuid::Uuid::new_v4();
        // L'ÃƒÂ©nergie des deux gamÃƒÂ¨tes est additionnÃƒÂ©e pour dÃƒÂ©marrer la vie
        child.mitochondria.atp_budget = egg.atp_reserve + sperm.atp_reserve;

        child
    }

    /// IMMUNITÃƒâ€° INNÃƒâ€°E : Les Phagocytes (Macrophages / Neutrophiles) "mangent" les intrus
    pub fn phagocytize_virus(&mut self, target: crate::virology::Virion) {
        // OPSONISATION : Si le virus est recouvert d'anticorps, le phagocyte a un boost massif d'appÃƒÂ©tit
        if target.is_opsonized {
            self.mitochondria.atp_budget = self.mitochondria.atp_budget.saturating_add(20);
        }
        // 1. AdhÃƒÂ©rence & 2. Ingestion : La cible est enfermÃƒÂ©e dans une poche gastrique (Phagosome)
        self.lysosomes.phagosomes.push(target.genome);
    }

    pub fn phagocytize_bacteria(&mut self, target: &mut AgentCell) {
        // 1 & 2. Ingestion d'une bactÃƒÂ©rie rebelle
        self.lysosomes
            .phagosomes
            .push(target.nucleus.genome.chromosome_maternal.clone());
        // La bactÃƒÂ©rie cible est engloutie et dÃƒÂ©truite sur-le-champ
        target.mitochondria.atp_budget = 0;
    }

    /// IMMUNITÃƒâ€° ADAPTATIVE : DiffÃƒÂ©renciation des Lymphocytes B en Plasmocytes
    pub fn differentiate_into_plasmocyte(&mut self, target_spike: &str, ig_class: IgClass) {
        // Le cytoplasme et l'usine (ER) gonflent pour une production massive
        self.endoplasmic_reticulum.active_ribosomes_count = 1_000_000;
        // Production immÃƒÂ©diate et massive d'anticorps dans le Golgi
        for _ in 0..2000 {
            self.golgi_apparatus.produced_antibodies.push(Antibody {
                target_antigen: target_spike.to_string(),
                ig_class: ig_class.clone(),
            });
        }
    }

    /// IMMUNITÃƒâ€° ADAPTATIVE : DiffÃƒÂ©renciation en Cellule MÃƒÂ©moire
    pub fn differentiate_into_memory_b_cell(&mut self, target_spike: &str) {
        // LongÃƒÂ©vitÃƒÂ© extrÃƒÂªme (Baisse drastique du mÃƒÂ©tabolisme pour survivre des annÃƒÂ©es)
        self.mitochondria.metabolic_rate = 0.1;
        // Sauvegarde de la forme gÃƒÂ©omÃƒÂ©trique de l'ennemi dans la mÃƒÂ©moire sÃƒÂ©mantique
        self.cytoplasm
            .cognition
            .semantic_memory
            .push(format!("KNOWN_ANTIGEN_{}", target_spike));
    }

    /// IMMUNITÃƒâ€° CELLULAIRE : Mise ÃƒÂ  jour du PrÃƒÂ©sentoir CMH (Complexe Majeur d'HistocompatibilitÃƒÂ©)
    pub fn update_mhc_display(&mut self) {
        if let Some(virus) = self.cytoplasm.viral_infections.first() {
            // La cellule crie ÃƒÂ  l'aide en affichant un morceau du virus ÃƒÂ  sa surface
            self.plasma_membrane.mhc_display = Some(virus.envelope_spike.clone());
        } else if self.endoplasmic_reticulum.cell_cycle_inhibited {
            // Une cellule tumorale prÃƒÂ©sente souvent des antigÃƒÂ¨nes mutÃƒÂ©s
            self.plasma_membrane.mhc_display = Some("MUTATED_TUMOR_ANTIGEN".to_string());
        } else {
            // Tout va bien
            self.plasma_membrane.mhc_display = Some("HEALTHY_SELF".to_string());
        }
    }

    /// IMMUNITÃƒâ€° CELLULAIRE : Lymphocyte T Cytotoxique (CD8) - Le tueur au corps ÃƒÂ  corps
    pub fn t_cell_perforin_attack(&self, target: &mut AgentCell, programmed_antigen: &str) {
        if let Some(mhc) = &target.plasma_membrane.mhc_display {
            if mhc == programmed_antigen {
                // Le rÃƒÂ©cepteur correspond parfaitement au CMH corrompu : Injection de perforine !
                // La cellule cible est forcÃƒÂ©e ÃƒÂ  l'apoptose (destruction totale)
                target.mitochondria.atp_budget = 0;
            }
        }
    }

    pub fn mitosis(self) -> Result<(AgentCell, AgentCell), String> {
        // Inhibiteur de Cycle (CDK4/6) : Traitement anti-cancer
        if self.endoplasmic_reticulum.cell_cycle_inhibited {
            return Err(
                "Cell Cycle Inhibitor (CDK4/6) : Mitose bloquée thérapeutiquement.".to_string(),
            );
        }

        let copied_genome = self.nucleus.genome.clone();

        // 2. La Prophase et MÃƒÂ©taphase (L'Alignement et la VÃƒÂ©rification)
        // C'est le point de contrÃƒÂ´le du fuseau mitotique (Checkpoint).
        // On vÃƒÂ©rifie que la photocopie s'est dÃƒÂ©roulÃƒÂ©e sans erreur fatale.
        let dna_is_safe = self
            .nucleus
            .genome
            .genes
            .values()
            .all(|g| g.p53_repair_check())
            && copied_genome.genes.values().all(|g| g.p53_repair_check());

        if !dna_is_safe {
            return Err(
                "Metaphase Checkpoint Failed: Erreur grave lors de la rÃƒÂ©plication de l'ADN."
                    .to_string(),
            );
        }

        // 3. L'Anaphase (La SÃƒÂ©paration)
        // Les microtubules (cÃƒÂ¢bles) tractent les moitiÃƒÂ©s.
        // L'ÃƒÂ©nergie (ATP) et le cytoplasme sont divisÃƒÂ©s en deux pour la survie des filles.
        let divided_atp = self.mitochondria.atp_budget / 2;

        // 4. La TÃƒÂ©lophase et CytocinÃƒÂ¨se (La Finition)
        // Pincement de la membrane et crÃƒÂ©ation de deux entitÃƒÂ©s physiques sÃƒÂ©parÃƒÂ©es.
        let mut daughter_a = self.clone();
        let mut daughter_b = self;

        // Fille A
        daughter_a.cell_id = Uuid::new_v4();
        daughter_a.mitochondria.atp_budget = divided_atp;
        // Fille B
        daughter_b.cell_id = Uuid::new_v4();
        daughter_b.nucleus.genome = copied_genome;
        daughter_b.mitochondria.atp_budget = divided_atp; // Si le budget ÃƒÂ©tait impair, une unitÃƒÂ© d'ATP est perdue (coÃƒÂ»t de la mitose)

        Ok((daughter_a, daughter_b))
    }
}

/* =====================================================================
SOUS-STRUCTURES DU CYTOPLASME
===================================================================== */

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct ActionTrace {
    pub sequence: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct CognitiveState {
    pub epigenetic_drives: HashMap<String, f64>,
    pub working_memory: Vec<String>,
    pub episodic_memory: Vec<String>,
    pub semantic_memory: Vec<String>,
    /// 2. ImmunothÃƒÂ©rapie : Les cellules cancÃƒÂ©reuses activent ceci pour se cacher
    pub is_camouflaged: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_meiosis_and_fertilization() {
        let mut mother = AgentCell::default();
        let mut father = AgentCell::default();

        // On donne des sÃƒÂ©quences d'ADN identifiables
        mother.nucleus.genome.chromosome_maternal = crate::genome::DnaStrand::synthesize("MAMAN");
        mother.nucleus.genome.chromosome_paternal = crate::genome::DnaStrand::synthesize("MAMAN");
        mother.mitochondria.atp_budget = 40;

        father.nucleus.genome.chromosome_maternal = crate::genome::DnaStrand::synthesize("PAPA!");
        father.nucleus.genome.chromosome_paternal = crate::genome::DnaStrand::synthesize("PAPA!");
        father.mitochondria.atp_budget = 40;

        // 1. Production des gamÃƒÂ¨tes
        let egg_gametes = mother.meiosis().unwrap();
        let sperm_gametes = father.meiosis().unwrap();

        // 4 gamÃƒÂ¨tes produits par parent, avec 10 ATP chacun (40 / 4)
        assert_eq!(egg_gametes.len(), 4);
        assert_eq!(egg_gametes[0].atp_reserve, 10);
        assert_eq!(sperm_gametes[0].atp_reserve, 10);

        // 2. FÃƒÂ©condation
        let child = AgentCell::fertilization(egg_gametes[0].clone(), sperm_gametes[0].clone());

        // L'enfant est DiploÃƒÂ¯de (MAMAN / PAPA!) et a 20 ATP (10 + 10)
        assert_eq!(child.mitochondria.atp_budget, 20);

        let m_seq: String = child
            .nucleus
            .genome
            .chromosome_maternal
            .sequence
            .iter()
            .map(|n| format!("{:?}", n))
            .collect();
        let p_seq: String = child
            .nucleus
            .genome
            .chromosome_paternal
            .sequence
            .iter()
            .map(|n| format!("{:?}", n))
            .collect();

        assert_ne!(m_seq, p_seq); // L'enfant est unique, un mix de ses deux parents
    }
}
