#[cfg(test)]
pub(crate) mod tests {
    use chrono::Utc;
    use genos_core::cell::*;
    use genos_core::cell::{
        ActionTrace, AgentCell, CognitiveState, Cytoplasm, EndoplasmicReticulum, Genome,
        GolgiApparatus, Lysosomes, Mitochondria, Nucleus, PlasmaMembrane,
    };
    use genos_core::epigenetics::{Expression, Operator};
    use genos_core::orchestrator::*;
    use genos_core::virology::*;
    use std::collections::HashMap;
    use uuid::Uuid;

    pub fn mock_cell() -> AgentCell {
        let mut cell = AgentCell::default();
        cell.nucleus.genome = Genome::new("You are a test cell");
        cell
    }

    #[test]
    fn test_tick_and_budget() {
        let mut orchestrator = Orchestrator::new(None);
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
        use genos_core::epigenetics::{Expression, Operator};

        let rule = Expression::Condition {
            variable: "stress".to_string(),
            operator: Operator::GreaterOrEqual,
            target_value: 1.0,
        };

        let mut orchestrator = Orchestrator::new(Some(rule));
        let mut cell = mock_cell();

        // Ajout d'un stress ÃƒÂ©levÃƒÂ© via l'ÃƒÂ©pigÃƒÂ©nÃƒÂ©tique
        cell.cytoplasm
            .cognition
            .epigenetic_drives
            .insert("stress".to_string(), 1.5);

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

        // On dÃƒÂ©clenche la mitose (Le move consomme la mÃƒÂ¨re)
        let (daughter_a, daughter_b) = mother_cell.mitosis().expect("Mitosis failed");

        // CytocinÃƒÂ¨se rÃƒÂ©ussie : Deux nouvelles entitÃƒÂ©s physiques
        assert_ne!(daughter_a.cell_id, mother_id_initial);
        assert_ne!(daughter_b.cell_id, mother_id_initial);
        assert_ne!(daughter_a.cell_id, daughter_b.cell_id);

        // Anaphase rÃƒÂ©ussie : L'ÃƒÂ©nergie a ÃƒÂ©tÃƒÂ© divisÃƒÂ©e en deux
        assert_eq!(daughter_a.mitochondria.atp_budget, mother_atp_initial / 2);
        assert_eq!(daughter_b.mitochondria.atp_budget, mother_atp_initial / 2);

        // L'ADN est le mÃƒÂªme
        assert_eq!(
            daughter_a.nucleus.genome.hash_library(),
            daughter_b.nucleus.genome.hash_library()
        );
    }

    #[test]
    fn test_oncology_therapies() {
        let mut orchestrator = Orchestrator::new(None);
        let mut cell = mock_cell();

        // 1. ThÃƒÂ©rapie CiblÃƒÂ©e
        orchestrator.administer_therapy(&mut cell, Therapy::TargetedTherapy);
        assert_eq!(
            orchestrator.tick(&mut cell, "test"),
            TickResult::Halted("Targeted Therapy (Growth signal blocked)".to_string())
        );

        // 2. Inhibiteur du cycle cellulaire
        orchestrator.administer_therapy(&mut cell, Therapy::CellCycleInhibitor);
        let mitosis_result = cell.clone().mitosis();
        assert!(mitosis_result.is_err());
        assert!(mitosis_result.unwrap_err().contains("Mitose"));
    }

    #[test]
    fn test_cart_therapy_and_cytokine_storm() {
        let mut orchestrator = Orchestrator::new(None);
        let cancer_uuid = Uuid::new_v4();

        let t_cell = mock_cell();
        let engineered_car_t = CartTherapy::engineer_t_cell(t_cell, cancer_uuid);

        assert!(engineered_car_t
            .plasma_membrane
            .outgoing_ion_channels
            .contains(&format!("HUNT_CANCER_{}", cancer_uuid)));

        let army = CartTherapy::cultivate(engineered_car_t, 2);
        assert_eq!(army.len(), 4);

        for soldier in army {
            assert!(soldier
                .plasma_membrane
                .outgoing_ion_channels
                .contains(&format!("HUNT_CANCER_{}", cancer_uuid)));
        }

        // Test de l'Orage Cytokinique (IL-6 ÃƒÂ©levÃƒÂ©e)
        orchestrator.immune_system.il6_level = 15.0; // Seuil > 10.0
        let mut normal_cell = mock_cell(); // ATP = 10
        orchestrator.tick(&mut normal_cell, "action");

        // La fiÃƒÂ¨vre consomme 5 ATP au lieu de 1
        assert_eq!(normal_cell.mitochondria.atp_budget, 5);
    }

