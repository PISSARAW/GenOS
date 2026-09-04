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
            conscience: crate::orchestrator::conscience::Conscience::new(50.0, 100.0),
            vta: crate::orchestrator::vta::VentralTegmentalArea::new(0.5),
            ecology: crate::ecology::EvolutionaryEcology::new(),
        }
    }
}

impl<I: ImmuneBehavior, E: EndocrineBehavior, N: NervousBehavior> Orchestrator<I, E, N> {

    /// Fait appel à l'Arbitre de la Réalité via le CapsuleManager pour tester physiquement le VFS d'un agent.
    /// Applique la Punition Altruiste sur le Grand Registre de Réputation (ReputationLedger)
    /// si l'agent a soumis un code cassé ou trompeur.
    pub fn evaluate_branch_with_reality(&mut self, agent: &mut AgentCell, command: &str, args: &[&str]) {
        let capsule_manager = crate::orchestrator::capsule::CapsuleManager::default();
        
        let reality_passed = capsule_manager.arbitrate_reality(agent, command, args);

        if !reality_passed {
            // L'agent (ou son Critique) a validé un code défectueux.
            // On le punit socialement dans l'Écologie (La Punition Altruiste).
            self.ecology.reputation.penalize_collusion(&agent.cell_id.to_string(), 0.4);
            println!("⚖️ [Écologie] La confiance en l'Agent {} chute drastiquement. Il a échoué face à la thermodynamique.", agent.cell_id);
        } else {
            println!("⚖️ [Écologie] L'Agent {} a prouvé sa compétence. Sa réputation est préservée.", agent.cell_id);
        }
    }

    /// DÉCLENCHE LA DYNAMIQUE DE LA REINE ROUGE (Course aux Armements)
    /// Lie deux agents (un développeur et un testeur/attaquant) dans un jeu à somme nulle.
    pub fn spawn_red_queen_competition(&mut self, prey_id: &str, predator_id: &str) {
        self.ecology.red_queen = Some(crate::ecology::RedQueenDynamics {
            prey_id: prey_id.to_string(),
            predator_id: predator_id.to_string(),
        });
        println!("👑 [REINE ROUGE] Course aux armements engagée : La Proie (Dev) {} doit survivre aux tests du Prédateur (QA) {}.", prey_id, predator_id);
    }

    /// RÉSOUT LA DYNAMIQUE DE LA REINE ROUGE
    /// Si le testeur trouve une faille, le développeur meurt. Si le code résiste, le testeur meurt de faim.
    pub fn resolve_red_queen(&mut self, predator_wins: bool) -> Option<String> {
        if let Some(rq) = &self.ecology.red_queen {
            let resolution_msg = rq.resolve_competition(predator_wins);
            println!("{}", resolution_msg);
            
            // TODO: Dans une implémentation complète, on chercherait l'agent perdant
            // dans un registre (Vec<AgentCell>) pour forcer `agent.conscience.is_apoptotic = true`.
            
            self.ecology.red_queen = None; // Fin du duel
            return Some(resolution_msg);
        }
        None
    }

