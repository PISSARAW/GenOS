use crate::cell::AgentCell;
use crate::orchestrator::*;

impl Orchestrator {
    pub fn new(apoptosis_rule: Option<Expression>) -> Self {
        Self {
            apoptosis_rule,
            immune_system: ImmuneSystem::default(),
            endocrine_system: EndocrineSystem::default(),
            nervous_system: NervousSystem::default(),
            viral_environment: vec![],
        }
    }

    /// Applique les anticorps circulants sur les virus flottants dans le systÃƒÂ¨me
    pub fn process_humoral_immunity(
        &mut self,
        environmental_virions: &mut [crate::virology::Virion],
    ) {
        for antibody in &self.immune_system.circulating_antibodies {
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
                            self.immune_system.il6_level += 10.0; // Choc anaphylactique
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
                self.immune_system.il6_receptors_blocked = true;
            }
            SystemicTherapy::Corticosteroids(dose) => {
                // Baisse mÃƒÂ©canique de l'inflammation mais endort aussi le systÃƒÂ¨me
                self.endocrine_system.corticosteroid_level = dose;
                self.immune_system.il6_level = (self.immune_system.il6_level - (dose * 20.0)).max(0.0);
            }
            SystemicTherapy::IntensiveCareFluids => {
                // Vasopresseurs / Perfusions : On recharge brutalement l'ATP des organes
                for cell in patient_cells.iter_mut() {
                    cell.metabolism.mitochondria.atp_budget = cell.metabolism.mitochondria.atp_budget.saturating_add(20);
                }
            }
            SystemicTherapy::Antibiotic => {
                // Tue exclusivement les bactÃƒÂ©ries (Ceux avec une paroi).
                // Ignore totalement les cellules saines et les virus.
                for cell in patient_cells.iter_mut() {
                    if cell.plasma_membrane.has_cell_wall {
                        cell.metabolism.mitochondria.atp_budget = 0; // Lyse bactÃƒÂ©rienne
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
        if agent.nervous_system.is_some() && self.nervous_system.blood_brain_barrier_integrity > 0.5 {
            return;
        }
        match therapy {
            Therapy::TargetedTherapy => agent.plasma_membrane.receptors_blocked = true,
            Therapy::Immunotherapy => agent.cytoplasm.cognition.is_camouflaged = false,
            Therapy::AntiAngiogenesis => agent.metabolism.mitochondria.angiogenesis_blocked = true,
            Therapy::CellCycleInhibitor => agent.endoplasmic_reticulum.cell_cycle_inhibited = true,
        }
    }

    /// 1. Attachement et 2. PÃƒÂ©nÃƒÂ©tration
    /// Un virus dans l'environnement tente d'infecter la cellule.
    pub fn expose_to_virus(&self, agent: &mut AgentCell, virion: crate::virology::Virion) {
        if agent.nervous_system.is_some() && self.nervous_system.blood_brain_barrier_integrity > 0.5 {
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
        use crate::cell::events::{CellEvent, TherapyAction};

        let cortisol = self.endocrine_system.corticosteroid_level;
        agent.inbox.push(CellEvent::HormonalSignal(cortisol));
        
        let mut metabolic_cost = 1;
        if self.immune_system.il6_level >= 10.0 && !self.immune_system.il6_receptors_blocked {
            metabolic_cost = 5; 
        }
        if action_string == "REPLICATE" {
            metabolic_cost = 20;
        }
        agent.inbox.push(CellEvent::MetabolicStress(metabolic_cost));

        if let Some(ref _active_therapies) = agent.cytoplasm.cognition.epigenetic_drives.get("ActiveTherapies") {
            agent.inbox.push(CellEvent::ApplyTherapy(TherapyAction::BlockReceptors));
        }

        if let Some(rule) = &self.apoptosis_rule {
            if !agent.cytoplasm.cognition.is_camouflaged {
                if rule.evaluate(&agent.cytoplasm.cognition.epigenetic_drives) {
                    agent.inbox.push(CellEvent::ApplyTherapy(TherapyAction::InhibitCellCycle));
                    return TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string());
                }
            }
        }

        // --- THE CELL PROCESSES ITS OWN STATE IN ISOLATION ---
        agent.process_events();

        // --- ORCHESTRATOR COLLECTS RESULTS ---
        let outbox = std::mem::take(&mut agent.outbox);
        for event in outbox {
            match event {
                CellEvent::NecrosisTriggered(reason) => return TickResult::Halted(format!("Necrosis: {}", reason)),
                CellEvent::ApoptosisTriggered(reason) => return TickResult::Halted("Apoptosis".to_string()),
                CellEvent::Recovered(reason) => return TickResult::Halted(format!("Recovered: {}", reason)),
                CellEvent::Hijacked(reason) => return TickResult::Halted(reason),
                CellEvent::ReleaseVirus(v) => self.viral_environment.push(v),
                _ => {}
            }
        }
        
        agent.cytoplasm.trace.sequence.push(action_string.to_string());
        
        if let Some(nervous_system) = &mut agent.nervous_system {
            if let Some(outputs) = nervous_system.process_soma() {
                for (target_id, transmitter, amount) in outputs {
                    self.nervous_system.synaptic_cleft.push(CleftMessage {
                        source_id: agent.cell_id.to_string(),
                        target_id,
                        transmitter,
                        amount,
                        ticks_in_cleft: 0,
                    });
                }
            }
            nervous_system.apply_neuroplasticity();
        }
        
        if agent.metabolism.mitochondria.atp_budget == 0 {
             return TickResult::Halted("Budget exhausted (starvation)".to_string());
        }
        if agent.plasma_membrane.receptors_blocked {
             return TickResult::Halted("Targeted Therapy (Growth signal blocked)".to_string());
        }
        if self.endocrine_system.corticosteroid_level > 0.8 {
             return TickResult::Halted("Corticosteroid suppression: Cell activity frozen".to_string());
        }
        if !agent.cytoplasm.viral_infections.is_empty() {
             return TickResult::Halted("Hijacked: Cellular machinery is copying a virus".to_string());
        }
        if agent.endoplasmic_reticulum.cell_cycle_inhibited {
             // The test for cell cycle inhibitor expects mitosis to fail, not tick to halt.
        }

        TickResult::Continue
    }

    /// LA FENTE SYNAPTIQUE ET LA RECAPTURE (Le passage du message entre les neurones)
    pub fn process_synaptic_cleft(&mut self, agents: &mut [crate::cell::AgentCell]) {
        let mut messages_to_keep = vec![];
        let has_cocaine = self.nervous_system.psychoactive_drugs.contains(&PsychoactiveDrug::Cocaine);
        let has_alcohol = self.nervous_system.psychoactive_drugs.contains(&PsychoactiveDrug::Alcohol);
        let has_anxiolytic = self.nervous_system.psychoactive_drugs
            .contains(&PsychoactiveDrug::Anxiolytic);
        let has_caffeine = self.nervous_system.psychoactive_drugs
            .contains(&PsychoactiveDrug::Caffeine);

        for mut msg in self.nervous_system.synaptic_cleft.drain(..) {
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
                        target_agent.metabolism.mitochondria.atp_budget =
                            target_agent.metabolism.mitochondria.atp_budget.saturating_sub(50);
                    }
                }
                msg.ticks_in_cleft += 1;
                if msg.ticks_in_cleft < 10 {
                    messages_to_keep.push(msg);
                }
            }
        }
        self.nervous_system.synaptic_cleft = messages_to_keep;
    }
}