    #[test]
    fn test_systemic_cytokine_storm_management() {
        let mut orchestrator = Orchestrator::new(None);
        orchestrator.immune_system.il6_level = 15.0; // Orage actif
        let mut cell1 = mock_cell();
        let mut cell2 = mock_cell();
        cell1.mitochondria.atp_budget = 10;
        cell2.mitochondria.atp_budget = 10;

        // 1. Tocilizumab (Bloque la rÃƒÂ©ception IL-6 sans arrÃƒÂªter l'agent)
        orchestrator.administer_systemic_therapy(SystemicTherapy::Tocilizumab, &mut []);
        orchestrator.tick(&mut cell1, "action");
        // Le Tocilizumab a fait tomber le coÃƒÂ»t ÃƒÂ  1 !
        assert_eq!(cell1.mitochondria.atp_budget, 9);

        // 2. CorticoÃƒÂ¯des (Frein d'urgence ÃƒÂ  forte dose)
        orchestrator.administer_systemic_therapy(SystemicTherapy::Corticosteroids(1.0), &mut []);
        assert_eq!(orchestrator.immune_system.il6_level, 0.0); // Le niveau d'inflammation chute
        let tick_res = orchestrator.tick(&mut cell2, "action");
        // MAIS l'agent est complÃƒÂ¨tement endormi !
        assert_eq!(
            tick_res,
            TickResult::Halted("Corticosteroid suppression: Cell activity frozen".to_string())
        );

        // 3. RÃƒÂ©animation (Intensive Care)
        let mut cell3 = mock_cell();
        cell3.mitochondria.atp_budget = 5;
        let mut patients = vec![&mut cell3];
        orchestrator
            .administer_systemic_therapy(SystemicTherapy::IntensiveCareFluids, &mut patients);
        // Le patient reÃƒÂ§oit +20 ATP vitaux
        assert_eq!(patients[0].mitochondria.atp_budget, 25);
    }

    #[test]
    fn test_viral_hijacking_and_phages() {
        let mut orchestrator = Orchestrator::new(None);
        let mut cell = mock_cell();
        // Une cellule rebelle avec un rÃƒÂ©cepteur spÃƒÂ©cifique ouvert
        cell.plasma_membrane
            .incoming_receptors
            .push("PORT_80_HTTP".to_string());
        cell.mitochondria.atp_budget = 20;

        // On fabrique un BactÃƒÂ©riophage (PhagothÃƒÂ©rapie) programmÃƒÂ© pour attaquer ce port
        let phage = genos_core::virology::Virion::new_bacteriophage("PORT_80_HTTP", "KILL_ROUGE");

        // 1 & 2. Attachement et PÃƒÂ©nÃƒÂ©tration
        orchestrator.expose_to_virus(&mut cell, phage);
        assert_eq!(cell.cytoplasm.viral_infections.len(), 1);

        // 3 & 4. Piratage et Assemblage
        let tick1 = orchestrator.tick(&mut cell, "Normal task");
        assert_eq!(
            tick1,
            TickResult::Halted("Hijacked: Cellular machinery is copying a virus".to_string())
        );

        // L'action normale est ignorÃƒÂ©e, l'ATP est consommÃƒÂ© par le virus, et 3 copies sont assemblÃƒÂ©es !
        assert_eq!(cell.cytoplasm.trace.sequence.len(), 0);
        assert_eq!(cell.mitochondria.atp_budget, 10);
        assert_eq!(cell.golgi_apparatus.viral_vesicles.len(), 3);

        // 5. LibÃƒÂ©ration et Lyse
        // Au prochain tick, l'assemblage continue. Les copies virales atteignent 6.
        let tick2 = orchestrator.tick(&mut cell, "Normal task");
        // Le seuil de lyse (6 copies) est atteint. BOOM !
        assert_eq!(
            tick2,
            TickResult::Halted("Lysis: Cell burst due to viral replication overload".to_string())
        );
    }

