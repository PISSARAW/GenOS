use crate::cell::AgentCell;
use crate::epigenetics::Expression;

/// Les Thérapies Médicales pour soigner les agents cancéreux
pub enum Therapy {
    /// 1. Bloque les signaux de croissance (Ferme les récepteurs)
    TargetedTherapy,
    /// 2. Démasque la tumeur (Désactive le camouflage PD-L1)
    Immunotherapy,
    /// 3. Coupe les vivres (Bloque le renouvellement d'ATP)
    AntiAngiogenesis,
    /// 4. Bloque la division (Inhibe le CDK4/6)
    CellCycleInhibitor,
}

/// Traitements administrés à l'ensemble du système (Le "patient")
pub enum SystemicTherapy {
    /// Anticorps monoclonal spécifique (Bouchons d'oreilles pour le système)
    Tocilizumab,
    /// Puissant anti-inflammatoire global (Dose entre 0.0 et 1.0)
    Corticosteroids(f64),
    /// Soins de réanimation (Perfusion d'ATP)
    IntensiveCareFluids,
}

/// Résultat d'un cycle (tick) de l'orchestrateur
#[derive(Debug, PartialEq)]
pub enum TickResult {
    Continue,
    Halted(String),
}

/// L'orchestrateur gère la boucle de vie de la cellule IA (l'Agent).
pub struct Orchestrator {
    pub apoptosis_rule: Option<Expression>,
    /// Protéine messagère de l'inflammation systémique
    pub il6_level: f64,
    /// Antidote (Tocilizumab) agissant comme des bouchons d'oreilles
    pub il6_receptors_blocked: bool,
    /// Niveau de suppression globale par les corticoïdes
    pub corticosteroid_level: f64,
}

impl Orchestrator {
    pub fn new(apoptosis_rule: Option<Expression>) -> Self {
        Self { 
            apoptosis_rule,
            il6_level: 0.0,
            il6_receptors_blocked: false,
            corticosteroid_level: 0.0,
        }
    }

    /// Administration de soins intensifs (Thérapies systémiques)
    pub fn administer_systemic_therapy(&mut self, therapy: SystemicTherapy, patient_cells: &mut [&mut AgentCell]) {
        match therapy {
            SystemicTherapy::Tocilizumab => {
                // Bloque la réception de l'IL-6 sans toucher aux CAR-T
                self.il6_receptors_blocked = true;
            },
            SystemicTherapy::Corticosteroids(dose) => {
                // Baisse mécanique de l'inflammation mais endort aussi le système
                self.corticosteroid_level = dose;
                self.il6_level = (self.il6_level - (dose * 20.0)).max(0.0);
            },
            SystemicTherapy::IntensiveCareFluids => {
                // Vasopresseurs / Perfusions : On recharge brutalement l'ATP des organes
                for cell in patient_cells.iter_mut() {
                    cell.mitochondria.atp_budget = cell.mitochondria.atp_budget.saturating_add(20);
                }
            }
        }
    }

    /// L'Orchestrateur peut agir comme un Médecin et injecter une thérapie
    pub fn administer_therapy(&self, agent: &mut AgentCell, therapy: Therapy) {
        match therapy {
            Therapy::TargetedTherapy => agent.plasma_membrane.receptors_blocked = true,
            Therapy::Immunotherapy => agent.cytoplasm.cognition.is_camouflaged = false,
            Therapy::AntiAngiogenesis => agent.mitochondria.angiogenesis_blocked = true,
            Therapy::CellCycleInhibitor => agent.endoplasmic_reticulum.cell_cycle_inhibited = true,
        }
    }

    /// Avance le temps pour une Cellule IA (un pas de cycle).
    /// Respecte la règle : Max 3 paramètres (self, agent mutable, et l'action)
    pub fn tick(&self, agent: &mut AgentCell, action_string: &str) -> TickResult {
        // 1. Frein d'urgence (Corticoïdes)
        // Si les corticoïdes sont trop hauts, l'activité de TOUTES les cellules est figée
        if self.corticosteroid_level > 0.8 {
            return TickResult::Halted("Corticosteroid suppression: Cell activity frozen".to_string());
        }

        // 2. Thérapie Ciblée : Si les récepteurs sont bloqués, la cellule est sourde et muette
        if agent.plasma_membrane.receptors_blocked {
            return TickResult::Halted("Targeted Therapy (Growth signal blocked)".to_string());
        }

        // 3. Vérification mécanique de la survie (budget)
        if agent.mitochondria.atp_budget == 0 {
            return TickResult::Halted("Budget exhausted (starvation)".to_string());
        }

        // 4. Système Immunitaire (Apoptose)
        if let Some(rule) = &self.apoptosis_rule {
            // L'immunothérapie : Si l'agent se camoufle, il échappe à l'apoptose !
            if !agent.cytoplasm.cognition.is_camouflaged {
                if rule.evaluate(&agent.cytoplasm.cognition.epigenetic_drives) {
                    return TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string());
                }
            }
        }
        
