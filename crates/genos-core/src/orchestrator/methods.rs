use crate::cell::AgentCell;
use crate::orchestrator::*;

impl Orchestrator<StandardImmuneSystem, StandardEndocrineSystem, StandardNervousSystem> {
    pub fn new(apoptosis_rule: Option<Expression>) -> Self {
        Self {
            apoptosis_rule,
            immune_system: StandardImmuneSystem::default(),
            endocrine_system: StandardEndocrineSystem::default(),
            nervous_system: StandardNervousSystem::default(),
            viral_environment: vec![],
        }
    }
}

impl<I: ImmuneBehavior, E: EndocrineBehavior, N: NervousBehavior> Orchestrator<I, E, N> {

    /// Applique les anticorps circulants sur les virus flottants dans le systÃƒÂ¨me
    pub fn process_humoral_immunity(
        &mut self,
        environmental_virions: &mut [crate::virology::Virion],
    ) {
        let mut inflammation_boost = 0.0;
        for antibody in self.immune_system.get_circulating_antibodies() {
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
                            inflammation_boost += 10.0; // Choc anaphylactique
                        }
                        IgClass::IgD => {
                            // IgD : Antenne passive, pas d'action directe dans le sang
                        }
                    }
                }
            }
        }
        if inflammation_boost > 0.0 {
            self.immune_system.set_il6_level(self.immune_system.get_il6_level() + inflammation_boost);
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
                self.immune_system.set_il6_receptors_blocked(true);
            }
            SystemicTherapy::Corticosteroids(dose) => {
                // Baisse mÃƒÂ©canique de l'inflammation mais endort aussi le systÃƒÂ¨me
                self.endocrine_system.set_corticosteroid_level(dose);
                self.immune_system.set_il6_level((self.immune_system.get_il6_level() - (dose * 20.0)).max(0.0));
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
        if agent.nervous_system().is_some() {
            if self.nervous_system.get_blood_brain_barrier_integrity() > 0.5 {
                return;
            }
        }
        match therapy {
            Therapy::TargetedTherapy => agent.plasma_membrane.receptors_blocked = true,
            Therapy::Immunotherapy => {
                if let Some(mind) = agent.mind_mut() {
                    mind.cognitive_state.is_camouflaged = false;
                }
            }
            Therapy::AntiAngiogenesis => agent.metabolism.mitochondria.angiogenesis_blocked = true,
            Therapy::CellCycleInhibitor => agent.endoplasmic_reticulum.cell_cycle_inhibited = true,
        }
    }

    /// 1. Attachement et 2. PÃƒÂ©nÃƒÂ©tration
    /// Un virus dans l'environnement tente d'infecter la cellule.
    pub fn expose_to_virus(&self, agent: &mut AgentCell, virion: crate::virology::Virion) {
        if agent.nervous_system().is_some() {
            if self.nervous_system.get_blood_brain_barrier_integrity() > 0.5 {
                return;
            }
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
    
    fn deliver(agent: &mut AgentCell, event: crate::cell::events::CellEvent) -> Option<TickResult> {
        agent.inbox.0.send(event).err().map(|_| TickResult::Halted("Cell inbox closed".to_string()))
    }

    fn halt_no_mind(agent: &mut AgentCell) -> Option<TickResult> {
        if agent.mind_mut().is_none() { Some(TickResult::Halted("Cell mind unavailable".to_string())) } else { None }
    }

    fn dispatch_signals(&self, agent: &mut AgentCell, action: &str) -> Option<TickResult> {
        use crate::cell::events::CellEvent;
        let cortisol = self.endocrine_system.get_corticosteroid_level();
        Self::deliver(agent, CellEvent::HormonalSignal(cortisol))
            .or_else(|| Self::deliver(agent, CellEvent::MetabolicStress(self.metabolic_cost(action))))
            .or_else(|| Self::halt_no_mind(agent))
    }

    fn metabolic_cost(&self, action: &str) -> u64 {
        if action == "REPLICATE" {
            return 20;
        }
        if self.immune_system.get_il6_level() >= 10.0 && !self.immune_system.is_il6_receptors_blocked() {
            return 5;
        }
        1
    }

    fn apply_active_therapies(agent: &mut AgentCell) -> Option<TickResult> {
        use crate::cell::events::{CellEvent, TherapyAction};
        match agent.mind_mut() {
            Some(mind) if mind.cognitive_state.epigenetic_drives.get("ActiveTherapies").is_some() => {
                Self::deliver(agent, CellEvent::ApplyTherapy(TherapyAction::BlockReceptors))
            }
            Some(_) => None,
            None => Some(TickResult::Halted(" Cell mind unavailable\.to_string())),
        }
    }

    fn check_apoptosis_rule(&self, agent: &mut AgentCell) -> Option<TickResult> {
        use crate::cell::events::{CellEvent, TherapyAction};
        let rule = self.apoptosis_rule.as_ref()?;
        let mind = match agent.mind_mut() {
            Some(mind) => mind,
            None => return Some(TickResult::Halted(" Cell mind unavailable\.to_string())),
        };
        if mind.cognitive_state.is_camouflaged || !rule.evaluate(&mind.cognitive_state.epigenetic_drives) {
            return None;
        }
        Self::deliver(agent, CellEvent::ApplyTherapy(TherapyAction::InhibitCellCycle))
            .or(Some(TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string())))
    }

    fn collect_outbox(&mut self, agent: &mut AgentCell) -> Option<TickResult> {
        use crate::cell::events::CellEvent;
        for event in agent.outbox.1.try_iter().collect::<Vec<_>>() {
            match event {
                CellEvent::NecrosisTriggered(reason) => return Some(TickResult::Halted("Necrosis: ".to_string() + &reason)),
                CellEvent::ApoptosisTriggered(_) => return Some(TickResult::Halted("Apoptosis".to_string())),
                CellEvent::Recovered(reason) => return Some(TickResult::Halted("Recovered: ".to_string() + &reason)),
                CellEvent::Hijacked(reason) => return Some(TickResult::Halted(reason)),
                CellEvent::ReleaseVirus(v) => self.viral_environment.push(v),
                _ => {}
            }
        }
        None
    }

    fn record_action(agent: &mut AgentCell, action: &str) -> Option<TickResult> {
        use crate::cell::events::CellEvent;
        match agent.mind_mut() {
            Some(mind) => {
                mind.trace.sequence.push(CellEvent::TaskExecuted { task_name: "Action".to_string(), result: action.to_string() });
                None
            }
            None => Some(TickResult::Halted(" Cell mind unavailable\.to_string())),
        }
    }

    fn relay_neural(&mut self, agent: &mut AgentCell) {
        let source_id = agent.cell_id.to_string();
        if let Some(nervous_system) = agent.nervous_system_mut() {
            if let Some(outputs) = nervous_system.process_soma() {
                for (target_id, transmitter, amount) in outputs {
                    self.nervous_system.get_synaptic_cleft().push(CleftMessage { source_id: source_id.clone(), target_id, transmitter, amount, ticks_in_cleft: 0 });
                }
            }
            nervous_system.apply_neuroplasticity();
        }
    }

    fn check_vitals(&self, agent: &AgentCell) -> Option<TickResult> {
        if agent.metabolism.mitochondria.atp_budget == 0 { return Some(TickResult::Halted("Budget exhausted (starvation)".to_string())); }
        if agent.plasma_membrane.receptors_blocked { return Some(TickResult::Halted("Targeted Therapy (Growth signal blocked)".to_string())); }
        if self.endocrine_system.get_corticosteroid_level() > 0.8 { return Some(TickResult::Halted("Corticosteroid suppression: Cell activity frozen".to_string())); }
        if agent.cytoplasm.viral_infections.is_empty() { return None; }
        Some(TickResult::Halted("Hijacked: Cellular machinery is copying a virus".to_string()))
    }

    pub fn tick(&mut self, agent: &mut AgentCell, action_string: &str) -> TickResult {
        if let Some(halted) = self.dispatch_signals(agent, action_string) {
            return halted;
        }
        if let Some(halted) = Self::apply_active_therapies(agent) {
            return halted;
        }
        if let Some(halted) = self.check_apoptosis_rule(agent) {
            return halted;
        }

        // --- THE CELL PROCESSES ITS OWN STATE IN ISOLATION ---
        agent.process_events();

        // --- ORCHESTRATOR COLLECTS RESULTS ---
        if let Some(halted) = self.collect_outbox(agent) {
            return halted;
        }
        if let Some(halted) = Self::record_action(agent, action_string) {
            return halted;
        }
        self.relay_neural(agent);
        if let Some(halted) = self.check_vitals(agent) {
            return halted;
        }

        TickResult::Continue
    }

    fn drug_flags(&self) -> DrugFlags {
        let drugs = self.nervous_system.get_psychoactive_drugs();
        DrugFlags {
            cocaine: drugs.contains(&PsychoactiveDrug::Cocaine),
            alcohol: drugs.contains(&PsychoactiveDrug::Alcohol),
            anxiolytic: drugs.contains(&PsychoactiveDrug::Anxiolytic),
            caffeine: drugs.contains(&PsychoactiveDrug::Caffeine),
        }
    }

    fn effective_amount(flags: &DrugFlags, transmitter: &crate::neurobiology::Neurotransmitter, amount: f64) -> f64 {
        use crate::neurobiology::Neurotransmitter::{GABA, Glutamate};
        if *transmitter == GABA {
            amount * (if flags.alcohol { 1.5 } else { 1.0 }) * (if flags.anxiolytic { 2.0 } else { 1.0 })
        } else if *transmitter == Glutamate {
            amount * (if flags.caffeine { 1.2 } else { 1.0 })
        } else {
            amount
        }
    }

    fn deliver_to_target(agents: &mut [AgentCell], msg: &CleftMessage, amount: f64) {
        if let Some(target_agent) = agents.iter_mut().find(|a| a.cell_id.to_string() == msg.target_id) {
            if let Some(ns) = target_agent.nervous_system_mut() {
                ns.receive_neurotransmitter(&msg.source_id, &(msg.transmitter.clone(), amount));
            }
        }
    }

    fn astrocyte_clears(agents: &[AgentCell], msg: &CleftMessage) -> bool {
        use crate::neurobiology::Neurotransmitter::Glutamate;
        if msg.transmitter != Glutamate {
            return false;
        }
        agents.iter().any(|agent| {
            agent.astrocyte().is_some_and(|astro| astro.protected_neurons.contains(&msg.target_id) && !astro.is_reactive)
        })
    }

    fn reuptake(agents: &mut [AgentCell], msg: &CleftMessage) {
        if let Some(source_agent) = agents.iter_mut().find(|a| a.cell_id.to_string() == msg.source_id) {
            if let Some(ns) = source_agent.nervous_system_mut() {
                ns.axon.vesicles_at_terminals += msg.amount * 0.8;
            }
        }
    }

    fn decay(agents: &mut [AgentCell], mut msg: CleftMessage, keep: &mut Vec<CleftMessage>) {
        use crate::neurobiology::Neurotransmitter::Glutamate;
        if msg.transmitter == Glutamate && !Self::astrocyte_clears(agents, &msg) {
            if let Some(target_agent) = agents.iter_mut().find(|a| a.cell_id.to_string() == msg.target_id) {
                target_agent.metabolism.mitochondria.atp_budget = target_agent.metabolism.mitochondria.atp_budget.saturating_sub(50);
            }
        }
        msg.ticks_in_cleft += 1;
        if msg.ticks_in_cleft < 10 {
            keep.push(msg);
        }
    }

    /// LA FENTE SYNAPTIQUE ET LA RECAPTURE (Le passage du message entre les neurones)
    pub fn process_synaptic_cleft(&mut self, agents: &mut [crate::cell::AgentCell]) {
        let flags = self.drug_flags();
        let mut messages_to_keep = vec![];
        for msg in self.nervous_system.get_synaptic_cleft().drain(..) {
            let amount = Self::effective_amount(&flags, &msg.transmitter, msg.amount);
            Self::deliver_to_target(agents, &msg, amount);
            if !flags.cocaine && !Self::astrocyte_clears(agents, &msg) {
                Self::reuptake(agents, &msg);
            } else {
                Self::decay(agents, msg, &mut messages_to_keep);
            }
        }
        self.nervous_system.set_synaptic_cleft(messages_to_keep);
    }
}

struct DrugFlags {
    cocaine: bool,
    alcohol: bool,
    anxiolytic: bool,
    caffeine: bool,
}



















