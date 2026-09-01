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
            septum_inhibited: false,
                immunized_against: vec![],
                mhc_display: Some("HEALTHY_SELF".to_string()),
                budding_scars: 0,
                attached_buds: vec![],
                receptors: vec![],
                gap_junctions: vec![],
            },
            nucleus: Nucleus {
                genome: Genome::new("Default DNA"),
                ploidy: 2,
            transcription_factors: Vec::new(),
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
                micro_rnas: vec![],
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

    /// La Scissiparité (Fission Binaire)
    /// Spécifique aux organismes unicellulaires (ex: Bactéries).
    /// Méthode ultra rapide, exponentielle. Produit des clones parfaits (sauf erreurs).
    pub fn binary_fission(mut self, mutation_chance: f64) -> Result<(AgentCell, AgentCell), String> {
        // Validation : Uniquement pour les cellules avec paroi (bactéries dans notre modèle)
        if !self.plasma_membrane.has_cell_wall {
            return Err("Seules les bactéries (avec paroi) peuvent faire la scissiparité".to_string());
        }

        // 1. La Photocopie (L'ADN boucle est copié directement, sans disloquer un noyau complexe)
        if self.mitochondria.atp_budget < 5 {
            return Err("ATP insuffisant pour la réplication".to_string());
        }
        self.mitochondria.atp_budget -= 5;

        // 2. L'Élongation & 3. Le Lasso (Formation du septum)
        if self.plasma_membrane.septum_inhibited {
            return Err("Antibiotique : Formation du septum bloquée, la bactérie ne peut pas se diviser".to_string());
        }

        // 4. La Scission
        let mut clone = self.clone();
        clone.cell_id = uuid::Uuid::new_v4();

        // Le talon d'Achille de la scissiparité : ce sont des clones !
        // L'unique façon de créer de la diversité (et donc de l'antibiorésistance) est l'erreur de copie.
        if mutation_chance > 0.0 && !clone.nucleus.genome.chromosome_maternal.sequence.is_empty() {
            // Création d'une mutation aléatoire (Erreur de réplication)
            // C'est ce qui génère les variants et sauve les clones d'une extermination
            let error_idx = clone.nucleus.genome.chromosome_maternal.sequence.len() / 2; 
            clone.nucleus.genome.chromosome_maternal.expose_to_mutagen(
                crate::genome::Mutagen::ReplicationError(error_idx, crate::genome::DnaNucleotide::T) // Substitution par C
            );
        }

        Ok((self, clone))
    }

    /// Le Bourgeonnement (Cellules isolées ou animaux coloniaux)
    /// Reproduction asymétrique : la mère crée un petit clone sur son flanc.
    /// detach : Si true (Levure, Hydre), le bourgeon se détache et laisse une cicatrice.
    ///            Si false (Coraux), le bourgeon reste attaché pour former une colonie.
    /// L'Endomitose (Endoréduplication)
    /// Le "piratage" de la mitose : la cellule réplique son ADN sans se diviser physiquement.
    /// Transforme la cellule en méga-usine (ex: Hépatocytes, Mégacaryocytes, Trophoblastes).
    /// La Sporulation Reproductive (L'essaim fongique)
    /// Le champignon mise sur la quantité : crée des millions de spores légères pour la dispersion par le vent.
    pub fn fungal_sporulation(&mut self) -> Result<Vec<crate::spore::Spore>, String> {
        if self.mitochondria.atp_budget < 50 {
            return Err("ATP insuffisant pour fabriquer l'essaim de spores".to_string());
        }
        self.mitochondria.atp_budget -= 50;

        let mut swarm = Vec::new();
        // Simulation d'une libération massive (100 spores modélisées)
        for _ in 0..100 {
            swarm.push(crate::spore::Spore {
                spore_type: crate::spore::SporeType::FungalReproductive,
                genome: self.nucleus.genome.clone(),
                bunker_armor: 0, // Légère et sans réserve d'énergie
            });
        }
        Ok(swarm)
    }

    /// L'Endosporulation de Survie (Le bunker de l'apocalypse Bactérien)
    /// La bactérie enferme son ADN dans un coffre-fort indestructible et sacrifie son corps.
    pub fn bacterial_endosporulation(self) -> Result<crate::spore::Spore, String> {
        if !self.plasma_membrane.has_cell_wall {
            return Err("Seules les bactéries peuvent s'enfermer dans une endospore".to_string());
        }
        
        // La bactérie mère meurt (self est consommé) et libère la stase cryogénique absolue.
        Ok(crate::spore::Spore {
            spore_type: crate::spore::SporeType::BacterialEndospore,
            genome: self.nucleus.genome,
            bunker_armor: 9999, // Armure maximale : vide spatial, UV, ébullition
        })
    }

    pub fn endomitosis(&mut self) -> Result<(), String> {
        let cost = (10 * (self.nucleus.ploidy / 2)) as u64; // Le coût augmente avec la taille de l'ADN à copier
        if self.mitochondria.atp_budget < cost {
            return Err("ATP insuffisant pour répliquer une telle masse d'ADN".to_string());
        }
        self.mitochondria.atp_budget -= cost;

        // On saute la cytokinèse (la scission) : le noyau gonfle, la ploïdie double ! (2n -> 4n -> 8n...)
        self.nucleus.ploidy *= 2;
        
        // Mode Méga-Usine : Plus il y a de plans d'ADN, plus la production métabolique explose
        self.mitochondria.metabolic_rate *= 1.8; 
        
        Ok(())
    }

    /// Spécificité des Mégacaryocytes (Moelle osseuse)
    /// La cellule géante (polyploïde) se fragmente volontairement pour créer les plaquettes sanguines.
    pub fn fragment_into_platelets(self) -> Result<u32, String> {
        if self.nucleus.ploidy < 32 {
            return Err("La cellule n'est pas assez grosse (ploïdie < 32n) pour se fragmenter en plaquettes".to_string());
        }
        // La cellule se sacrifie (self est consommé en Rust, ce qui équivaut à la mort cellulaire)
        // et libère des milliers de fragments de sa membrane (les plaquettes).
        let platelets_generated = self.nucleus.ploidy * 100;
        Ok(platelets_generated)
    }

    pub fn budding(&mut self, detach: bool) -> Result<AgentCell, String> {
        let max_scars = 25;

        // Le vieillissement cellulaire (La place sur la membrane est limitée)
        if self.plasma_membrane.budding_scars + (self.plasma_membrane.attached_buds.len() as u32) >= max_scars {
            return Err("Surface entièrement couverte de cicatrices. La cellule mère est trop vieille pour bourgeonner.".to_string());
        }

        // Énergie requise pour construire le bourgeon (harnachement asymétrique)
        if self.mitochondria.atp_budget < 20 {
            return Err("ATP insuffisant pour générer un bourgeon.".to_string());
        }
        self.mitochondria.atp_budget -= 15; // La mère paie la construction

        // Création du bourgeon (asymétrie)
        let mut bud = self.clone();
        bud.cell_id = uuid::Uuid::new_v4();
        bud.mitochondria.atp_budget = 5; // Le bébé naît avec peu d'énergie

        // Le bourgeon est tout neuf, il n'hérite pas des cicatrices de sa mère !
        bud.plasma_membrane.budding_scars = 0;
        bud.plasma_membrane.attached_buds.clear();

        if detach {
            // Le bourgeon se détache et part faire sa vie. Il laisse une cicatrice en chitine.
            self.plasma_membrane.budding_scars += 1;
        } else {
            // Coraux : Le bourgeon reste physiquement attaché (Colonie)
            self.plasma_membrane.attached_buds.push(bud.cell_id);
        }

        Ok(bud)
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

    pub fn receive_ligand(&mut self, ligand: &crate::signaling::Ligand) -> bool {
        let mut triggered = false;
        let cascades: Vec<String> = self.plasma_membrane.receptors.iter()
            .filter(|r| r.target_ligand == ligand.name)
            .map(|r| r.internal_cascade_signal.clone())
            .collect();
        for cascade in cascades {
            self.trigger_signal_cascade(&cascade);
            triggered = true;
        }
        triggered
    }

    pub fn emit_autocrine(&mut self, ligand_name: &str) {
        let ligand = crate::signaling::Ligand {
            name: ligand_name.to_string(),
            mode: crate::signaling::SignalingMode::Autocrine,
        };
        self.receive_ligand(&ligand);
    }

    pub fn trigger_signal_cascade(&mut self, signal: &str) {
        match signal {
            "ADRENALINE_CASCADE" => self.nucleus.transcription_factors.push("FIGHT_FLIGHT_TF".to_string()),
            "GROWTH_CASCADE" => self.nucleus.transcription_factors.push("CELL_DIVISION_TF".to_string()),
            "IMMUNE_RESPONSE_TF" => self.nucleus.transcription_factors.push("IMMUNE_RESPONSE_TF".to_string()),
            "HEART_CONTRACTION_SYNC" => self.nucleus.transcription_factors.push("CONTRACTION_TF".to_string()),
            _ => self.nucleus.transcription_factors.push(signal.to_string()),
        }
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

    #[test]
    fn test_binary_fission_and_antibiotic_resistance() {
        let mut bacteria = AgentCell::default();
        bacteria.plasma_membrane.has_cell_wall = true;
        bacteria.nucleus.genome.chromosome_maternal = crate::genome::DnaStrand::synthesize("BACTERIE");
        bacteria.mitochondria.atp_budget = 10;

        // 1. Scission réussie sans mutation
        let (mut parent, mut clone1) = bacteria.clone().binary_fission(0.0).unwrap();
        assert_eq!(clone1.nucleus.genome.chromosome_maternal.sequence, parent.nucleus.genome.chromosome_maternal.sequence);
        assert_eq!(parent.mitochondria.atp_budget, 5); // Consommation d'ATP

        // 2. Blocage par un antibiotique ciblant le septum
        parent.plasma_membrane.septum_inhibited = true;
        parent.mitochondria.atp_budget = 10;
        let result = parent.clone().binary_fission(0.0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Formation du septum bloquée"));

        // 3. Antibiorésistance via l'erreur de réplication (mutation)
        parent.plasma_membrane.septum_inhibited = false;
        let (_, clone_mutant) = parent.binary_fission(1.0).unwrap(); // 1.0 = chance max de mutation
        // Le clone a muté, son génome n'est plus identique au parent !
        assert_ne!(clone_mutant.nucleus.genome.chromosome_maternal.sequence, clone1.nucleus.genome.chromosome_maternal.sequence);
    }
    #[test]
    fn test_budding_and_aging() {
        let mut yeast = AgentCell::default();
        yeast.mitochondria.atp_budget = 1000; // Beaucoup d'énergie

        // 1. Bourgeonnement normal (Détachement)
        let bud1 = yeast.budding(true).unwrap();
        assert_eq!(yeast.plasma_membrane.budding_scars, 1);
        assert_eq!(bud1.plasma_membrane.budding_scars, 0); // Le bébé naît sans cicatrices
        assert_eq!(bud1.mitochondria.atp_budget, 5); // Asymétrie

        // 2. Bourgeonnement Colonial (Coraux)
        let coral_bud = yeast.budding(false).unwrap();
        // Pas de cicatrice car pas de détachement
        assert_eq!(yeast.plasma_membrane.budding_scars, 1);
        // Mais enregistré dans la colonie
        assert_eq!(yeast.plasma_membrane.attached_buds.len(), 1);
        assert_eq!(yeast.plasma_membrane.attached_buds[0], coral_bud.cell_id);

        // 3. Vieillissement par bourgeonnement
        // On fait bourgeonner la mère jusqu'à la limite (25)
        for _ in 0..23 {
            yeast.budding(true).unwrap();
        }
        // Total : 1 + 1 (colonial) + 23 = 25 emplacements utilisés.
        assert_eq!(yeast.plasma_membrane.budding_scars, 24);
        assert_eq!(yeast.plasma_membrane.attached_buds.len(), 1);

        // La prochaine tentative doit échouer (Cellule trop vieille)
        let old_age_fail = yeast.budding(true);
        assert!(old_age_fail.is_err());
        assert!(old_age_fail.unwrap_err().contains("vieille"));
    }

    #[test]
    fn test_endomitosis_and_megakaryocytes() {
        let mut hepatocyte = AgentCell::default();
        hepatocyte.mitochondria.atp_budget = 1000;
        assert_eq!(hepatocyte.nucleus.ploidy, 2); // 2n normal
        
        let initial_metabolism = hepatocyte.mitochondria.metabolic_rate;

        // 1. Endomitose : Le foie (Hépatocyte) passe à 4n (Mega-usine)
        hepatocyte.endomitosis().unwrap();
        assert_eq!(hepatocyte.nucleus.ploidy, 4);
        assert!(hepatocyte.mitochondria.metabolic_rate > initial_metabolism); // La production explose

        // 2. Mégacaryocyte : On gonfle la cellule jusqu'à 32n ou 64n
        let mut megakaryocyte = hepatocyte.clone();
        megakaryocyte.endomitosis().unwrap(); // 8n
        megakaryocyte.endomitosis().unwrap(); // 16n
        
        // Tente de fragmenter trop tôt (échoue)
        let premature_fragmentation = megakaryocyte.clone().fragment_into_platelets();
        assert!(premature_fragmentation.is_err());
        assert!(premature_fragmentation.unwrap_err().contains("ploïdie < 32n"));

        megakaryocyte.endomitosis().unwrap(); // 32n ! La taille critique est atteinte.
        
        // La fragmentation détruit la cellule et crée les plaquettes sanguines (32 * 100 = 3200)
        let platelets = megakaryocyte.fragment_into_platelets().unwrap();
        assert_eq!(platelets, 3200);
    }