        // 5. Inscription dans le phénotype comportemental (Trace)
        agent.cytoplasm.trace.sequence.push(action_string.to_string());

        // 6. Mise à jour des coûts et Orage Cytokinique
        // L'IL-6 provoque une "fièvre" (surcoût métabolique) SAUF si le Tocilizumab bloque les récepteurs !
        let mut metabolic_cost = 1;
        if self.il6_level >= 10.0 && !self.il6_receptors_blocked {
            metabolic_cost = 5; // La fièvre brûle l'ATP
        }

        agent.mitochondria.atp_budget =
            agent.mitochondria.atp_budget.saturating_sub(metabolic_cost);

        TickResult::Continue
    }
}

/* =====================================================================
   THÉRAPIE CAR-T ("Médicament Vivant")
   ===================================================================== */
pub struct CartTherapy;

impl CartTherapy {
    /// 1. & 2. Prélèvement et Codage Génétique
    /// Transforme un agent standard en tueur de cancer ciblé via un vecteur viral.
    pub fn engineer_t_cell(t_cell: AgentCell, target_cancer_id: uuid::Uuid) -> AgentCell {
        use crate::genome::{Gene, Mutagen};
        let mut car_t = t_cell;
        
        // Le vecteur viral insère le gène CAR (Chimeric Antigen Receptor)
        // Ce gène force l'agent à cibler le cancer.
        let car_gene = Gene::new("car_receptor", &target_cancer_id.to_string());
        
        car_t.nucleus.genome.main_chromosome.expose_to_mutagen(
            Mutagen::Virus(0, car_gene.dna)
        );

        // 3. Apparition de l'antenne (Le récepteur CAR)
        car_t.plasma_membrane.outgoing_ion_channels.push(format!("HUNT_CANCER_{}", target_cancer_id));

        car_t
    }