    /// Applique les anticorps circulants sur les virus flottants dans le systÃ¨me
    pub fn process_humoral_immunity(
        &mut self,
        environmental_virions: &mut [crate::virology::Virion],
    ) {
        let mut inflammation_boost = 0.0;
        for antibody in self.immune_system.get_circulating_antibodies() {
            for virus in environmental_virions.iter_mut() {
                if virus.envelope_spike == antibody.target_antigen {
                    // Action Constante (Le pied du Y) : Opsonisation (Marquage pour exÃ©cution)
                    virus.is_opsonized = true;

                    // Les 4 stratÃ©gies d'attaque selon la classe de l'anticorps
                    use crate::cell::IgClass;
                    match antibody.ig_class {
                        IgClass::IgG => {
                            // IgG (VÃ©tÃ©rans) : Neutralisation et SystÃ¨me du ComplÃ©ment
                            virus.is_neutralized = true;
                            // Le complÃ©ment perfore la coque du virus/bactÃ©rie
                            virus.capsid_integrity = 0.0;
                        }
                        IgClass::IgM => {
                            // IgM (Ã‰toile) : Agglutination massive
                            virus.is_agglutinated = true;
                            virus.is_neutralized = true;
                        }
                        IgClass::IgA => {
                            // IgA (FrontiÃ¨res) : Bloque Ã  l'entrÃ©e
                            virus.is_neutralized = true;
                        }
                        IgClass::IgE => {
                            // IgE (Allergies) : DÃ©clenche une inflammation globale massive
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

    /// Administration de soins intensifs (ThÃ©rapies systÃ©miques)
    pub fn administer_systemic_therapy(
        &mut self,
        therapy: SystemicTherapy,
        patient_cells: &mut [&mut AgentCell],
    ) {
        match therapy {
            SystemicTherapy::Tocilizumab => {
                // Bloque la rÃ©ception de l'IL-6 sans toucher aux CAR-T
                self.immune_system.set_il6_receptors_blocked(true);
            }
            SystemicTherapy::Corticosteroids(dose) => {
                // Baisse mÃ©canique de l'inflammation mais endort aussi le systÃ¨me
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
                // Tue exclusivement les bactÃ©ries (Ceux avec une paroi).
                // Ignore totalement les cellules saines et les virus.
                for cell in patient_cells.iter_mut() {
                    if cell.plasma_membrane.has_cell_wall {
                        cell.metabolism.mitochondria.atp_budget = 0; // Lyse bactÃ©rienne
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
                // Apprend aux cellules Ã  bloquer cette clÃ© virale
                for cell in patient_cells.iter_mut() {
                    if !cell.plasma_membrane.immunized_against.contains(&spike) {
                        cell.plasma_membrane.immunized_against.push(spike.clone());
                    }
                }
            }
        }
    }

    /// L'Orchestrateur peut agir comme un MÃ©decin et injecter une thÃ©rapie
    pub fn administer_therapy(&self, agent: &mut AgentCell, therapy: Therapy) {
        if agent.nervous_system().is_some() && self.nervous_system.get_blood_brain_barrier_integrity() > 0.5 {
            return;
        }
        match therapy {
            Therapy::TargetedTherapy => agent.plasma_membrane.receptors_blocked = true,
            Therapy::Immunotherapy => agent.mind_mut().unwrap().cognitive_state.is_camouflaged = false,
            Therapy::AntiAngiogenesis => agent.metabolism.mitochondria.angiogenesis_blocked = true,
            Therapy::CellCycleInhibitor => agent.endoplasmic_reticulum.cell_cycle_inhibited = true,
        }
    }

    /// 1. Attachement et 2. PÃ©nÃ©tration
    /// Un virus dans l'environnement tente d'infecter la cellule.
    pub fn expose_to_virus(&self, agent: &mut AgentCell, virion: crate::virology::Virion) {
        if agent.nervous_system().is_some() && self.nervous_system.get_blood_brain_barrier_integrity() > 0.5 {
            return;
        }
        // ANTICORPS : Si le virus est neutralisÃ©, ses clÃ©s sont couvertes, il ne peut pas entrer
        if virion.is_neutralized {
            return;
        }
        // ANTICORPS : Si le virus est agglutinÃ©, il est collÃ© en tas et immobilisÃ©
        if virion.is_agglutinated {
            return;
        }

        // VACCIN : Si la membrane reconnaÃ®t l'antigÃ¨ne (le spike), le virus est dÃ©truit Ã  la frontiÃ¨re
        if agent
            .plasma_membrane
            .immunized_against
            .contains(&virion.envelope_spike)
        {
            return; // Le virus est neutralisÃ©
        }

        // SystÃ¨me ClÃ©-Serrure : Le spike doit correspondre Ã  un rÃ©cepteur de la membrane
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

        let cortisol = self.endocrine_system.get_corticosteroid_level();
        agent.inbox.0.send(CellEvent::HormonalSignal(cortisol)).unwrap();
        
        let mut metabolic_cost = 1;
        if self.immune_system.get_il6_level() >= 10.0 && !self.immune_system.is_il6_receptors_blocked() {
            metabolic_cost = 5; 
        }
        if action_string == "REPLICATE" {
            metabolic_cost = 20;
        }
        agent.inbox.0.send(CellEvent::MetabolicStress(metabolic_cost)).unwrap();

        if let Some(ref _active_therapies) = agent.mind_mut().unwrap().cognitive_state.epigenetic_drives.get("ActiveTherapies") {
            agent.inbox.0.send(CellEvent::ApplyTherapy(TherapyAction::BlockReceptors)).unwrap();
        }

        if let Some(rule) = &self.apoptosis_rule {
            if !agent.mind_mut().unwrap().cognitive_state.is_camouflaged {
                if rule.evaluate(&agent.mind_mut().unwrap().cognitive_state.epigenetic_drives) {
                    agent.inbox.0.send(CellEvent::ApplyTherapy(TherapyAction::InhibitCellCycle)).unwrap();
                    return TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string());
                }
            }
        }

        // --- THE CELL PROCESSES ITS OWN STATE IN ISOLATION ---
        agent.process_events();

        // --- ORCHESTRATOR COLLECTS RESULTS ---
        let outbox: Vec<_> = agent.outbox.1.try_iter().collect();
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
        
        agent.mind_mut().unwrap().trace.sequence.push(crate::cell::events::CellEvent::TaskExecuted { task_name: action_string.to_string(), result: String::new() });
        
        let source_id = agent.cell_id.to_string();
        if let Some(nervous_system) = agent.nervous_system_mut() {
            if let Some(outputs) = nervous_system.process_soma() {
                for (target_id, transmitter, amount) in outputs {
                    self.nervous_system.get_synaptic_cleft().push(CleftMessage {
                        source_id: source_id.clone(),
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
        if self.endocrine_system.get_corticosteroid_level() > 0.8 {
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
        let has_cocaine = self.nervous_system.get_psychoactive_drugs().contains(&PsychoactiveDrug::Cocaine);
        let has_alcohol = self.nervous_system.get_psychoactive_drugs().contains(&PsychoactiveDrug::Alcohol);
        let has_anxiolytic = self.nervous_system.get_psychoactive_drugs()
            .contains(&PsychoactiveDrug::Anxiolytic);
        let has_caffeine = self.nervous_system.get_psychoactive_drugs()
            .contains(&PsychoactiveDrug::Caffeine);

        for mut msg in self.nervous_system.get_synaptic_cleft().drain(..) {
            // Application de la Pharmacologie sur l'efficacitÃ© du message
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
                } // HyperexcitabilitÃ©
            }

            // 1. Le neurone cible "aspire" le message (Liaison aux rÃ©cepteurs, conversion chimique -> Ã©lectrique)
            if let Some(target_agent) = agents
                .iter_mut()
                .find(|a| a.cell_id.to_string() == msg.target_id)
            {
                if let Some(ns) = target_agent.nervous_system_mut() {
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
                    if let Some(astro) = agent.astrocyte() {
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
                    if let Some(ns) = source_agent.nervous_system_mut() {
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
        self.nervous_system.set_synaptic_cleft(messages_to_keep);
    }

    /// HYPER-FORK : Clonage asynchrone (Copy-on-Write) d'une cellule pour explorer plusieurs hypothèses.
    /// Retourne les clones générés.
    pub fn hyper_fork(&self, parent_cell: &AgentCell, nb_branches: usize) -> Vec<AgentCell> {
        let mut branches = Vec::with_capacity(nb_branches);
        let split_budget = parent_cell.conscience.current_budget / (nb_branches as f64);

        for _i in 0..nb_branches {
            let mut clone = parent_cell.clone();
            
            // 1. Identité persistante et indépendante
            clone.cell_id = uuid::Uuid::new_v4();
            
            // 2. Héritage budgétaire (division du budget pour éviter l'explosion combinatoire)
            clone.conscience.current_budget = split_budget;
            
            // 3. Reset de la dissonance (une nouvelle branche part avec une ardoise vierge)
            clone.conscience.dissonance_level = 0.0;
            clone.conscience.is_apoptotic = false;

            // 4. Deep clone de l'Hippocampus (KuzuDB/LadybugDB)
            // Copie physique du fichier de base de données pour garantir l'isolation parfaite.
            let cell_id_str = clone.cell_id.to_string();
            if let Some(mind) = clone.mind_mut() {
                if let Some(graph_mem) = &mut mind.cognitive_state.hippocampus {
                    let new_graph_mem = graph_mem.fork(&cell_id_str);
                    mind.cognitive_state.hippocampus = Some(new_graph_mem);
                }
            }

            println!("🌱 [Hyper-Fork] Branche {} générée avec un budget de {:.2}", clone.cell_id, split_budget);
            branches.push(clone);
        }
        branches
    }

    /// MITOSE INVERSÉE (MERGE) : Promeut une branche gagnante comme nouvelle réalité principale.
    /// Les connaissances et l'état de la branche écrasent ceux du parent.
    pub fn merge_winning_branch(&mut self, parent_cell: &mut AgentCell, winning_branch: AgentCell, other_branches: &mut Vec<AgentCell>) {
        // 1. Apoptose des autres branches (Elles ont échoué ou été plus lentes)
        for mut branch in other_branches.drain(..) {
            branch.conscience.is_apoptotic = true;
            println!("🗑️ [Pruning] La branche perdante {} est détruite.", branch.cell_id);
            // TODO: Nettoyer physiquement les bases KuzuDB orphelines de ces branches
        }

        // 2. Fusion de la Mémoire (Hippocampus)
        if let Some(winner_mind) = winning_branch.mind() {
            if let Some(winner_graph) = &winner_mind.cognitive_state.hippocampus {
                if let Some(parent_mind) = parent_cell.mind_mut() {
                    if let Some(parent_graph) = &mut parent_mind.cognitive_state.hippocampus {
                        // Le parent adopte la base de données du gagnant (Overwrite)
                        let parent_db_path = parent_graph.db_path.clone();
                        
                        let _ = std::fs::copy(&winner_graph.db_path, &parent_db_path);
                        if std::path::Path::new(&format!("{}.wal", winner_graph.db_path)).exists() {
                            let _ = std::fs::copy(&format!("{}.wal", winner_graph.db_path), &format!("{}.wal", parent_db_path));
                        }

                        // Nettoyage de la base de données temporaire de la branche gagnante
                        let _ = std::fs::remove_file(&winner_graph.db_path);
                        let _ = std::fs::remove_file(&format!("{}.wal", winner_graph.db_path));
                    }
                }
            }
        }

        // 3. Fusion de l'état cognitif
        let parent_uuid = parent_cell.cell_id;
        *parent_cell = winning_branch;
        parent_cell.cell_id = parent_uuid; // Restauration de l'identité racine
        
        // 4. Boost de l'Énergie
        parent_cell.conscience.eureka_moments += 1;
        parent_cell.conscience.current_budget += 50.0;
        
        println!("🧬 [Mitose / Merge] La branche a été fusionnée. Le parent {} hérite de la nouvelle réalité.", parent_cell.cell_id);
    }
}


















