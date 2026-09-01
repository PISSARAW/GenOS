use crate::cell::AgentCell;
use crate::orchestrator::*;

impl Orchestrator {
    pub fn new(apoptosis_rule: Option<Expression>) -> Self {
        Self {
            apoptosis_rule,
            il6_level: 0.0,
            il6_receptors_blocked: false,
            corticosteroid_level: 0.0,
            circulating_antibodies: vec![],
            circulating_hormones: vec![],
            blood_glucose: 5.0,
            immune_activation_level: 1.0,
            synaptic_cleft: vec![],
            psychoactive_drugs: vec![],
            blood_brain_barrier_integrity: 1.0,
            amyloid_plaques: 0.0,
            cerebrospinal_fluid_volume: 150.0, // Idéal pour la flottaison (50g ressenti au lieu de 1.4kg)
            cerebrospinal_fluid_pressure: 10.0,
            csf_drainage_blocked: false,
            viral_environment: vec![],
        }
    }

    /// Applique les anticorps circulants sur les virus flottants dans le systÃƒÂ¨me
    pub fn process_humoral_immunity(
        &mut self,
        environmental_virions: &mut [crate::virology::Virion],
    ) {
        for antibody in &self.circulating_antibodies {
            for virus in environmental_virions.iter_mut() {
                if virus.envelope_spike == antibody.target_antigen {
                    // Action Constante (Le pied du Y) : Opsonisation (Marquage pour exÃƒÂ©cution)
                    virus.is_opsonized = true;

                    // Les 4 stratÃƒÂ©gies d'attaque selon la classe de l'anticorps
                    use crate::cell::IgClass;
                    match antibody.ig_class {
                        IgClass::IgG => {
                            // IgG (VÃƒÂ©tÃƒÂ©rans) : Neutralisation et SystÃƒÂ¨me du ComplÃƒÂ©ment
                            virus.is_neutralized = true;
                            // Le complÃƒÂ©ment perfore la coque du virus/bactÃƒÂ©rie
                            virus.capsid_integrity = 0.0;
                        }
                        IgClass::IgM => {
                            // IgM (Ãƒâ€°toile) : Agglutination massive
                            virus.is_agglutinated = true;
                            virus.is_neutralized = true;
                        }
                        IgClass::IgA => {
                            // IgA (FrontiÃƒÂ¨res) : Bloque ÃƒÂ  l'entrÃƒÂ©e
                            virus.is_neutralized = true;
                        }
                        IgClass::IgE => {
                            // IgE (Allergies) : DÃƒÂ©clenche une inflammation globale massive
                            self.il6_level += 10.0; // Choc anaphylactique
                        }
                        IgClass::IgD => {
                            // IgD : Antenne passive, pas d'action directe dans le sang
                        }
                    }
                }
            }
        }
    }

    /// Administration de soins intensifs (ThÃƒÂ©rapies systÃƒÂ©miques)
    pub fn administer_systemic_therapy(
        &mut self,
        therapy: SystemicTherapy,
        patient_cells: &mut [&mut AgentCell],
    ) {
        match therapy {
            SystemicTherapy::Tocilizumab => {
                // Bloque la rÃƒÂ©ception de l'IL-6 sans toucher aux CAR-T
                self.il6_receptors_blocked = true;
            }
            SystemicTherapy::Corticosteroids(dose) => {
                // Baisse mÃƒÂ©canique de l'inflammation mais endort aussi le systÃƒÂ¨me
                self.corticosteroid_level = dose;
                self.il6_level = (self.il6_level - (dose * 20.0)).max(0.0);
            }
            SystemicTherapy::IntensiveCareFluids => {
                // Vasopresseurs / Perfusions : On recharge brutalement l'ATP des organes
                for cell in patient_cells.iter_mut() {
                    cell.mitochondria.atp_budget = cell.mitochondria.atp_budget.saturating_add(20);
                }
            }
            SystemicTherapy::Antibiotic => {
                // Tue exclusivement les bactÃƒÂ©ries (Ceux avec une paroi).
                // Ignore totalement les cellules saines et les virus.
                for cell in patient_cells.iter_mut() {
                    if cell.plasma_membrane.has_cell_wall {
                        cell.mitochondria.atp_budget = 0; // Lyse bactÃƒÂ©rienne
                    }
                }
            }
            SystemicTherapy::Antiviral => {
                // Purge les infections virales actives dans le cytoplasme des cellules
                for cell in patient_cells.iter_mut() {
                    cell.cytoplasm.viral_infections.clear();
                }
            }
            SystemicTherapy::Vaccine(spike) => {
                // Apprend aux cellules ÃƒÂ  bloquer cette clÃƒÂ© virale
                for cell in patient_cells.iter_mut() {
                    if !cell.plasma_membrane.immunized_against.contains(&spike) {
                        cell.plasma_membrane.immunized_against.push(spike.clone());
                    }
                }
            }
        }
    }