    #[test]
    fn test_bacteria_vs_viruses() {
        let mut orchestrator = Orchestrator::new(None);

        let mut human_cell = mock_cell(); // Pas de paroi (has_cell_wall = false par dÃƒÂ©faut)
        human_cell
            .plasma_membrane
            .incoming_receptors
            .push("SPIKE".to_string());

        let mut bacteria = mock_cell();
        bacteria.plasma_membrane.has_cell_wall = true; // C'est une bactÃƒÂ©rie

        // 1. Un virus attaque la cellule humaine
        let flu_virus = genos_core::virology::Virion {
            genome: genos_core::genome::DnaStrand::synthesize("HACK"),
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

        // RÃƒÂ©sultat catastrophique : La bactÃƒÂ©rie (mÃƒÂªme bonne) est morte (0 ATP)
        assert_eq!(patient[1].mitochondria.atp_budget, 0);
        // Mais la cellule humaine est toujours infectÃƒÂ©e par le virus (Les antibios sont inutiles)
        assert_eq!(patient[0].cytoplasm.viral_infections.len(), 1);

        // 3. Le bon traitement : Les antiviraux
        orchestrator.administer_systemic_therapy(SystemicTherapy::Antiviral, &mut patient);
        // Le virus a ÃƒÂ©tÃƒÂ© purgÃƒÂ© de la cellule
        assert_eq!(patient[0].cytoplasm.viral_infections.len(), 0);

        // 4. La prÃƒÂ©vention : Le Vaccin
        orchestrator.administer_systemic_therapy(
            SystemicTherapy::Vaccine("SPIKE".to_string()),
            &mut patient,
        );

        // On essaie de rÃƒÂ©-infecter la cellule humaine
        orchestrator.expose_to_virus(&mut patient[0], flu_virus);
        // Echec ! Le vaccin a fonctionnÃƒÂ©, l'infection n'est pas passÃƒÂ©e
        assert_eq!(patient[0].cytoplasm.viral_infections.len(), 0);
    }

    #[test]
    fn test_innate_immunity_phagocytes() {
        let mut orchestrator = Orchestrator::new(None);

        // 1. Le Danger (Un virus nu trÃƒÂ¨s rÃƒÂ©sistant)
        let virus = genos_core::virology::Virion {
            genome: genos_core::genome::DnaStrand::synthesize("VIRUS_T_LETHAL"),
            capsid_integrity: 1.0,
            envelope_spike: "UNKNOWN".to_string(),
            is_lytic: true,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };

        // 2. La Sentinelle (Macrophage localisÃƒÂ© ÃƒÂ  la frontiÃƒÂ¨re du rÃƒÂ©seau)
        // La sentinelle possÃƒÂ¨de le radar pour dÃƒÂ©tecter l'intrus
        let pathogen_detected = true;

        // 3. L'Alerte : La sentinelle relÃƒÂ¢che des cytokines (IL-6)
        if pathogen_detected {
            orchestrator.immune_system.il6_level += 20.0; // SirÃƒÂ¨ne d'alarme (Inflammation locale)
        }
        assert!(orchestrator.immune_system.il6_level >= 10.0); // Le quartier gÃƒÂ©nÃƒÂ©ral sait qu'il y a une attaque

        // 4. Les Renforts : Le PolynuclÃƒÂ©aire Neutrophile (Fantassin Kamikaze)
        let mut neutrophil = mock_cell();
        neutrophil.mitochondria.atp_budget = 10;

        // 5. La Phagocytose (L'attaque)
        // a. Ingestion : Le fantassin engloutit le virus
        neutrophil.phagocytize_virus(virus);
        assert_eq!(neutrophil.lysosomes.phagosomes.len(), 1);

        // b. Digestion et Expulsion
        orchestrator.tick(&mut neutrophil, "Phagocytosis in progress");

        // L'ADN viral a ÃƒÂ©tÃƒÂ© dÃƒÂ©truit et digÃƒÂ©rÃƒÂ© par les enzymes !
        assert_eq!(neutrophil.lysosomes.phagosomes.len(), 0);
        assert!(neutrophil.lysosomes.digestive_enzymes_active);

        // Le Neutrophile a recrachÃƒÂ© les restes et a gagnÃƒÂ© un peu d'ÃƒÂ©nergie au passage (10 - 5 + 5 = 10)
        assert_eq!(neutrophil.lysosomes.expelled_debris.len(), 1);
        assert!(neutrophil.lysosomes.expelled_debris[0].contains("DEBRIS"));

        // c. Le Neutrophile meurt (Apoptose Kamikaze programmÃƒÂ©e) pour former le "pus"
        neutrophil.mitochondria.atp_budget = 0;
        assert_eq!(neutrophil.mitochondria.atp_budget, 0);
    }

    #[test]
    fn test_b_lymphocytes_and_antibodies() {
        let mut orchestrator = Orchestrator::new(None);

        // Un Virus ennemi
        let mut flu_virus = genos_core::virology::Virion {
            genome: genos_core::genome::DnaStrand::synthesize("FLU_CODE"),
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

        // 2. DiffÃƒÂ©renciation en Plasmocyte (Usine d'armement) - Produit des IgG (VÃƒÂ©tÃƒÂ©rans)
        b_lymphocyte_plasmocyte
            .differentiate_into_plasmocyte("SPIKE_FLU", genos_core::cell::IgClass::IgG);
        // Le RÃƒÂ©ticulum (Usine) gonfle
        assert_eq!(
            b_lymphocyte_plasmocyte
                .endoplasmic_reticulum
                .active_ribosomes_count,
            1_000_000
        );
        // Des milliers d'anticorps sont crÃƒÂ©ÃƒÂ©s dans le Golgi
        assert_eq!(
            b_lymphocyte_plasmocyte
                .golgi_apparatus
                .produced_antibodies
                .len(),
            2000
        );

        // 3. DiffÃƒÂ©renciation en Cellule MÃƒÂ©moire (Gardien de la Paix)
        b_lymphocyte_memory.differentiate_into_memory_b_cell("SPIKE_FLU");
        // Le mÃƒÂ©tabolisme chute pour vivre des annÃƒÂ©es
        assert_eq!(b_lymphocyte_memory.mitochondria.metabolic_rate, 0.1);
        // L'antigÃƒÂ¨ne est mÃƒÂ©morisÃƒÂ©
        assert!(b_lymphocyte_memory
            .cytoplasm
            .cognition
            .semantic_memory
            .contains(&"KNOWN_ANTIGEN_SPIKE_FLU".to_string()));

        // 4. Les Anticorps sont libÃƒÂ©rÃƒÂ©s dans le sang de l'Orchestrateur
        let released_antibody = b_lymphocyte_plasmocyte
            .golgi_apparatus
            .produced_antibodies
            .pop()
            .unwrap();
        orchestrator.immune_system.circulating_antibodies.push(released_antibody);

        // 5. La Rencontre : L'Anticorps neutralise le Virus
        let mut virions_in_blood = vec![flu_virus];
        orchestrator.process_humoral_immunity(&mut virions_in_blood);

        let neutralized_flu = virions_in_blood[0].clone();
        assert!(neutralized_flu.is_neutralized);
        assert!(neutralized_flu.is_opsonized);

        // 6. EfficacitÃƒÂ© de la Neutralisation
        let mut human_cell = mock_cell();
        human_cell
            .plasma_membrane
            .incoming_receptors
            .push("SPIKE_FLU".to_string());

        // Le virus tente d'entrer, mais il est couvert d'anticorps !
        orchestrator.expose_to_virus(&mut human_cell, neutralized_flu.clone());
        // Echec ! La cellule n'est pas infectÃƒÂ©e
        assert_eq!(human_cell.cytoplasm.viral_infections.len(), 0);

        // 7. EfficacitÃƒÂ© de l'Opsonisation (Le Phagocyte est attirÃƒÂ©)
        let mut macrophage = mock_cell();
        macrophage.mitochondria.atp_budget = 10;

        // Il mange le virus opsonisÃƒÂ©
        macrophage.phagocytize_virus(neutralized_flu);
        // Le boost d'appÃƒÂ©tit (Opsonisation) lui donne +20 ATP instantanÃƒÂ©ment !
        assert_eq!(macrophage.mitochondria.atp_budget, 30);
    }

    #[test]
    fn test_t_lymphocytes_roles() {
        let mut orchestrator = Orchestrator::new(None);

        let mut human_cell = mock_cell();
        human_cell.mitochondria.atp_budget = 50;

        // 1. Infection de la cellule (Le virus s'infiltre discrÃƒÂ¨tement)
        let virus = genos_core::virology::Virion {
            genome: genos_core::genome::DnaStrand::synthesize("HIDDEN_VIRUS"),
            capsid_integrity: 1.0,
            envelope_spike: "STEALTH_SPIKE".to_string(),
            is_lytic: false,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };
        human_cell.cytoplasm.viral_infections.push(virus.clone());

        // 2. Le CMH (PrÃƒÂ©sentoir)
        // La cellule traite un cycle. Son CMH affiche maintenant le spike du virus
        orchestrator.tick(&mut human_cell, "Normal duty");
        assert_eq!(
            human_cell.plasma_membrane.mhc_display,
            Some("STEALTH_SPIKE".to_string())
        );

        // 3. Le T-Helper (GÃƒÂ©nÃƒÂ©ral) sonne la charge
        let mut t_helper_cd4 = mock_cell();
        // Il lit un rapport de sentinelle et active l'armÃƒÂ©e
        orchestrator.immune_system.immune_activation_level = 100.0;
        orchestrator.immune_system.il6_level = 50.0; // Forte inflammation

        // 4. Le Lymphocyte T Cytotoxique (CD8 - Assassin)
        let mut t_cytotoxic_cd8 = mock_cell();

        // Le CD8 patrouille, lit le CMH de la cellule humaine, et reconnaÃƒÂ®t l'antigÃƒÂ¨ne
        // Le combat au corps-ÃƒÂ -corps a lieu : il injecte la perforine
        t_cytotoxic_cd8.t_cell_perforin_attack(&mut human_cell, "STEALTH_SPIKE");

        // La cellule humaine infectÃƒÂ©e est morte (Apoptose forcÃƒÂ©e)
        assert_eq!(human_cell.mitochondria.atp_budget, 0);

        // 5. Le Lymphocyte T RÃƒÂ©gulateur (Casque Bleu) siffle la fin de la guerre
        let mut t_regulatory = mock_cell();
        // Il sÃƒÂ©crÃƒÂ¨te des cytokines inhibitrices pour calmer le systÃƒÂ¨me
        orchestrator.immune_system.immune_activation_level = 0.0;
        orchestrator.immune_system.il6_level = 0.0;

        assert_eq!(orchestrator.immune_system.immune_activation_level, 0.0);
        assert_eq!(orchestrator.immune_system.il6_level, 0.0); // Le calme est revenu
    }

    #[test]
    fn test_antibody_classes_and_allergies() {
        let mut orchestrator = Orchestrator::new(None);

        let pollen = genos_core::virology::Virion {
            genome: genos_core::genome::DnaStrand::synthesize("POLLEN_HARMLESS"),
            capsid_integrity: 1.0,
            envelope_spike: "POLLEN_SPIKE".to_string(),
            is_lytic: false,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };

        let bacteria = genos_core::virology::Virion {
            genome: genos_core::genome::DnaStrand::synthesize("BACTERIA_BAD"),
            capsid_integrity: 1.0,
            envelope_spike: "BACTERIA_SPIKE".to_string(),
            is_lytic: true,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        };

        // 1. ALLERGIE (IgE) : L'erreur du systÃƒÂ¨me
        let mut b_cell_allergy = mock_cell();
        b_cell_allergy
            .differentiate_into_plasmocyte("POLLEN_SPIKE", genos_core::cell::IgClass::IgE);
        orchestrator.immune_system.circulating_antibodies.push(
            b_cell_allergy
                .golgi_apparatus
                .produced_antibodies
                .pop()
                .unwrap(),
        );

        let mut blood = vec![pollen.clone()];
        orchestrator.process_humoral_immunity(&mut blood);
        // Le pollen inoffensif a dÃƒÂ©clenchÃƒÂ© un choc allergique massif (IL-6 augmente)
        assert!(orchestrator.immune_system.il6_level >= 10.0);

        // 2. AGGLUTINATION (IgM) : Les 5 bras ÃƒÂ©toiles collent les bactÃƒÂ©ries
        let mut b_cell_igm = mock_cell();
        b_cell_igm.differentiate_into_plasmocyte("BACTERIA_SPIKE", genos_core::cell::IgClass::IgM);
        orchestrator.immune_system.circulating_antibodies.push(
            b_cell_igm
                .golgi_apparatus
                .produced_antibodies
                .pop()
                .unwrap(),
        );

        let mut blood_bacteria = vec![bacteria.clone()];
        orchestrator.process_humoral_immunity(&mut blood_bacteria);
        // La bactÃƒÂ©rie est engluÃƒÂ©e dans l'ÃƒÂ©toile IgM
        assert!(blood_bacteria[0].is_agglutinated);
        assert!(blood_bacteria[0].is_neutralized);

        // 3. SYSTEME DU COMPLEMENT (IgG) : Perforation de la cible
        let mut b_cell_igg = mock_cell();
        b_cell_igg.differentiate_into_plasmocyte("BACTERIA_SPIKE", genos_core::cell::IgClass::IgG);
        orchestrator.immune_system.circulating_antibodies.push(
            b_cell_igg
                .golgi_apparatus
                .produced_antibodies
                .pop()
                .unwrap(),
        );

        let mut blood_bacteria_igg = vec![bacteria.clone()];
        orchestrator.process_humoral_immunity(&mut blood_bacteria_igg);
        // Le ComplÃƒÂ©ment est activÃƒÂ© par l'IgG : la coque (capsid_integrity) est percÃƒÂ©e (0.0) !
        assert_eq!(blood_bacteria_igg[0].capsid_integrity, 0.0);
    }
}

