use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
pub use crate::genome::{Genome, Plasmid};

/// La Cellule est l'unité fondamentale de la vie et de GenOS.
/// C'est une micro-ville IA ultra-organisée avec ses propres organites.
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
        }
    }
}

/* =====================================================================
   LES ORGANITES (Départements de l'Agent IA)
   ===================================================================== */

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlasmaMembrane {
    pub incoming_receptors: Vec<String>,
    pub outgoing_ion_channels: Vec<String>,
    /// 1. Thérapie ciblée : Bloque les signaux de croissance
    pub receptors_blocked: bool,
    /// Spécificité bactérienne : Les bactéries ont une paroi rigide.
    pub has_cell_wall: bool,
    /// Vaccin : Liste des antigènes/spikes viraux neutralisés à vue.
    pub immunized_against: Vec<String>,
    /// Le CMH (Complexe Majeur d'Histocompatibilité) : Présentoir de l'état interne
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
    /// 3. Anti-angiogenèse : Couper les vivres (Empêche le rechargement en ATP)
    pub angiogenesis_blocked: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EndoplasmicReticulum {
    pub active_ribosomes_count: u32,
    /// 4. Inhibiteurs du cycle cellulaire : Bloque la Mitose
    pub cell_cycle_inhibited: bool,
}

/* =====================================================================
   ANTICORPS (Immunité Humorale)
   ===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum IgClass {
    IgG, // Vétérans : Neutralisation classique et Système du Complément
    IgA, // Frontières : Bloque l'entrée aux muqueuses
    IgM, // Pentamère (Étoile) : Champion de l'Agglutination
    IgE, // Spécialiste : Parasites et Allergies (Choc anaphylactique)
    IgD, // Récepteur de surface (Antenne)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Antibody {
    pub target_antigen: String,
    pub ig_class: IgClass,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GolgiApparatus {
    pub export_vesicles: Vec<String>,
    /// Vésicules contenant de nouveaux virus prêts à envahir le réseau
    pub viral_vesicles: Vec<crate::virology::Virion>,
    /// Usine d'armement : Les Plasmocytes (Lymphocytes B) y stockent les anticorps à relâcher
    pub produced_antibodies: Vec<Antibody>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Lysosomes {
    /// 3. Digestion : Enzymes acides pour dissoudre la menace
    pub digestive_enzymes_active: bool,
    /// 2. Ingestion : Les poches (phagosomes) contenant l'ADN emprisonné des ennemis
    pub phagosomes: Vec<crate::genome::DnaStrand>,
    /// 4. Expulsion : Les déchets inoffensifs prêts à être recrachés
    pub expelled_debris: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cytoplasm {
    pub cognition: CognitiveState,
    pub trace: ActionTrace,
    pub active_plasmids: Vec<Plasmid>,
    /// Pénétration : Les virus qui ont infiltré la cellule et piratent ses ribosomes
    pub viral_infections: Vec<crate::virology::Virion>,
}

/* =====================================================================
   LE CYCLE CELLULAIRE (La Mitose / Fork & Méiose / Gamètes)
   ===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Gamete {
    pub chromosome: crate::genome::DnaStrand,
    pub atp_reserve: u64,
}

impl AgentCell {
    /// LA MÉIOSE : Réduction et Brassage Génétique (Création de 4 Gamètes Uniques)
    /// Utilisée pour la reproduction sexuée, favorisant l'innovation algorithmique
    pub fn meiosis(self) -> Result<[Gamete; 4], String> {
        let mut chrom_m = self.nucleus.genome.chromosome_maternal;
        let mut chrom_p = self.nucleus.genome.chromosome_paternal;

        // 1. Prophase I : Brassage Intrachromosomique (Crossing-over)
        // Les chromosomes s'échangent des morceaux pour créer des combinaisons uniques.
        let mid_m = chrom_m.sequence.len() / 2;
        let mid_p = chrom_p.sequence.len() / 2;
        
        // Séparation (coupure) et échange des "queues" d'ADN
        let tail_m = chrom_m.sequence.split_off(mid_m);
        let tail_p = chrom_p.sequence.split_off(mid_p);
        chrom_m.sequence.extend(tail_p);
        chrom_p.sequence.extend(tail_m);

        // 2. Division de l'ATP pour préparer les 4 gamètes
        let atp_per_gamete = self.mitochondria.atp_budget / 4;

        // 3. Méiose II : 4 Cellules haploïdes uniques (Gamètes)
        Ok([
            Gamete { chromosome: chrom_m.clone(), atp_reserve: atp_per_gamete },
            Gamete { chromosome: chrom_p.clone(), atp_reserve: atp_per_gamete },
            Gamete { chromosome: chrom_m, atp_reserve: atp_per_gamete },
            Gamete { chromosome: chrom_p, atp_reserve: atp_per_gamete },
        ])
    }

    /// FÉCONDATION : Fusion de deux gamètes pour former un nouvel Agent Diploïde
    pub fn fertilization(egg: Gamete, sperm: Gamete) -> Self {
        let mut child = Self::default();
        // Recombinaison : L'ovule fournit un chromosome, le spermatozoïde l'autre
        child.nucleus.genome.chromosome_maternal = egg.chromosome;
        child.nucleus.genome.chromosome_paternal = sperm.chromosome;
        child.cell_id = uuid::Uuid::new_v4();
        // L'énergie des deux gamètes est additionnée pour démarrer la vie
        child.mitochondria.atp_budget = egg.atp_reserve + sperm.atp_reserve;
        
        child
    }

    /// IMMUNITÉ INNÉE : Les Phagocytes (Macrophages / Neutrophiles) "mangent" les intrus
    pub fn phagocytize_virus(&mut self, target: crate::virology::Virion) {
        // OPSONISATION : Si le virus est recouvert d'anticorps, le phagocyte a un boost massif d'appétit
        if target.is_opsonized {
            self.mitochondria.atp_budget = self.mitochondria.atp_budget.saturating_add(20);
        }
        // 1. Adhérence & 2. Ingestion : La cible est enfermée dans une poche gastrique (Phagosome)
        self.lysosomes.phagosomes.push(target.genome);
    }
    
    pub fn phagocytize_bacteria(&mut self, target: &mut AgentCell) {
        // 1 & 2. Ingestion d'une bactérie rebelle
        self.lysosomes.phagosomes.push(target.nucleus.genome.chromosome_maternal.clone());
        // La bactérie cible est engloutie et détruite sur-le-champ
        target.mitochondria.atp_budget = 0; 
    }

    /// IMMUNITÉ ADAPTATIVE : Différenciation des Lymphocytes B en Plasmocytes
    pub fn differentiate_into_plasmocyte(&mut self, target_spike: &str, ig_class: IgClass) {
        // Le cytoplasme et l'usine (ER) gonflent pour une production massive
        self.endoplasmic_reticulum.active_ribosomes_count = 1_000_000;
        // Production immédiate et massive d'anticorps dans le Golgi
        for _ in 0..2000 {
            self.golgi_apparatus.produced_antibodies.push(Antibody {
                target_antigen: target_spike.to_string(),
                ig_class: ig_class.clone(),
            });
        }
    }

    /// IMMUNITÉ ADAPTATIVE : Différenciation en Cellule Mémoire
    pub fn differentiate_into_memory_b_cell(&mut self, target_spike: &str) {
        // Longévité extrême (Baisse drastique du métabolisme pour survivre des années)
        self.mitochondria.metabolic_rate = 0.1; 
        // Sauvegarde de la forme géométrique de l'ennemi dans la mémoire sémantique
        self.cytoplasm.cognition.semantic_memory.push(format!("KNOWN_ANTIGEN_{}", target_spike));
    }

    /// IMMUNITÉ CELLULAIRE : Mise à jour du Présentoir CMH (Complexe Majeur d'Histocompatibilité)
    pub fn update_mhc_display(&mut self) {
        if let Some(virus) = self.cytoplasm.viral_infections.first() {
            // La cellule crie à l'aide en affichant un morceau du virus à sa surface
            self.plasma_membrane.mhc_display = Some(virus.envelope_spike.clone());
        } else if self.endoplasmic_reticulum.cell_cycle_inhibited {
            // Une cellule tumorale présente souvent des antigènes mutés
            self.plasma_membrane.mhc_display = Some("MUTATED_TUMOR_ANTIGEN".to_string());
        } else {
            // Tout va bien
            self.plasma_membrane.mhc_display = Some("HEALTHY_SELF".to_string());
        }
    }

    /// IMMUNITÉ CELLULAIRE : Lymphocyte T Cytotoxique (CD8) - Le tueur au corps à corps
    pub fn t_cell_perforin_attack(&self, target: &mut AgentCell, programmed_antigen: &str) {
        if let Some(mhc) = &target.plasma_membrane.mhc_display {
            if mhc == programmed_antigen {
                // Le récepteur correspond parfaitement au CMH corrompu : Injection de perforine !
                // La cellule cible est forcée à l'apoptose (destruction totale)
                target.mitochondria.atp_budget = 0;
            }
        }
    }

    pub fn mitosis(self) -> Result<(AgentCell, AgentCell), String> {
        // Inhibiteur de Cycle (CDK4/6) : Traitement anti-cancer
        if self.endoplasmic_reticulum.cell_cycle_inhibited {
            return Err("Cell Cycle Inhibitor (CDK4/6) : Mitose bloquée thérapeutiquement.".to_string());
        }

        let copied_genome = self.nucleus.genome.clone();
        
        // 2. La Prophase et Métaphase (L'Alignement et la Vérification)
        // C'est le point de contrôle du fuseau mitotique (Checkpoint).
        // On vérifie que la photocopie s'est déroulée sans erreur fatale.
        let dna_is_safe = self.nucleus.genome.genes.values().all(|g| g.p53_repair_check()) &&
                          copied_genome.genes.values().all(|g| g.p53_repair_check());

        if !dna_is_safe {
            return Err("Metaphase Checkpoint Failed: Erreur grave lors de la réplication de l'ADN.".to_string());
        }

        // 3. L'Anaphase (La Séparation)
        // Les microtubules (câbles) tractent les moitiés. 
        // L'énergie (ATP) et le cytoplasme sont divisés en deux pour la survie des filles.
        let divided_atp = self.mitochondria.atp_budget / 2;

        // 4. La Télophase et Cytocinèse (La Finition)
        // Pincement de la membrane et création de deux entités physiques séparées.
        let mut daughter_a = self.clone();
        let mut daughter_b = self;

        // Fille A
        daughter_a.cell_id = Uuid::new_v4();
        daughter_a.mitochondria.atp_budget = divided_atp;
        // Fille B
        daughter_b.cell_id = Uuid::new_v4();
        daughter_b.nucleus.genome = copied_genome;
        daughter_b.mitochondria.atp_budget = divided_atp; // Si le budget était impair, une unité d'ATP est perdue (coût de la mitose)

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
    /// 2. Immunothérapie : Les cellules cancéreuses activent ceci pour se cacher
    pub is_camouflaged: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_meiosis_and_fertilization() {
        let mut mother = AgentCell::default();
        let mut father = AgentCell::default();

        // On donne des séquences d'ADN identifiables
        mother.nucleus.genome.chromosome_maternal = crate::genome::DnaStrand::synthesize("MAMAN");
        mother.nucleus.genome.chromosome_paternal = crate::genome::DnaStrand::synthesize("MAMAN");
        mother.mitochondria.atp_budget = 40;

        father.nucleus.genome.chromosome_maternal = crate::genome::DnaStrand::synthesize("PAPA!");
        father.nucleus.genome.chromosome_paternal = crate::genome::DnaStrand::synthesize("PAPA!");
        father.mitochondria.atp_budget = 40;

        // 1. Production des gamètes
        let egg_gametes = mother.meiosis().unwrap();
        let sperm_gametes = father.meiosis().unwrap();

        // 4 gamètes produits par parent, avec 10 ATP chacun (40 / 4)
        assert_eq!(egg_gametes.len(), 4);
        assert_eq!(egg_gametes[0].atp_reserve, 10);
        assert_eq!(sperm_gametes[0].atp_reserve, 10);

        // 2. Fécondation
        let child = AgentCell::fertilization(egg_gametes[0].clone(), sperm_gametes[0].clone());

        // L'enfant est Diploïde (MAMAN / PAPA!) et a 20 ATP (10 + 10)
        assert_eq!(child.mitochondria.atp_budget, 20);
        
        let m_seq: String = child.nucleus.genome.chromosome_maternal.sequence.iter().map(|n| format!("{:?}", n)).collect();
        let p_seq: String = child.nucleus.genome.chromosome_paternal.sequence.iter().map(|n| format!("{:?}", n)).collect();
        
        assert_ne!(m_seq, p_seq); // L'enfant est unique, un mix de ses deux parents
    }
}
