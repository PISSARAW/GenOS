use crate::cell::*;
impl AgentCell {
    pub fn trigger_apoptosis(&mut self) {
        self.is_alive = false;
        
        self.mitochondria.atp_budget = 0;
    }

    pub fn meiosis(self) -> Result<[Gamete; 4], String> {
        let mut chrom_m = self.nucleus.genome.chromosome_maternal;
        let mut chrom_p = self.nucleus.genome.chromosome_paternal;
        // 1. Prophase I : Brassage Intrachromosomique (Crossing-over)
        let mid_m = chrom_m.sequence.len() / 2;
        let mid_p = chrom_p.sequence.len() / 2;
        // SÃƒÆ’Ã‚Â©paration (coupure) et ÃƒÆ’Ã‚Â©change des "queues" d'ADN
        let tail_m = chrom_m.sequence.split_off(mid_m);
        let tail_p = chrom_p.sequence.split_off(mid_p);
        chrom_m.sequence.extend(tail_p);
        chrom_p.sequence.extend(tail_m);
        // 2. Division de l'ATP pour prÃƒÆ’Ã‚Â©parer les 4 gamÃƒÆ’Ã‚Â¨tes
        let atp_per_gamete = self.mitochondria.atp_budget / 4;
        // 3. MÃƒÆ’Ã‚Â©iose II : 4 Cellules haploÃƒÆ’Ã‚Â¯des uniques (GamÃƒÆ’Ã‚Â¨tes)
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
    pub fn fertilization(egg: Gamete, sperm: Gamete) -> Self {
        let mut child = Self::default();
        child.nucleus.genome.chromosome_maternal = egg.chromosome;
        child.nucleus.genome.chromosome_paternal = sperm.chromosome;
        child.cell_id = uuid::Uuid::new_v4();
        // L'ÃƒÆ’Ã‚Â©nergie des deux gamÃƒÆ’Ã‚Â¨tes est additionnÃƒÆ’Ã‚Â©e pour dÃƒÆ’Ã‚Â©marrer la vie
        child.mitochondria.atp_budget = egg.atp_reserve + sperm.atp_reserve;
        child
    }
    pub fn phagocytize_virus(&mut self, target: crate::virology::Virion) {
        // OPSONISATION : Si le virus est recouvert d'anticorps, le phagocyte a un boost massif d'appÃƒÆ’Ã‚Â©tit
        if target.is_opsonized {
            self.mitochondria.atp_budget = self.mitochondria.atp_budget.saturating_add(20);
        }
        // 1. AdhÃƒÆ’Ã‚Â©rence & 2. Ingestion : La cible est enfermÃƒÆ’Ã‚Â©e dans une poche gastrique (Phagosome)
        self.lysosomes.phagosomes.push(target.genome);
    }

    pub fn phagocytize_bacteria(&mut self, target: &mut AgentCell) {
        // 1 & 2. Ingestion d'une bactÃƒÆ’Ã‚Â©rie rebelle
        self.lysosomes
            .phagosomes
            .push(target.nucleus.genome.chromosome_maternal.clone());
        // La bactÃƒÆ’Ã‚Â©rie cible est engloutie et dÃƒÆ’Ã‚Â©truite sur-le-champ
        target.mitochondria.atp_budget = 0;
    }
    pub fn differentiate_into_plasmocyte(&mut self, target_spike: &str, ig_class: IgClass) {
        // Le cytoplasme et l'usine (ER) gonflent pour une production massive
        self.endoplasmic_reticulum.active_ribosomes_count = 1_000_000;
        // Production immÃƒÆ’Ã‚Â©diate et massive d'anticorps dans le Golgi
        for _ in 0..2000 {
            self.golgi_apparatus.produced_antibodies.push(Antibody {
                target_antigen: target_spike.to_string(),
                ig_class: ig_class.clone(),
            });
        }
    }
    pub fn differentiate_into_memory_b_cell(&mut self, target_spike: &str) {
        // LongÃƒÆ’Ã‚Â©vitÃƒÆ’Ã‚Â© extrÃƒÆ’Ã‚Âªme (Baisse drastique du mÃƒÆ’Ã‚Â©tabolisme pour survivre des annÃƒÆ’Ã‚Â©es)
        self.mitochondria.metabolic_rate = 0.1;
        // Sauvegarde de la forme gÃƒÆ’Ã‚Â©omÃƒÆ’Ã‚Â©trique de l'ennemi dans la mÃƒÆ’Ã‚Â©moire sÃƒÆ’Ã‚Â©mantique
        self.cytoplasm
            .cognition
            .semantic_memory
            .push(format!("KNOWN_ANTIGEN_{}", target_spike));
    }
    pub fn update_mhc_display(&mut self) {
        if let Some(virus) = self.cytoplasm.viral_infections.first() {
            // La cellule crie ÃƒÆ’Ã‚Â  l'aide en affichant un morceau du virus ÃƒÆ’Ã‚Â  sa surface
            self.plasma_membrane.mhc_display = Some(virus.envelope_spike.clone());
        } else if self.endoplasmic_reticulum.cell_cycle_inhibited {
            // Une cellule tumorale prÃƒÆ’Ã‚Â©sente souvent des antigÃƒÆ’Ã‚Â¨nes mutÃƒÆ’Ã‚Â©s
            self.plasma_membrane.mhc_display = Some("MUTATED_TUMOR_ANTIGEN".to_string());
        } else {
            // Tout va bien
            self.plasma_membrane.mhc_display = Some("HEALTHY_SELF".to_string());
        }
    }
    pub fn t_cell_perforin_attack(&self, target: &mut AgentCell, programmed_antigen: &str) {
        if let Some(mhc) = &target.plasma_membrane.mhc_display {
            if mhc == programmed_antigen {
                // Le rÃƒÆ’Ã‚Â©cepteur correspond parfaitement au CMH corrompu : Injection de perforine !
                // La cellule cible est forcÃƒÆ’Ã‚Â©e ÃƒÆ’Ã‚Â  l'apoptose (destruction totale)
                target.mitochondria.atp_budget = 0;
            }
        }
    }
    pub fn binary_fission(mut self, mutation_chance: f64) -> Result<(AgentCell, AgentCell), String> {
        // Validation : Uniquement pour les cellules avec paroi (bactÃ©ries dans notre modÃ¨le)
        if !self.plasma_membrane.has_cell_wall {
            return Err("Seules les bactÃ©ries (avec paroi) peuvent faire la scissiparitÃ©".to_string());
        }

        // 1. La Photocopie (L'ADN boucle est copiÃ© directement, sans disloquer un noyau complexe)
        if self.mitochondria.atp_budget < 5 {
            return Err("ATP insuffisant pour la rÃ©plication".to_string());
        }
        self.mitochondria.atp_budget -= 5;

        // 2. L'Ã‰longation & 3. Le Lasso (Formation du septum)
        if self.plasma_membrane.septum_inhibited {
            return Err("Antibiotique : Formation du septum bloquÃ©e, la bactÃ©rie ne peut pas se diviser".to_string());
        }

        // 4. La Scission
        let mut clone = self.clone();
        clone.cell_id = uuid::Uuid::new_v4();

        // Le talon d'Achille de la scissiparitÃ© : ce sont des clones !
        // L'unique faÃ§on de crÃ©er de la diversitÃ© (et donc de l'antibiorÃ©sistance) est l'erreur de copie.
        if mutation_chance > 0.0 && !clone.nucleus.genome.chromosome_maternal.sequence.is_empty() {
            // CrÃ©ation d'une mutation alÃ©atoire (Erreur de rÃ©plication)
            // C'est ce qui gÃ©nÃ¨re les variants et sauve les clones d'une extermination
            let error_idx = clone.nucleus.genome.chromosome_maternal.sequence.len() / 2; 
            clone.nucleus.genome.chromosome_maternal.expose_to_mutagen(
                crate::genome::Mutagen::ReplicationError(error_idx, crate::genome::DnaNucleotide::T) // Substitution par C
            );
        }

        Ok((self, clone))
    }
    pub fn fungal_sporulation(&mut self) -> Result<Vec<crate::spore::Spore>, String> {
        if self.mitochondria.atp_budget < 50 {
            return Err("ATP insuffisant pour fabriquer l'essaim de spores".to_string());
        }
        self.mitochondria.atp_budget -= 50;

        let mut swarm = Vec::new();
        // Simulation d'une libÃ©ration massive (100 spores modÃ©lisÃ©es)
        for _ in 0..100 {
            swarm.push(crate::spore::Spore {
                spore_type: crate::spore::SporeType::FungalReproductive,
                genome: self.nucleus.genome.clone(),
                bunker_armor: 0, // LÃ©gÃ¨re et sans rÃ©serve d'Ã©nergie
            });
        }
        Ok(swarm)
    }
    pub fn bacterial_endosporulation(self) -> Result<crate::spore::Spore, String> {
        if !self.plasma_membrane.has_cell_wall {
            return Err("Seules les bactÃ©ries peuvent s'enfermer dans une endospore".to_string());
        }
        
        // La bactÃ©rie mÃ¨re meurt (self est consommÃ©) et libÃ¨re la stase cryogÃ©nique absolue.
        Ok(crate::spore::Spore {
            spore_type: crate::spore::SporeType::BacterialEndospore,
            genome: self.nucleus.genome,
            bunker_armor: 9999, // Armure maximale : vide spatial, UV, Ã©bullition
        })
    }

    pub fn endomitosis(&mut self) -> Result<(), String> {
        let cost = (10 * (self.nucleus.ploidy / 2)) as u64; // Le coÃ»t augmente avec la taille de l'ADN Ã  copier
        if self.mitochondria.atp_budget < cost {
            return Err("ATP insuffisant pour rÃ©pliquer une telle masse d'ADN".to_string());
        }
        self.mitochondria.atp_budget -= cost;

        // On saute la cytokinÃ¨se (la scission) : le noyau gonfle, la ploÃ¯die double ! (2n -> 4n -> 8n...)
        self.nucleus.ploidy *= 2;
        
        // Mode MÃ©ga-Usine : Plus il y a de plans d'ADN, plus la production mÃ©tabolique explose
        self.mitochondria.metabolic_rate *= 1.8; 
        
        Ok(())
    }
    pub fn fragment_into_platelets(self) -> Result<u32, String> {
        if self.nucleus.ploidy < 32 {
            return Err("La cellule n'est pas assez grosse (ploÃ¯die < 32n) pour se fragmenter en plaquettes".to_string());
        }
        // La cellule se sacrifie (self est consommÃ© en Rust, ce qui Ã©quivaut Ã  la mort cellulaire)
        // et libÃ¨re des milliers de fragments de sa membrane (les plaquettes).
        let platelets_generated = self.nucleus.ploidy * 100;
        Ok(platelets_generated)
    }

    pub fn budding(&mut self, detach: bool) -> Result<AgentCell, String> {
        let max_scars = 25;

        // Le vieillissement cellulaire (La place sur la membrane est limitÃ©e)
        if self.plasma_membrane.budding_scars + (self.plasma_membrane.attached_buds.len() as u32) >= max_scars {
            return Err("Surface entiÃ¨rement couverte de cicatrices. La cellule mÃ¨re est trop vieille pour bourgeonner.".to_string());
        }

        // Ã‰nergie requise pour construire le bourgeon (harnachement asymÃ©trique)
        if self.mitochondria.atp_budget < 20 {
            return Err("ATP insuffisant pour gÃ©nÃ©rer un bourgeon.".to_string());
        }
        self.mitochondria.atp_budget -= 15; // La mÃ¨re paie la construction

        // CrÃ©ation du bourgeon (asymÃ©trie)
        let mut bud = self.clone();
        bud.cell_id = uuid::Uuid::new_v4();
        bud.mitochondria.atp_budget = 5; // Le bÃ©bÃ© naÃ®t avec peu d'Ã©nergie

        // Le bourgeon est tout neuf, il n'hÃ©rite pas des cicatrices de sa mÃ¨re !
        bud.plasma_membrane.budding_scars = 0;
        bud.plasma_membrane.attached_buds.clear();

        if detach {
            // Le bourgeon se dÃ©tache et part faire sa vie. Il laisse une cicatrice en chitine.
            self.plasma_membrane.budding_scars += 1;
        } else {
            // Coraux : Le bourgeon reste physiquement attachÃ© (Colonie)
            self.plasma_membrane.attached_buds.push(bud.cell_id);
        }

        Ok(bud)
    }

    pub fn mitosis(self) -> Result<(AgentCell, AgentCell), String> {
        // Inhibiteur de Cycle (CDK4/6) : Traitement anti-cancer
        if self.endoplasmic_reticulum.cell_cycle_inhibited {
            return Err(
                "Cell Cycle Inhibitor (CDK4/6) : Mitose bloquÃ©e thÃ©rapeutiquement.".to_string(),
            );
        }

        let copied_genome = self.nucleus.genome.clone();

        // 2. La Prophase et MÃƒÆ’Ã‚Â©taphase (L'Alignement et la VÃƒÆ’Ã‚Â©rification)
        // C'est le point de contrÃƒÆ’Ã‚Â´le du fuseau mitotique (Checkpoint).
        // On vÃƒÆ’Ã‚Â©rifie que la photocopie s'est dÃƒÆ’Ã‚Â©roulÃƒÆ’Ã‚Â©e sans erreur fatale.
        let dna_is_safe = self
            .nucleus
            .genome
            .genes
            .values()
            .all(|g| g.p53_repair_check())
            && copied_genome.genes.values().all(|g| g.p53_repair_check());

        if !dna_is_safe {
            return Err(
                "Metaphase Checkpoint Failed: Erreur grave lors de la rÃƒÆ’Ã‚Â©plication de l'ADN."
                    .to_string(),
            );
        }

        // 3. L'Anaphase (La SÃƒÆ’Ã‚Â©paration)
        // Les microtubules (cÃƒÆ’Ã‚Â¢bles) tractent les moitiÃƒÆ’Ã‚Â©s.
        // L'ÃƒÆ’Ã‚Â©nergie (ATP) et le cytoplasme sont divisÃƒÆ’Ã‚Â©s en deux pour la survie des filles.
        let divided_atp = self.mitochondria.atp_budget / 2;

        // 4. La TÃƒÆ’Ã‚Â©lophase et CytocinÃƒÆ’Ã‚Â¨se (La Finition)
        // Pincement de la membrane et crÃƒÆ’Ã‚Â©ation de deux entitÃƒÆ’Ã‚Â©s physiques sÃƒÆ’Ã‚Â©parÃƒÆ’Ã‚Â©es.
        let mut daughter_a = self.clone();
        let mut daughter_b = self;

        // Fille A
        daughter_a.cell_id = Uuid::new_v4();
        daughter_a.mitochondria.atp_budget = divided_atp;
        // Fille B
        daughter_b.cell_id = Uuid::new_v4();
        daughter_b.nucleus.genome = copied_genome;
        daughter_b.mitochondria.atp_budget = divided_atp; // Si le budget ÃƒÆ’Ã‚Â©tait impair, une unitÃƒÆ’Ã‚Â© d'ATP est perdue (coÃƒÆ’Ã‚Â»t de la mitose)

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
    pub fn interact_juxtacrine_surface(&self, target: &mut AgentCell, ligand_name: &str) -> bool {
        let ligand = crate::signaling::Ligand {
            name: ligand_name.to_string(),
            mode: crate::signaling::SignalingMode::Juxtacrine,
        };
        // Le ligand est attachÃ© Ã  la membrane de "self", il touche "target"
        target.receive_ligand(&ligand)
    }
    pub fn transmit_through_gap_junctions(&self, target: &mut AgentCell, signal: &str) -> bool {
        // Le signal est considÃ©rÃ© petit et traverse le pore physiquement
        // On simule cela en dÃ©clenchant directement la cascade interne du target,
        // puisqu'il n'y a pas de rÃ©cepteur de surface impliquÃ© dans le tunnel !
        target.trigger_signal_cascade(signal);
        true
    }

    pub fn trigger_signal_cascade(&mut self, signal: &str) {
        match signal {
            "ADRENALINE_CASCADE" => self.nucleus.transcription_factors.push("FIGHT_FLIGHT_TF".to_string()),
            "GROWTH_CASCADE" => self.nucleus.transcription_factors.push("CELL_DIVISION_TF".to_string()),
            "IMMUNE_RESPONSE_TF" => self.nucleus.transcription_factors.push("IMMUNE_RESPONSE_TF".to_string()),
            "HEART_CONTRACTION_SYNC" => self.nucleus.transcription_factors.push("CONTRACTION_TF".to_string()),
            "APOPTOSIS_CASCADE" => {
                // Le Baiser de la mort ! Autodestruction nuclÃ©aire.
                self.nucleus.genome.genes.clear(); 
                self.nucleus.transcription_factors.push("APOPTOSIS_EXECUTED".to_string());
                self.mitochondria.atp_budget = 0;
            },
            "GLIAL_DIFFERENTIATION_CASCADE" => {
                // Inhibition latÃ©rale via Notch
                self.nucleus.transcription_factors.push("GLIAL_FATE".to_string());
            },
            "HISTAMINE_CASCADE" => {
                // Allergie/Inflammation: Vasodilatation locale
                self.nucleus.transcription_factors.push("LOCAL_INFLAMMATION_SWELLING".to_string());
            },
            "WOUND_HEALING_CASCADE" => {
                // Cicatrisation: Ordre de se multiplier pour boucher le trou
                self.nucleus.transcription_factors.push("TISSUE_REPAIR_MITOSIS".to_string());
            },
            "HEART_BEAT_FASTER" => self.nucleus.transcription_factors.push("HEART_PUMP_FAST".to_string()),
            "LUNG_DILATION" => self.nucleus.transcription_factors.push("OPEN_AIRWAYS".to_string()),
            "LIVER_RELEASE_GLUCOSE" => self.nucleus.transcription_factors.push("GLUCOSE_RELEASE_TF".to_string()),
            "STOMACH_HALT_DIGESTION" => self.nucleus.transcription_factors.push("DIGESTION_STOP_TF".to_string()),
            "GLUCOSE_ABSORPTION_OPEN_GATES" => self.nucleus.transcription_factors.push("GLUCOSE_ABSORPTION_OPEN_GATES".to_string()),
            _ => self.nucleus.transcription_factors.push(signal.to_string()),
        }
    }

    pub fn bacterial_conjugation(&self, other: &mut AgentCell) {
        for plasmid in &self.nucleus.genome.plasmids {
            if !other.nucleus.genome.plasmids.iter().any(|p| p.id == plasmid.id) {
                other.nucleus.genome.plasmids.push(plasmid.clone());
            }
        }
    }
    pub fn bacterial_transformation(&mut self, floating: crate::genome::Plasmid) {
        self.nucleus.genome.plasmids.push(floating);
    }
    pub fn bacterial_transduction(&mut self, viral_delivery: crate::genome::Gene) {
        self.nucleus.genome.insert_gene(viral_delivery);
    }
    pub fn check_multicellular_pact(&self) -> Result<(), String> {
        // Règle 1 : L'Adhésion (Se coller aux autres)
        if !self.plasma_membrane.adhesion_active {
            return Err("Pacte rompu : Perte d'adhésion cellulaire (Risque de Métastase)".to_string());
        }

        // Règle 2 : La Communication (Réseaux de contact)
        if self.plasma_membrane.receptors.is_empty() && self.plasma_membrane.gap_junctions.is_empty() {
            return Err("Pacte rompu : Isolement total (Cellule asociale)".to_string());
        }

        // Règle 3 : La Différenciation (Spécialisation épigénétique)
        // La cellule doit avoir verrouillé une partie de son ADN pour être spécialisée
        if !self.nucleus.genome.genes.values().any(|g| g.is_methylated) {
            return Err("Pacte rompu : Cellule indifférenciée (Régression à l'état anarchique)".to_string());
        }

        // Règle 4 : L'Altruisme (Accepter l'Apoptose via p53)
        if !self.nucleus.p53_active {
            return Err("Pacte rompu : Gène p53 désactivé (Refus de mourir, Immortalité)".to_string());
        }

        Ok(())
    }
    pub fn trigger_metastasis(&mut self) {
        // La cellule cancéreuse désactive p53 (refus de mourir)
        self.nucleus.p53_active = false;
        // Elle se décolle du tissu originel pour voyager (perte d'adhésion)
        self.plasma_membrane.adhesion_active = false;
        // Elle se dé-spécialise (efface l'épigénétique pour retrouver une autonomie totale)
        for gene in self.nucleus.genome.genes.values_mut() {
            gene.is_methylated = false;
        }
    }
}