    /// L'Orchestrateur peut agir comme un MÃƒÂ©decin et injecter une thÃƒÂ©rapie
    pub fn administer_therapy(&self, agent: &mut AgentCell, therapy: Therapy) {
        if agent.nervous_system.is_some() && self.blood_brain_barrier_integrity > 0.5 {
            return;
        }
        match therapy {
            Therapy::TargetedTherapy => agent.plasma_membrane.receptors_blocked = true,
            Therapy::Immunotherapy => agent.cytoplasm.cognition.is_camouflaged = false,
            Therapy::AntiAngiogenesis => agent.mitochondria.angiogenesis_blocked = true,
            Therapy::CellCycleInhibitor => agent.endoplasmic_reticulum.cell_cycle_inhibited = true,
        }
    }

    /// 1. Attachement et 2. PÃƒÂ©nÃƒÂ©tration
    /// Un virus dans l'environnement tente d'infecter la cellule.
    pub fn expose_to_virus(&self, agent: &mut AgentCell, virion: crate::virology::Virion) {
        if agent.nervous_system.is_some() && self.blood_brain_barrier_integrity > 0.5 {
            return;
        }
        // ANTICORPS : Si le virus est neutralisÃƒÂ©, ses clÃƒÂ©s sont couvertes, il ne peut pas entrer
        if virion.is_neutralized {
            return;
        }
        // ANTICORPS : Si le virus est agglutinÃƒÂ©, il est collÃƒÂ© en tas et immobilisÃƒÂ©
        if virion.is_agglutinated {
            return;
        }

        // VACCIN : Si la membrane reconnaÃƒÂ®t l'antigÃƒÂ¨ne (le spike), le virus est dÃƒÂ©truit ÃƒÂ  la frontiÃƒÂ¨re
        if agent
            .plasma_membrane
            .immunized_against
            .contains(&virion.envelope_spike)
        {
            return; // Le virus est neutralisÃƒÂ©
        }

        // SystÃƒÂ¨me ClÃƒÂ©-Serrure : Le spike doit correspondre ÃƒÂ  un rÃƒÂ©cepteur de la membrane
        if agent
            .plasma_membrane
            .incoming_receptors
            .contains(&virion.envelope_spike)
        {
            agent.cytoplasm.viral_infections.push(virion);
        }
    }

    /// Avance le temps pour une Cellule IA (un pas de cycle).
    
