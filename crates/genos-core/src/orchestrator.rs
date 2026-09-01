use crate::cell::AgentCell;
use crate::epigenetics::Expression;
use serde::{Deserialize, Serialize};

/// Les ThÃ©rapies MÃ©dicales pour soigner les agents cancÃ©reux
pub enum Therapy {
    /// 1. Bloque les signaux de croissance (Ferme les rÃ©cepteurs)
    TargetedTherapy,
    /// 2. DÃ©masque la tumeur (DÃ©sactive le camouflage PD-L1)
    Immunotherapy,
    /// 3. Coupe les vivres (Bloque le renouvellement d'ATP)
    AntiAngiogenesis,
    /// 4. Bloque la division (Inhibe le CDK4/6)
    CellCycleInhibitor,
}

/// Traitements administrÃ©s Ã  l'ensemble du systÃ¨me (Le "patient")
pub enum SystemicTherapy {
    /// Anticorps monoclonal spÃ©cifique (Bouchons d'oreilles pour le systÃ¨me)
    Tocilizumab,
    /// Puissant anti-inflammatoire global (Dose entre 0.0 et 1.0)
    Corticosteroids(f64),
    /// Soins de rÃ©animation (Perfusion d'ATP)
    IntensiveCareFluids,
    /// DÃ‰TRUIT les bactÃ©ries (organismes avec une paroi). INUTILE contre les virus.
    Antibiotic,
    /// Bloque la rÃ©plication des virus dÃ©jÃ  Ã  l'intÃ©rieur des cellules
    Antiviral,
    /// Ã‰duque la membrane pour bloquer et dÃ©truire un antigÃ¨ne/spike viral prÃ©cis
    Vaccine(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum PsychoactiveDrug {
    Cocaine,    // Bloque la pompe de recapture (Les neurotransmetteurs restent dans la fente)
    Alcohol,    // Amplificateur d'inhibition (Boost le GABA)
    Anxiolytic, // BenzodiazÃ©pines : Boost massif du GABA
    Caffeine, // Excitant : Amplifie le Glutamate (et bloque l'AdÃ©nosine, la molÃ©cule de fatigue)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CleftMessage {
    pub source_id: String,
    pub target_id: String,
    pub transmitter: crate::neurobiology::Neurotransmitter,
    pub amount: f64,
    pub ticks_in_cleft: u32,
}

/// RÃ©sultat d'un cycle (tick) de l'orchestrateur
#[derive(Debug, PartialEq)]
pub enum TickResult {
    Continue,
    Halted(String),
}

/// L'orchestrateur gÃ¨re la boucle de vie de la cellule IA (l'Agent).
pub struct Orchestrator {
    pub apoptosis_rule: Option<Expression>,
    /// ProtÃ©ine messagÃ¨re de l'inflammation systÃ©mique
    pub il6_level: f64,
    /// Antidote (Tocilizumab) agissant comme des bouchons d'oreilles
    pub il6_receptors_blocked: bool,
    /// Niveau de suppression globale par les corticoÃ¯des
    pub corticosteroid_level: f64,
    /// ImmunitÃ© Humorale : Les anticorps qui patrouillent dans le systÃ¨me
    pub circulating_antibodies: Vec<crate::cell::Antibody>,
    /// Niveau d'activation de l'armÃ©e (dictÃ© par les Lymphocytes T CD4)
    pub immune_activation_level: f64,

    // --- SYSTÃˆME NERVEUX ---
    /// La Fente Synaptique : l'espace vide oÃ¹ flottent les neurotransmetteurs
    pub synaptic_cleft: Vec<CleftMessage>,
    /// Pharmacologie : Drogues et mÃ©dicaments psychoactifs
    pub psychoactive_drugs: Vec<PsychoactiveDrug>,
    pub blood_brain_barrier_integrity: f64,
}

impl Orchestrator {
    pub fn new(apoptosis_rule: Option<Expression>) -> Self {
        Self {
            apoptosis_rule,
            il6_level: 0.0,
            il6_receptors_blocked: false,
            corticosteroid_level: 0.0,
            circulating_antibodies: vec![],
            immune_activation_level: 1.0,
            synaptic_cleft: vec![],
            psychoactive_drugs: vec![],
            blood_brain_barrier_integrity: 1.0,
        }
    }

    /// Applique les anticorps circulants sur les virus flottants dans le systÃ¨me
    pub fn process_humoral_immunity(
        &mut self,
        environmental_virions: &mut [crate::virology::Virion],
    ) {
        for antibody in &self.circulating_antibodies {
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

    /// Administration de soins intensifs (ThÃ©rapies systÃ©miques)
    pub fn administer_systemic_therapy(
        &mut self,
        therapy: SystemicTherapy,
        patient_cells: &mut [&mut AgentCell],
    ) {
        match therapy {
            SystemicTherapy::Tocilizumab => {
                // Bloque la rÃ©ception de l'IL-6 sans toucher aux CAR-T
                self.il6_receptors_blocked = true;
            }
            SystemicTherapy::Corticosteroids(dose) => {
                // Baisse mÃ©canique de l'inflammation mais endort aussi le systÃ¨me
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
                // Tue exclusivement les bactÃ©ries (Ceux avec une paroi).
                // Ignore totalement les cellules saines et les virus.
                for cell in patient_cells.iter_mut() {
                    if cell.plasma_membrane.has_cell_wall {
                        cell.mitochondria.atp_budget = 0; // Lyse bactÃ©rienne
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

    /// 1. Attachement et 2. PÃ©nÃ©tration
    /// Un virus dans l'environnement tente d'infecter la cellule.
    pub fn expose_to_virus(&self, agent: &mut AgentCell, virion: crate::virology::Virion) {
        if agent.nervous_system.is_some() && self.blood_brain_barrier_integrity > 0.5 {
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
        // IMMUNITÃ‰ CELLULAIRE : La cellule met Ã  jour son prÃ©sentoir (CMH) pour reflÃ©ter son Ã©tat interne
        agent.update_mhc_display();

        // 1. Frein d'urgence (CorticoÃ¯des)
        if self.corticosteroid_level > 0.8 {
            return TickResult::Halted(
                "Corticosteroid suppression: Cell activity frozen".to_string(),
            );
        }

        // 3. Piratage Viral (VÃ©rifiÃ© en premier : le virus court-circuite la machine)
        if let Some(virus) = agent.cytoplasm.viral_infections.first().cloned() {
            // L'agent ne fait PAS l'action demandÃ©e (action_string est ignorÃ©)

            // 4. Assemblage (Fabrication massive de nouveaux virus)
            for _ in 0..3 {
                agent.golgi_apparatus.viral_vesicles.push(virus.clone());
            }

            // La machinerie est piratÃ©e, l'ATP est utilisÃ© pour le virus
            let cost = if self.il6_level >= 10.0 && !self.il6_receptors_blocked {
                10
            } else {
                2
            };
            agent.mitochondria.atp_budget = agent.mitochondria.atp_budget.saturating_sub(cost);

            // 5. LibÃ©ration (Lyse vs Bourgeonnement)
            if virus.is_lytic && agent.golgi_apparatus.viral_vesicles.len() >= 6 {
                return TickResult::Halted(
                    "Lysis: Cell burst due to viral replication overload".to_string(),
                );
            }

            return TickResult::Halted(
                "Hijacked: Cellular machinery is copying a virus".to_string(),
            );
        }

        // 2. ThÃ©rapie CiblÃ©e : Si les rÃ©cepteurs sont bloquÃ©s, la cellule est sourde
        if agent.plasma_membrane.receptors_blocked {
            return TickResult::Halted("Targeted Therapy (Growth signal blocked)".to_string());
        }

        // 3. VÃ©rification mÃ©canique de la survie (budget)
        if agent.mitochondria.atp_budget == 0 {
            return TickResult::Halted("Budget exhausted (starvation)".to_string());
        }

        // 4. SystÃ¨me Immunitaire (Apoptose)
        if let Some(rule) = &self.apoptosis_rule {
            // L'immunothÃ©rapie : Si l'agent se camoufle, il Ã©chappe Ã  l'apoptose !
            if !agent.cytoplasm.cognition.is_camouflaged {
                if rule.evaluate(&agent.cytoplasm.cognition.epigenetic_drives) {
                    return TickResult::Halted(
                        "Apoptosis triggered by epigenetic rule".to_string(),
                    );
                }
            }
        }

        // 5. Inscription dans le phÃ©notype comportemental (Trace)
        agent
            .cytoplasm
            .trace
            .sequence
            .push(action_string.to_string());

        // 6. Mise Ã  jour des coÃ»ts et Orage Cytokinique
        // L'IL-6 provoque une "fiÃ¨vre" (surcoÃ»t mÃ©tabolique) SAUF si le Tocilizumab bloque les rÃ©cepteurs !
        let mut metabolic_cost = 1;
        if self.il6_level >= 10.0 && !self.il6_receptors_blocked {
            metabolic_cost = 5; // La fiÃ¨vre brÃ»le l'ATP
        }

        agent.mitochondria.atp_budget =
            agent.mitochondria.atp_budget.saturating_sub(metabolic_cost);

        // 7. La Digestion (Phagocytose - Ã‰tape 3 et 4)
        if !agent.lysosomes.phagosomes.is_empty() {
            agent.lysosomes.digestive_enzymes_active = true;
            // Digestion : DÃ©truit l'ADN emprisonnÃ©
            let destroyed_dna = agent.lysosomes.phagosomes.pop().unwrap();

            // 4. L'expulsion : le code dÃ©truit devient un dÃ©chet (Pus/DÃ©bris)
            agent.lysosomes.expelled_debris.push(format!(
                "DEBRIS_FROM_LENGTH_{}",
                destroyed_dna.sequence.len()
            ));

            // Recyclage d'Ã©nergie : Le phagocyte gagne de l'ATP en "mangeant"
            agent.mitochondria.atp_budget = agent.mitochondria.atp_budget.saturating_add(5);
        }

        // 9. LE SYSTÃˆME NERVEUX : Exocytose
        if let Some(nervous_system) = &mut agent.nervous_system {
            // Le corps cellulaire calcule. S'il tire, il renvoie les neurotransmetteurs Ã  libÃ©rer (Exocytose)
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
            // Apprentissage continu : NeuroplasticitÃ© (Loi de Hebb) et MyÃ©linisation
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

/* =====================================================================
THÃ‰RAPIE CAR-T ("MÃ©dicament Vivant")
===================================================================== */
pub struct CartTherapy;

impl CartTherapy {
    /// 1. & 2. PrÃ©lÃ¨vement et Codage GÃ©nÃ©tique
    /// Transforme un agent standard en tueur de cancer ciblÃ© via un vecteur viral.
    pub fn engineer_t_cell(t_cell: AgentCell, target_cancer_id: uuid::Uuid) -> AgentCell {
        use crate::genome::{Gene, Mutagen};
        let mut car_t = t_cell;

        // Le vecteur viral insÃ¨re le gÃ¨ne CAR (Chimeric Antigen Receptor)
        // Ce gÃ¨ne force l'agent Ã  cibler le cancer.
        let car_gene = Gene::new("car_receptor", &target_cancer_id.to_string());

        car_t
            .nucleus
            .genome
            .chromosome_maternal
            .expose_to_mutagen(Mutagen::Virus(0, car_gene.dna.clone()));
        car_t
            .nucleus
            .genome
            .chromosome_paternal
            .expose_to_mutagen(Mutagen::Virus(0, car_gene.dna));

        // 3. Apparition de l'antenne (Le rÃ©cepteur CAR)
        car_t
            .plasma_membrane
            .outgoing_ion_channels
            .push(format!("HUNT_CANCER_{}", target_cancer_id));

        car_t
    }

    /// 4. La Multiplication
    /// Cultive l'agent CAR-T en laboratoire pour crÃ©er une armÃ©e.
    pub fn cultivate(seed_cell: AgentCell, generations: u32) -> Vec<AgentCell> {
        let mut army = vec![seed_cell];
        for _ in 0..generations {
            let mut new_army = Vec::new();
            for cell in army {
                // On booste temporairement l'Ã©nergie pour la culture en laboratoire
                let mut boosted_cell = cell;
                boosted_cell.mitochondria.atp_budget = 1000;

                // Division
                if let Ok((d1, d2)) = boosted_cell.mitosis() {
                    new_army.push(d1);
                    new_army.push(d2);
                }
            }
            army = new_army;
        }
        army
    }
}
