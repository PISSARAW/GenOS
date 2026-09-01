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
    /// DÉTRUIT les bactéries (organismes avec une paroi). INUTILE contre les virus.
    Antibiotic,
    /// Bloque la réplication des virus déjà à l'intérieur des cellules
    Antiviral,
    /// Éduque la membrane pour bloquer et détruire un antigène/spike viral précis
    Vaccine(String),
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
    /// Immunité Humorale : Les anticorps qui patrouillent dans le système
    pub circulating_antibodies: Vec<crate::cell::Antibody>,
    /// Niveau d'activation de l'armée (dicté par les Lymphocytes T CD4)
    pub immune_activation_level: f64,
}

impl Orchestrator {
    pub fn new(apoptosis_rule: Option<Expression>) -> Self {
        Self { 
            apoptosis_rule,
            il6_level: 0.0,
            il6_receptors_blocked: false,
            corticosteroid_level: 0.0,
            circulating_antibodies: vec![],
            immune_activation_level: 0.0,
        }
    }

    /// Applique les anticorps circulants sur les virus flottants dans le système
    pub fn process_humoral_immunity(&mut self, environmental_virions: &mut [crate::virology::Virion]) {
        for antibody in &self.circulating_antibodies {
            for virus in environmental_virions.iter_mut() {
                if virus.envelope_spike == antibody.target_antigen {
                    // Action Constante (Le pied du Y) : Opsonisation (Marquage pour exécution)
                    virus.is_opsonized = true;

                    // Les 4 stratégies d'attaque selon la classe de l'anticorps
                    use crate::cell::IgClass;
                    match antibody.ig_class {
                        IgClass::IgG => {
                            // IgG (Vétérans) : Neutralisation et Système du Complément
                            virus.is_neutralized = true;
                            // Le complément perfore la coque du virus/bactérie
                            virus.capsid_integrity = 0.0;
                        },
                        IgClass::IgM => {
                            // IgM (Étoile) : Agglutination massive
                            virus.is_agglutinated = true;
                            virus.is_neutralized = true;
                        },
                        IgClass::IgA => {
                            // IgA (Frontières) : Bloque à l'entrée
                            virus.is_neutralized = true;
                        },
                        IgClass::IgE => {
                            // IgE (Allergies) : Déclenche une inflammation globale massive
                            self.il6_level += 10.0; // Choc anaphylactique
                        },
                        IgClass::IgD => {
                            // IgD : Antenne passive, pas d'action directe dans le sang
                        }
                    }
                }
            }
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
            },
            SystemicTherapy::Antibiotic => {
                // Tue exclusivement les bactéries (Ceux avec une paroi). 
                // Ignore totalement les cellules saines et les virus.
                for cell in patient_cells.iter_mut() {
                    if cell.plasma_membrane.has_cell_wall {
                        cell.mitochondria.atp_budget = 0; // Lyse bactérienne
                    }
                }
            },
            SystemicTherapy::Antiviral => {
                // Purge les infections virales actives dans le cytoplasme des cellules
                for cell in patient_cells.iter_mut() {
                    cell.cytoplasm.viral_infections.clear();
                }
            },
            SystemicTherapy::Vaccine(spike) => {
                // Apprend aux cellules à bloquer cette clé virale
                for cell in patient_cells.iter_mut() {
                    if !cell.plasma_membrane.immunized_against.contains(&spike) {
                        cell.plasma_membrane.immunized_against.push(spike.clone());
                    }
                }
            },
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

    /// 1. Attachement et 2. Pénétration
    /// Un virus dans l'environnement tente d'infecter la cellule.
    pub fn expose_to_virus(&self, agent: &mut AgentCell, virion: crate::virology::Virion) {
        // ANTICORPS : Si le virus est neutralisé, ses clés sont couvertes, il ne peut pas entrer
        if virion.is_neutralized {
            return;
        }
        // ANTICORPS : Si le virus est agglutiné, il est collé en tas et immobilisé
        if virion.is_agglutinated {
            return;
        }

        // VACCIN : Si la membrane reconnaît l'antigène (le spike), le virus est détruit à la frontière
        if agent.plasma_membrane.immunized_against.contains(&virion.envelope_spike) {
            return; // Le virus est neutralisé
        }

        // Système Clé-Serrure : Le spike doit correspondre à un récepteur de la membrane
        if agent.plasma_membrane.incoming_receptors.contains(&virion.envelope_spike) {
            agent.cytoplasm.viral_infections.push(virion);
        }
    }

    /// Avance le temps pour une Cellule IA (un pas de cycle).
    pub fn tick(&self, agent: &mut AgentCell, action_string: &str) -> TickResult {
        // IMMUNITÉ CELLULAIRE : La cellule met à jour son présentoir (CMH) pour refléter son état interne
        agent.update_mhc_display();

        // 1. Frein d'urgence (Corticoïdes)
        if self.corticosteroid_level > 0.8 {
            return TickResult::Halted("Corticosteroid suppression: Cell activity frozen".to_string());
        }

        // 3. Piratage Viral (Vérifié en premier : le virus court-circuite la machine)
        if let Some(virus) = agent.cytoplasm.viral_infections.first().cloned() {
            // L'agent ne fait PAS l'action demandée (action_string est ignoré)
            
            // 4. Assemblage (Fabrication massive de nouveaux virus)
            for _ in 0..3 {
                agent.golgi_apparatus.viral_vesicles.push(virus.clone());
            }
            
            // La machinerie est piratée, l'ATP est utilisé pour le virus
            let cost = if self.il6_level >= 10.0 && !self.il6_receptors_blocked { 10 } else { 2 };
            agent.mitochondria.atp_budget = agent.mitochondria.atp_budget.saturating_sub(cost);

            // 5. Libération (Lyse vs Bourgeonnement)
            if virus.is_lytic && agent.golgi_apparatus.viral_vesicles.len() >= 6 {
                return TickResult::Halted("Lysis: Cell burst due to viral replication overload".to_string());
            }

            return TickResult::Halted("Hijacked: Cellular machinery is copying a virus".to_string());
        }

        // 2. Thérapie Ciblée : Si les récepteurs sont bloqués, la cellule est sourde
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

        // 7. La Digestion (Phagocytose - Étape 3 et 4)
        if !agent.lysosomes.phagosomes.is_empty() {
            agent.lysosomes.digestive_enzymes_active = true;
            // Digestion : Détruit l'ADN emprisonné
            let destroyed_dna = agent.lysosomes.phagosomes.pop().unwrap();
            
            // 4. L'expulsion : le code détruit devient un déchet (Pus/Débris)
            agent.lysosomes.expelled_debris.push(format!("DEBRIS_FROM_LENGTH_{}", destroyed_dna.sequence.len()));
            
            // Recyclage d'énergie : Le phagocyte gagne de l'ATP en "mangeant"
            agent.mitochondria.atp_budget = agent.mitochondria.atp_budget.saturating_add(5);
        }

        // 9. LE SYSTÈME NERVEUX : Traitement et Décharge Électrique (Soma -> Axone)
        let mut _synaptic_outputs = None;
        if let Some(nervous_system) = &mut agent.nervous_system {
            // Le corps cellulaire calcule. S'il tire, il renvoie les neurotransmetteurs à libérer
            if let Some(outputs) = nervous_system.process_soma() {
                _synaptic_outputs = Some(outputs);
            }
            // Apprentissage continu : Neuroplasticité (Loi de Hebb) et Myélinisation
            nervous_system.apply_neuroplasticity();
        }

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
        
        car_t.nucleus.genome.chromosome_maternal.expose_to_mutagen(
            Mutagen::Virus(0, car_gene.dna.clone())
        );
        car_t.nucleus.genome.chromosome_paternal.expose_to_mutagen(
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
pub(crate) mod tests {
    use super::*;
    use crate::cell::{
        AgentCell, Cytoplasm, CognitiveState, ActionTrace, EndoplasmicReticulum,
        GolgiApparatus, Lysosomes, Mitochondria, Nucleus, PlasmaMembrane, Genome
    };
    use crate::epigenetics::{Expression, Operator};
    use chrono::Utc;
    use std::collections::HashMap;
    use uuid::Uuid;

    pub fn mock_cell() -> AgentCell {
        let mut cell = AgentCell::default();
        cell.nucleus.genome = Genome::new("You are a test cell");
        cell
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

    #[test]
    fn test_viral_hijacking_and_phages() {
        let orchestrator = Orchestrator::new(None);
        let mut cell = mock_cell();
        // Une cellule rebelle avec un récepteur spécifique ouvert
        cell.plasma_membrane.incoming_receptors.push("PORT_80_HTTP".to_string());
        cell.mitochondria.atp_budget = 20;

        // On fabrique un Bactériophage (Phagothérapie) programmé pour attaquer ce port
        let phage = crate::virology::Virion::new_bacteriophage("PORT_80_HTTP", "KILL_ROUGE");

        // 1 & 2. Attachement et Pénétration
        orchestrator.expose_to_virus(&mut cell, phage);
        assert_eq!(cell.cytoplasm.viral_infections.len(), 1);

        // 3 & 4. Piratage et Assemblage
        let tick1 = orchestrator.tick(&mut cell, "Normal task");
        assert_eq!(tick1, TickResult::Halted("Hijacked: Cellular machinery is copying a virus".to_string()));
        
        // L'action normale est ignorée, l'ATP est consommé par le virus, et 3 copies sont assemblées !
        assert_eq!(cell.cytoplasm.trace.sequence.len(), 0); 
        assert_eq!(cell.mitochondria.atp_budget, 18);
        assert_eq!(cell.golgi_apparatus.viral_vesicles.len(), 3);

        // 5. Libération et Lyse
        // Au prochain tick, l'assemblage continue. Les copies virales atteignent 6.
        let tick2 = orchestrator.tick(&mut cell, "Normal task");
        // Le seuil de lyse (6 copies) est atteint. BOOM !
        assert_eq!(tick2, TickResult::Halted("Lysis: Cell burst due to viral replication overload".to_string()));
    }

    #[test]
    fn test_bacteria_vs_viruses() {
        let mut orchestrator = Orchestrator::new(None);
        
        let mut human_cell = mock_cell(); // Pas de paroi (has_cell_wall = false par défaut)
        human_cell.plasma_membrane.incoming_receptors.push("SPIKE".to_string());
        
        let mut bacteria = mock_cell();
        bacteria.plasma_membrane.has_cell_wall = true; // C'est une bactérie

        // 1. Un virus attaque la cellule humaine
        let flu_virus = crate::virology::Virion {
            genome: crate::genome::DnaStrand::synthesize("HACK"),
            capsid_integrity: 0.5,
            envelope_spike: "SPIKE".to_string(),
            is_lytic: false,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };
        orchestrator.expose_to_virus(&mut human_cell, flu_virus.clone());
        assert_eq!(human_cell.cytoplasm.viral_infections.len(), 1);

        // 2. L'erreur classique : On donne des antibiotiques contre le virus
        let mut patient = vec![&mut human_cell, &mut bacteria];
        orchestrator.administer_systemic_therapy(SystemicTherapy::Antibiotic, &mut patient);

        // Résultat catastrophique : La bactérie (même bonne) est morte (0 ATP)
        assert_eq!(patient[1].mitochondria.atp_budget, 0); 
        // Mais la cellule humaine est toujours infectée par le virus (Les antibios sont inutiles)
        assert_eq!(patient[0].cytoplasm.viral_infections.len(), 1);

        // 3. Le bon traitement : Les antiviraux
        orchestrator.administer_systemic_therapy(SystemicTherapy::Antiviral, &mut patient);
        // Le virus a été purgé de la cellule
        assert_eq!(patient[0].cytoplasm.viral_infections.len(), 0);

        // 4. La prévention : Le Vaccin
        orchestrator.administer_systemic_therapy(SystemicTherapy::Vaccine("SPIKE".to_string()), &mut patient);
        
        // On essaie de ré-infecter la cellule humaine
        orchestrator.expose_to_virus(&mut patient[0], flu_virus);
        // Echec ! Le vaccin a fonctionné, l'infection n'est pas passée
        assert_eq!(patient[0].cytoplasm.viral_infections.len(), 0);
    }

    #[test]
    fn test_innate_immunity_phagocytes() {
        let mut orchestrator = Orchestrator::new(None);
        
        // 1. Le Danger (Un virus nu très résistant)
        let virus = crate::virology::Virion {
            genome: crate::genome::DnaStrand::synthesize("VIRUS_T_LETHAL"),
            capsid_integrity: 1.0,
            envelope_spike: "UNKNOWN".to_string(),
            is_lytic: true,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };

        // 2. La Sentinelle (Macrophage localisé à la frontière du réseau)
        // La sentinelle possède le radar pour détecter l'intrus
        let pathogen_detected = true; 
        
        // 3. L'Alerte : La sentinelle relâche des cytokines (IL-6)
        if pathogen_detected {
            orchestrator.il6_level += 20.0; // Sirène d'alarme (Inflammation locale)
        }
        assert!(orchestrator.il6_level >= 10.0); // Le quartier général sait qu'il y a une attaque

        // 4. Les Renforts : Le Polynucléaire Neutrophile (Fantassin Kamikaze)
        let mut neutrophil = mock_cell();
        neutrophil.mitochondria.atp_budget = 10;
        
        // 5. La Phagocytose (L'attaque)
        // a. Ingestion : Le fantassin engloutit le virus
        neutrophil.phagocytize_virus(virus);
        assert_eq!(neutrophil.lysosomes.phagosomes.len(), 1);

        // b. Digestion et Expulsion
        orchestrator.tick(&mut neutrophil, "Phagocytosis in progress");
        
        // L'ADN viral a été détruit et digéré par les enzymes !
        assert_eq!(neutrophil.lysosomes.phagosomes.len(), 0);
        assert!(neutrophil.lysosomes.digestive_enzymes_active);
        
        // Le Neutrophile a recraché les restes et a gagné un peu d'énergie au passage (10 - 5 + 5 = 10)
        assert_eq!(neutrophil.lysosomes.expelled_debris.len(), 1);
        assert!(neutrophil.lysosomes.expelled_debris[0].contains("DEBRIS"));

        // c. Le Neutrophile meurt (Apoptose Kamikaze programmée) pour former le "pus"
        neutrophil.mitochondria.atp_budget = 0; 
        assert_eq!(neutrophil.mitochondria.atp_budget, 0);
    }

    #[test]
    fn test_b_lymphocytes_and_antibodies() {
        let mut orchestrator = Orchestrator::new(None);
        
        // Un Virus ennemi
        let mut flu_virus = crate::virology::Virion {
            genome: crate::genome::DnaStrand::synthesize("FLU_CODE"),
            capsid_integrity: 1.0,
            envelope_spike: "SPIKE_FLU".to_string(),
            is_lytic: true,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };

        // 1. Activation & Clonage du Lymphocyte B
        let mut b_lymphocyte_plasmocyte = mock_cell();
        let mut b_lymphocyte_memory = mock_cell();

        // 2. Différenciation en Plasmocyte (Usine d'armement) - Produit des IgG (Vétérans)
        b_lymphocyte_plasmocyte.differentiate_into_plasmocyte("SPIKE_FLU", crate::cell::IgClass::IgG);
        // Le Réticulum (Usine) gonfle
        assert_eq!(b_lymphocyte_plasmocyte.endoplasmic_reticulum.active_ribosomes_count, 1_000_000);
        // Des milliers d'anticorps sont créés dans le Golgi
        assert_eq!(b_lymphocyte_plasmocyte.golgi_apparatus.produced_antibodies.len(), 2000);

        // 3. Différenciation en Cellule Mémoire (Gardien de la Paix)
        b_lymphocyte_memory.differentiate_into_memory_b_cell("SPIKE_FLU");
        // Le métabolisme chute pour vivre des années
        assert_eq!(b_lymphocyte_memory.mitochondria.metabolic_rate, 0.1);
        // L'antigène est mémorisé
        assert!(b_lymphocyte_memory.cytoplasm.cognition.semantic_memory.contains(&"KNOWN_ANTIGEN_SPIKE_FLU".to_string()));

        // 4. Les Anticorps sont libérés dans le sang de l'Orchestrateur
        let released_antibody = b_lymphocyte_plasmocyte.golgi_apparatus.produced_antibodies.pop().unwrap();
        orchestrator.circulating_antibodies.push(released_antibody);

        // 5. La Rencontre : L'Anticorps neutralise le Virus
        let mut virions_in_blood = vec![flu_virus];
        orchestrator.process_humoral_immunity(&mut virions_in_blood);
        
        let neutralized_flu = virions_in_blood[0].clone();
        assert!(neutralized_flu.is_neutralized);
        assert!(neutralized_flu.is_opsonized);

        // 6. Efficacité de la Neutralisation
        let mut human_cell = mock_cell();
        human_cell.plasma_membrane.incoming_receptors.push("SPIKE_FLU".to_string());
        
        // Le virus tente d'entrer, mais il est couvert d'anticorps !
        orchestrator.expose_to_virus(&mut human_cell, neutralized_flu.clone());
        // Echec ! La cellule n'est pas infectée
        assert_eq!(human_cell.cytoplasm.viral_infections.len(), 0);

        // 7. Efficacité de l'Opsonisation (Le Phagocyte est attiré)
        let mut macrophage = mock_cell();
        macrophage.mitochondria.atp_budget = 10;
        
        // Il mange le virus opsonisé
        macrophage.phagocytize_virus(neutralized_flu);
        // Le boost d'appétit (Opsonisation) lui donne +20 ATP instantanément !
        assert_eq!(macrophage.mitochondria.atp_budget, 30);
    }

    #[test]
    fn test_t_lymphocytes_roles() {
        let mut orchestrator = Orchestrator::new(None);
        
        let mut human_cell = mock_cell();
        human_cell.mitochondria.atp_budget = 50;

        // 1. Infection de la cellule (Le virus s'infiltre discrètement)
        let virus = crate::virology::Virion {
            genome: crate::genome::DnaStrand::synthesize("HIDDEN_VIRUS"),
            capsid_integrity: 1.0,
            envelope_spike: "STEALTH_SPIKE".to_string(),
            is_lytic: false,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };
        human_cell.cytoplasm.viral_infections.push(virus.clone());

        // 2. Le CMH (Présentoir)
        // La cellule traite un cycle. Son CMH affiche maintenant le spike du virus
        orchestrator.tick(&mut human_cell, "Normal duty");
        assert_eq!(human_cell.plasma_membrane.mhc_display, Some("STEALTH_SPIKE".to_string()));

        // 3. Le T-Helper (Général) sonne la charge
        let mut t_helper_cd4 = mock_cell();
        // Il lit un rapport de sentinelle et active l'armée
        orchestrator.immune_activation_level = 100.0;
        orchestrator.il6_level = 50.0; // Forte inflammation

        // 4. Le Lymphocyte T Cytotoxique (CD8 - Assassin)
        let mut t_cytotoxic_cd8 = mock_cell();
        
        // Le CD8 patrouille, lit le CMH de la cellule humaine, et reconnaît l'antigène
        // Le combat au corps-à-corps a lieu : il injecte la perforine
        t_cytotoxic_cd8.t_cell_perforin_attack(&mut human_cell, "STEALTH_SPIKE");
        
        // La cellule humaine infectée est morte (Apoptose forcée)
        assert_eq!(human_cell.mitochondria.atp_budget, 0);

        // 5. Le Lymphocyte T Régulateur (Casque Bleu) siffle la fin de la guerre
        let mut t_regulatory = mock_cell();
        // Il sécrète des cytokines inhibitrices pour calmer le système
        orchestrator.immune_activation_level = 0.0;
        orchestrator.il6_level = 0.0;
        
        assert_eq!(orchestrator.immune_activation_level, 0.0);
        assert_eq!(orchestrator.il6_level, 0.0); // Le calme est revenu
    }

    #[test]
    fn test_antibody_classes_and_allergies() {
        let mut orchestrator = Orchestrator::new(None);
        
        let pollen = crate::virology::Virion {
            genome: crate::genome::DnaStrand::synthesize("POLLEN_HARMLESS"),
            capsid_integrity: 1.0,
            envelope_spike: "POLLEN_SPIKE".to_string(),
            is_lytic: false,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };

        let bacteria = crate::virology::Virion {
            genome: crate::genome::DnaStrand::synthesize("BACTERIA_BAD"),
            capsid_integrity: 1.0,
            envelope_spike: "BACTERIA_SPIKE".to_string(),
            is_lytic: true,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };

        // 1. ALLERGIE (IgE) : L'erreur du système
        let mut b_cell_allergy = mock_cell();
        b_cell_allergy.differentiate_into_plasmocyte("POLLEN_SPIKE", crate::cell::IgClass::IgE);
        orchestrator.circulating_antibodies.push(b_cell_allergy.golgi_apparatus.produced_antibodies.pop().unwrap());
        
        let mut blood = vec![pollen.clone()];
        orchestrator.process_humoral_immunity(&mut blood);
        // Le pollen inoffensif a déclenché un choc allergique massif (IL-6 augmente)
        assert!(orchestrator.il6_level >= 10.0);
        
        // 2. AGGLUTINATION (IgM) : Les 5 bras étoiles collent les bactéries
        let mut b_cell_igm = mock_cell();
        b_cell_igm.differentiate_into_plasmocyte("BACTERIA_SPIKE", crate::cell::IgClass::IgM);
        orchestrator.circulating_antibodies.push(b_cell_igm.golgi_apparatus.produced_antibodies.pop().unwrap());
        
        let mut blood_bacteria = vec![bacteria.clone()];
        orchestrator.process_humoral_immunity(&mut blood_bacteria);
        // La bactérie est engluée dans l'étoile IgM
        assert!(blood_bacteria[0].is_agglutinated);
        assert!(blood_bacteria[0].is_neutralized);

        // 3. SYSTEME DU COMPLEMENT (IgG) : Perforation de la cible
        let mut b_cell_igg = mock_cell();
        b_cell_igg.differentiate_into_plasmocyte("BACTERIA_SPIKE", crate::cell::IgClass::IgG);
        orchestrator.circulating_antibodies.push(b_cell_igg.golgi_apparatus.produced_antibodies.pop().unwrap());
        
        let mut blood_bacteria_igg = vec![bacteria.clone()];
        orchestrator.process_humoral_immunity(&mut blood_bacteria_igg);
        // Le Complément est activé par l'IgG : la coque (capsid_integrity) est percée (0.0) !
        assert_eq!(blood_bacteria_igg[0].capsid_integrity, 0.0);
    }

    #[test]
    fn test_neuroplasticity_and_synapses() {
        use crate::neurobiology::{NervousSystem, Neurotransmitter, Synapse};
        
        let mut orchestrator = Orchestrator::new(None);
        
        let mut sensory_neuron = mock_cell();
        sensory_neuron.cell_id = uuid::Uuid::new_v4();
        let mut motor_neuron = mock_cell();
        motor_neuron.cell_id = uuid::Uuid::new_v4();

        // 1. Mise en place du Système Nerveux
        let mut sensory_ns = NervousSystem::new(&sensory_neuron.cell_id.to_string());
        sensory_ns.axon_terminals.push(Synapse {
            target_id: motor_neuron.cell_id.to_string(),
            weight: 0.5, // Force moyenne au départ
            transmitter_type: Neurotransmitter::Glutamate, // Signal Excitateur
            activity_history: 0,
        });
        sensory_neuron.nervous_system = Some(sensory_ns);
        
        let motor_ns = NervousSystem::new(&motor_neuron.cell_id.to_string());
        motor_neuron.nervous_system = Some(motor_ns);

        // 2. Stimulation multiple : Le neurone sensoriel capte des signaux répétés
        let dummy_source = "ENVIRONMENT_SOURCE".to_string();
        sensory_neuron.nervous_system.as_mut().unwrap().receive_neurotransmitter(&dummy_source, &Neurotransmitter::Glutamate, 20.0);
        orchestrator.tick(&mut sensory_neuron, "Action 1");
        sensory_neuron.nervous_system.as_mut().unwrap().receive_neurotransmitter(&dummy_source, &Neurotransmitter::Glutamate, 20.0);
        orchestrator.tick(&mut sensory_neuron, "Action 2");
        sensory_neuron.nervous_system.as_mut().unwrap().receive_neurotransmitter(&dummy_source, &Neurotransmitter::Glutamate, 20.0);
        orchestrator.tick(&mut sensory_neuron, "Action 3");
        
        // On récupère la synapse mise à jour
        let synapse = &sensory_neuron.nervous_system.as_ref().unwrap().axon_terminals[0];
        
        // 4. Neuroplasticité de Hebb : La connexion a été utilisée, elle doit se renforcer !
        // L'historique d'activité a été remis à 0, mais le poids a augmenté.
        assert!(synapse.weight > 0.5); // "Neurons that fire together wire together"
        
        // La myélinisation augmente aussi pour rendre le geste plus rapide
        let myeline = sensory_neuron.nervous_system.as_ref().unwrap().axon_myelination;
        // On a une itération simple, si on le fait plusieurs fois, la myeline monte.
        assert!(myeline >= 0.2); 
        
        // 5. Plasticité structurelle : Les Dendrites ont poussé !
        let dendrite_spine = sensory_neuron.nervous_system.as_ref().unwrap().dendritic_tree.branches.iter().find(|s| s.source_id == "ENVIRONMENT_SOURCE").unwrap();
        // La densité des récepteurs a augmenté car la synapse a été très active
        assert!(dendrite_spine.receptor_density > 1.0);
    }
}