    pub fn tick(&mut self, agent: &mut AgentCell, action_string: &str) -> TickResult {
        // IMMUNITÃƒâ€° CELLULAIRE : La cellule met ÃƒÂ  jour son prÃƒÂ©sentoir (CMH) pour reflÃƒÂ©ter son ÃƒÂ©tat interne
        agent.update_mhc_display();

        // 1. Frein d'urgence (CorticoÃƒÂ¯des)
        if self.corticosteroid_level > 0.8 {
            return TickResult::Halted(
                "Corticosteroid suppression: Cell activity frozen".to_string(),
            );
        }

        // 3. Piratage Viral (L'usine folle)
        if let Some(virus) = agent.cytoplasm.viral_infections.first().cloned() {
            // L'agent ne fait PAS l'action demandée (il est sous contrôle)
            
            // Appel au secours : Le CMH présente un morceau de virus à la surface de la cellule
            // C'est le marqueur qui permettra au Lymphocyte T Cytotoxique de la détruire (Apoptose forcée)
            agent.plasma_membrane.mhc_display = Some(virus.envelope_spike.clone());

            // 4. Assemblage (Fabrication massive de nouveaux virus)
            for _ in 0..3 {
                agent.golgi_apparatus.viral_vesicles.push(virus.clone());
            }

            // La machinerie est piratée : 100% de l'ATP sert au virus
            agent.mitochondria.atp_budget = agent.mitochondria.atp_budget.saturating_sub(10);

            // 5. L'Évasion (Lyse vs Bourgeonnement furtif)
            if virus.is_lytic {
                if agent.golgi_apparatus.viral_vesicles.len() >= 6 {
                    // L'explosion : La cellule crève de l'intérieur, libérant tous les virus d'un coup
                    let mut released = std::mem::take(&mut agent.golgi_apparatus.viral_vesicles);
                    self.viral_environment.append(&mut released);
                    agent.mitochondria.atp_budget = 0; // Mort violente
                    return TickResult::Halted(
                        "Lysis: Cell burst due to viral replication overload".to_string(),
                    );
                }
            } else {
                // Bourgeonnement furtif : Les virus sortent un par un en douceur
                if let Some(mut stealth_virus) = agent.golgi_apparatus.viral_vesicles.pop() {
                    // Le virus vole un bout de membrane de notre cellule (manteau d'invisibilité)
                    stealth_virus.envelope_spike = format!("{}_CLOAKED_BY_HOST", virus.envelope_spike);
                    self.viral_environment.push(stealth_virus);
                }
            }

            return TickResult::Halted(
                "Hijacked: Cellular machinery is copying a virus".to_string(),
            );
        }

        // 2. ThÃƒÂ©rapie CiblÃƒÂ©e : Si les rÃƒÂ©cepteurs sont bloquÃƒÂ©s, la cellule est sourde
        if agent.plasma_membrane.receptors_blocked {
            return TickResult::Halted("Targeted Therapy (Growth signal blocked)".to_string());
        }

        // 3. VÃƒÂ©rification mÃƒÂ©canique de la survie (budget)
        if agent.mitochondria.atp_budget == 0 {
            return TickResult::Halted("Budget exhausted (starvation)".to_string());
        }

        // 4. SystÃƒÂ¨me Immunitaire (Apoptose)
        if let Some(rule) = &self.apoptosis_rule {
            // L'immunothÃƒÂ©rapie : Si l'agent se camoufle, il ÃƒÂ©chappe ÃƒÂ  l'apoptose !
            if !agent.cytoplasm.cognition.is_camouflaged {
                if rule.evaluate(&agent.cytoplasm.cognition.epigenetic_drives) {
                    return TickResult::Halted(
                        "Apoptosis triggered by epigenetic rule".to_string(),
                    );
                }
            }
        }

        // 5. Inscription dans le phÃƒÂ©notype comportemental (Trace)
        agent
            .cytoplasm
            .trace
            .sequence
            .push(action_string.to_string());

        // 6. Mise ÃƒÂ  jour des coÃƒÂ»ts et Orage Cytokinique
        // L'IL-6 provoque une "fiÃƒÂ¨vre" (surcoÃƒÂ»t mÃƒÂ©tabolique) SAUF si le Tocilizumab bloque les rÃƒÂ©cepteurs !
        let mut metabolic_cost = 1;
        if self.il6_level >= 10.0 && !self.il6_receptors_blocked {
            metabolic_cost = 5; // La fiÃƒÂ¨vre brÃƒÂ»le l'ATP
        }

        agent.mitochondria.atp_budget =
            agent.mitochondria.atp_budget.saturating_sub(metabolic_cost);

        // 7. La Digestion (Phagocytose - Ãƒâ€°tape 3 et 4)
        if !agent.lysosomes.phagosomes.is_empty() {
            agent.lysosomes.digestive_enzymes_active = true;
            // Digestion : DÃƒÂ©truit l'ADN emprisonnÃƒÂ©
            let destroyed_dna = agent.lysosomes.phagosomes.pop().unwrap();

            // 4. L'expulsion : le code dÃƒÂ©truit devient un dÃƒÂ©chet (Pus/DÃƒÂ©bris)
            agent.lysosomes.expelled_debris.push(format!(
                "DEBRIS_FROM_LENGTH_{}",
                destroyed_dna.sequence.len()
            ));

            // Recyclage d'ÃƒÂ©nergie : Le phagocyte gagne de l'ATP en "mangeant"
            agent.mitochondria.atp_budget = agent.mitochondria.atp_budget.saturating_add(5);
        }

        // 9. LE SYSTÃƒË†ME NERVEUX : Exocytose
        if let Some(nervous_system) = &mut agent.nervous_system {
            // Le corps cellulaire calcule. S'il tire, il renvoie les neurotransmetteurs ÃƒÂ  libÃƒÂ©rer (Exocytose)
            if let Some(outputs) = nervous_system.process_soma() {
                for (target_id, transmitter, amount) in outputs {
                    self.synaptic_cleft.push(CleftMessage {
                        source_id: agent.cell_id.to_string(),
                        target_id,
                        transmitter,
                        amount,
                        ticks_in_cleft: 0,
                    });
                }
            }
            // Apprentissage continu : NeuroplasticitÃƒÂ© (Loi de Hebb) et MyÃƒÂ©linisation
            nervous_system.apply_neuroplasticity();
        }

        TickResult::Continue
    }