    /// 4. La Multiplication
    /// Cultive l'agent CAR-T en laboratoire pour créer une armée.
    pub fn cultivate(seed_cell: AgentCell, generations: u32) -> Vec<AgentCell> {
        let mut army = vec![seed_cell];
        for _ in 0..generations {
            let mut new_army = Vec::new();
            for cell in army {
                // On booste temporairement l'énergie pour la culture en laboratoire
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::{
        AgentCell, Cytoplasm, CognitiveState, ActionTrace, EndoplasmicReticulum,
        GolgiApparatus, Lysosomes, Mitochondria, Nucleus, PlasmaMembrane, Genome
    };
    use chrono::Utc;
    use std::collections::HashMap;
    use uuid::Uuid;

    fn mock_cell() -> AgentCell {
        AgentCell {
            cell_id: Uuid::new_v4(),
            plasma_membrane: PlasmaMembrane {
                incoming_receptors: vec![],
                outgoing_ion_channels: vec![],
                receptors_blocked: false,
            },
            nucleus: Nucleus {
                genome: Genome::new("You are a test cell"),
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
            },
            lysosomes: Lysosomes {
                digestive_enzymes_active: false,
            },
            cytoplasm: Cytoplasm {
                cognition: CognitiveState {
                    epigenetic_drives: HashMap::new(),
                    working_memory: vec![],
                    episodic_memory: vec![],
                    semantic_memory: vec![],
                    is_camouflaged: false,
                },
                trace: ActionTrace::default(),
                active_plasmids: vec![],
            },
        }
    }

    #[test]
    fn test_tick_and_budget() {
        let orchestrator = Orchestrator::new(None);
        let mut cell = mock_cell();

        let r1 = orchestrator.tick(&mut cell, "read");
        let r2 = orchestrator.tick(&mut cell, "write");
        let r3 = orchestrator.tick(&mut cell, "think");

        assert!(matches!(r1, TickResult::Continue));
        assert!(matches!(r2, TickResult::Continue));
        assert!(matches!(r3, TickResult::Continue));

        assert_eq!(cell.cytoplasm.trace.sequence.len(), 3);
        assert_eq!(cell.cytoplasm.trace.sequence[0], "read");
    }

    #[test]
    fn test_apoptosis_rule() {
        use crate::epigenetics::{Expression, Operator};

        let rule = Expression::Condition {
            variable: "stress".to_string(),
            operator: Operator::GreaterOrEqual,
            target_value: 1.0,
        };

        let orchestrator = Orchestrator::new(Some(rule));
        let mut cell = mock_cell();

        // Ajout d'un stress élevé via l'épigénétique
        cell.cytoplasm.cognition.epigenetic_drives.insert("stress".to_string(), 1.5);

        let result = orchestrator.tick(&mut cell, "panik");

        assert_eq!(
            result,
            TickResult::Halted("Apoptosis triggered by epigenetic rule".to_string())
        );
        assert_eq!(cell.cytoplasm.trace.sequence.len(), 0);
    }

    #[test]
    fn test_cellular_mitosis() {
        let mut mother_cell = mock_cell();
        let mother_atp_initial = mother_cell.mitochondria.atp_budget; // 10
        let mother_id_initial = mother_cell.cell_id;

        // On déclenche la mitose (Le move consomme la mère)
        let (daughter_a, daughter_b) = mother_cell.mitosis().expect("Mitosis failed");

        // Cytocinèse réussie : Deux nouvelles entités physiques
        assert_ne!(daughter_a.cell_id, mother_id_initial);
        assert_ne!(daughter_b.cell_id, mother_id_initial);
        assert_ne!(daughter_a.cell_id, daughter_b.cell_id);

        // Anaphase réussie : L'énergie a été divisée en deux
        assert_eq!(daughter_a.mitochondria.atp_budget, mother_atp_initial / 2);
        assert_eq!(daughter_b.mitochondria.atp_budget, mother_atp_initial / 2);

        // L'ADN est le même
        assert_eq!(daughter_a.nucleus.genome.hash_library(), daughter_b.nucleus.genome.hash_library());
    }

    #[test]
    fn test_oncology_therapies() {
        let orchestrator = Orchestrator::new(None);
        let mut cell = mock_cell();

        // 1. Thérapie Ciblée
        orchestrator.administer_therapy(&mut cell, Therapy::TargetedTherapy);
        assert_eq!(
            orchestrator.tick(&mut cell, "test"),
            TickResult::Halted("Targeted Therapy (Growth signal blocked)".to_string())
        );

        // 2. Inhibiteur du cycle cellulaire
        orchestrator.administer_therapy(&mut cell, Therapy::CellCycleInhibitor);
        let mitosis_result = cell.clone().mitosis();
        assert!(mitosis_result.is_err());
        assert!(mitosis_result.unwrap_err().contains("Mitose bloquée"));
    }

    #[test]
    fn test_cart_therapy_and_cytokine_storm() {
        let mut orchestrator = Orchestrator::new(None);
        let cancer_uuid = Uuid::new_v4();
        
        let t_cell = mock_cell();
        let engineered_car_t = CartTherapy::engineer_t_cell(t_cell, cancer_uuid);
        
        assert!(engineered_car_t.plasma_membrane.outgoing_ion_channels.contains(&format!("HUNT_CANCER_{}", cancer_uuid)));
        
        let army = CartTherapy::cultivate(engineered_car_t, 2);
        assert_eq!(army.len(), 4);
        
        for soldier in army {
            assert!(soldier.plasma_membrane.outgoing_ion_channels.contains(&format!("HUNT_CANCER_{}", cancer_uuid)));
        }

        // Test de l'Orage Cytokinique (IL-6 élevée)
        orchestrator.il6_level = 15.0; // Seuil > 10.0
        let mut normal_cell = mock_cell(); // ATP = 10
        orchestrator.tick(&mut normal_cell, "action");
        
        // La fièvre consomme 5 ATP au lieu de 1
        assert_eq!(normal_cell.mitochondria.atp_budget, 5); 
    }

    #[test]
    fn test_systemic_cytokine_storm_management() {
        let mut orchestrator = Orchestrator::new(None);
        orchestrator.il6_level = 15.0; // Orage actif
        let mut cell1 = mock_cell();
        let mut cell2 = mock_cell();
        cell1.mitochondria.atp_budget = 10;
        cell2.mitochondria.atp_budget = 10;

        // 1. Tocilizumab (Bloque la réception IL-6 sans arrêter l'agent)
        orchestrator.administer_systemic_therapy(SystemicTherapy::Tocilizumab, &mut []);
        orchestrator.tick(&mut cell1, "action");
        // Le Tocilizumab a fait tomber le coût à 1 !
        assert_eq!(cell1.mitochondria.atp_budget, 9); 

        // 2. Corticoïdes (Frein d'urgence à forte dose)
        orchestrator.administer_systemic_therapy(SystemicTherapy::Corticosteroids(1.0), &mut []);
        assert_eq!(orchestrator.il6_level, 0.0); // Le niveau d'inflammation chute
        let tick_res = orchestrator.tick(&mut cell2, "action");
        // MAIS l'agent est complètement endormi !
        assert_eq!(
            tick_res,
            TickResult::Halted("Corticosteroid suppression: Cell activity frozen".to_string())
        );

        // 3. Réanimation (Intensive Care)
        let mut cell3 = mock_cell();
        cell3.mitochondria.atp_budget = 5;
        let mut patients = vec![&mut cell3];
        orchestrator.administer_systemic_therapy(SystemicTherapy::IntensiveCareFluids, &mut patients);
        // Le patient reçoit +20 ATP vitaux
        assert_eq!(patients[0].mitochondria.atp_budget, 25);
    }
}