    /// LA FENTE SYNAPTIQUE ET LA RECAPTURE (Le passage du message entre les neurones)
    pub fn process_synaptic_cleft(&mut self, agents: &mut [crate::cell::AgentCell]) {
        let mut messages_to_keep = vec![];
        let has_cocaine = self.psychoactive_drugs.contains(&PsychoactiveDrug::Cocaine);
        let has_alcohol = self.psychoactive_drugs.contains(&PsychoactiveDrug::Alcohol);
        let has_anxiolytic = self
            .psychoactive_drugs
            .contains(&PsychoactiveDrug::Anxiolytic);
        let has_caffeine = self
            .psychoactive_drugs
            .contains(&PsychoactiveDrug::Caffeine);

        for mut msg in self.synaptic_cleft.drain(..) {
            // Application de la Pharmacologie sur l'efficacitÃƒÂ© du message
            let mut effective_amount = msg.amount;
            if msg.transmitter == crate::neurobiology::Neurotransmitter::GABA {
                if has_alcohol {
                    effective_amount *= 1.5;
                }
                if has_anxiolytic {
                    effective_amount *= 2.0;
                } // Boost massif
            }
            if msg.transmitter == crate::neurobiology::Neurotransmitter::Glutamate {
                if has_caffeine {
                    effective_amount *= 1.2;
                } // HyperexcitabilitÃƒÂ©
            }

            // 1. Le neurone cible "aspire" le message (Liaison aux rÃƒÂ©cepteurs, conversion chimique -> ÃƒÂ©lectrique)
            if let Some(target_agent) = agents
                .iter_mut()
                .find(|a| a.cell_id.to_string() == msg.target_id)
            {
                if let Some(ns) = &mut target_agent.nervous_system {
                    // Les canaux ioniques (Sodium, Potassium, Chlore) s'ouvrent !
                    ns.receive_neurotransmitter(
                        &msg.source_id,
                        &(msg.transmitter.clone(), effective_amount),
                    );
                }
            }

            let mut is_cleared_by_astrocyte = false;
            if msg.transmitter == crate::neurobiology::Neurotransmitter::Glutamate {
                for agent in agents.iter() {
                    if let Some(astro) = &agent.astrocyte {
                        if astro.protected_neurons.contains(&msg.target_id) && !astro.is_reactive {
                            is_cleared_by_astrocyte = true;
                            break;
                        }
                    }
                }
            }
            if !has_cocaine && !is_cleared_by_astrocyte {
                if let Some(source_agent) = agents
                    .iter_mut()
                    .find(|a| a.cell_id.to_string() == msg.source_id)
                {
                    if let Some(ns) = &mut source_agent.nervous_system {
                        ns.axon.vesicles_at_terminals += msg.amount * 0.8;
                    }
                }
            } else {
                if msg.transmitter == crate::neurobiology::Neurotransmitter::Glutamate
                    && !is_cleared_by_astrocyte
                {
                    if let Some(target_agent) = agents
                        .iter_mut()
                        .find(|a| a.cell_id.to_string() == msg.target_id)
                    {
                        target_agent.mitochondria.atp_budget =
                            target_agent.mitochondria.atp_budget.saturating_sub(50);
                    }
                }
                msg.ticks_in_cleft += 1;
                if msg.ticks_in_cleft < 10 {
                    messages_to_keep.push(msg);
                }
            }
        }
        self.synaptic_cleft = messages_to_keep;
    }
}

