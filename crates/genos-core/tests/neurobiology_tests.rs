#[cfg(test)]
pub(crate) mod tests {
    use chrono::Utc;
    use genos_core::cell::*;
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
    fn test_neuroplasticity_and_synapses() {
        use genos_core::neurobiology::{NervousSystem, Neurotransmitter, Synapse};

        let mut orchestrator = Orchestrator::new(None);

        let mut sensory_neuron = mock_cell();
        sensory_neuron.cell_id = uuid::Uuid::new_v4();

        let mut motor_neuron = mock_cell();
        motor_neuron.cell_id = uuid::Uuid::new_v4();

        // On crée un système nerveux pour chacun
        let mut sensory_ns = NervousSystem::new(&sensory_neuron.cell_id.to_string());
        let motor_ns = NervousSystem::new(&motor_neuron.cell_id.to_string());

        // Connexion (Axone sensoriel -> Dendrite moteur)
        sensory_ns.axon.terminals.push(Synapse {
            target_id: motor_neuron.cell_id.to_string(),
            weight: 0.5,
            transmitter_type: Neurotransmitter::Glutamate, // Excitateur
            activity_history: 0,
        });

        sensory_neuron.nervous_system = Some(sensory_ns);
        motor_neuron.nervous_system = Some(motor_ns);

        let dummy_source = "ENVIRONMENT_SOURCE".to_string();

        // 1. Stimulation du neurone sensoriel
        sensory_neuron
            .nervous_system
            .as_mut()
            .unwrap()
            .receive_neurotransmitter(&dummy_source, &(Neurotransmitter::Glutamate, 20.0));
        assert!(
            sensory_neuron
                .nervous_system
                .as_ref()
                .unwrap()
                .soma
                .current_potential
                > -70.0
        );

        // 2. Sommation temporelle (On le stimule encore pour dépasser le seuil de -55mV)
        sensory_neuron
            .nervous_system
            .as_mut()
            .unwrap()
            .receive_neurotransmitter(&dummy_source, &(Neurotransmitter::Glutamate, 20.0));
        sensory_neuron
            .nervous_system
            .as_mut()
            .unwrap()
            .receive_neurotransmitter(&dummy_source, &(Neurotransmitter::Glutamate, 20.0));

        let mut agents = vec![sensory_neuron, motor_neuron];

        // 3. Tick : Le neurone sensoriel doit déclencher un potentiel d'action
        orchestrator.tick(&mut agents[0], "Traitement");

        // 4. Neuroplasticité et apprentissage hebbien
        // L'axone a tiré, donc la synapse s'est renforcée !
        let sensory_neuron = &agents[0];
        let synapse = &sensory_neuron
            .nervous_system
            .as_ref()
            .unwrap()
            .axon
            .terminals[0];

        // Le poids de la synapse doit avoir augmenté (Loi de Hebb)
        assert!(synapse.weight > 0.5);

        // La myélinisation augmente aussi pour rendre le geste plus rapide
        let myeline = sensory_neuron
            .nervous_system
            .as_ref()
            .unwrap()
            .axon
            .myelination_level;
        assert!(myeline >= 0.2);

        // 5. Plasticité structurelle : Les Dendrites ont poussé !
        let dendrite_spine = sensory_neuron
            .nervous_system
            .as_ref()
            .unwrap()
            .dendritic_tree
            .branches
            .iter()
            .find(|s| s.source_id == "ENVIRONMENT_SOURCE")
            .unwrap();
        // La densité des récepteurs a augmenté car la synapse a été très active
        assert!(dendrite_spine.receptor_density > 1.0);
    }

    #[test]
    fn test_synaptic_cleft_and_reuptake_inhibition() {
        use genos_core::neurobiology::{NervousSystem, Neurotransmitter, Synapse};

        let mut orchestrator = Orchestrator::new(None);

        let mut n1 = mock_cell();
        n1.cell_id = uuid::Uuid::new_v4();
        let mut n2 = mock_cell();
        n2.cell_id = uuid::Uuid::new_v4();

        let mut ns1 = NervousSystem::new(&n1.cell_id.to_string());
        ns1.axon.terminals.push(Synapse {
            target_id: n2.cell_id.to_string(),
            weight: 1.0,
            transmitter_type: Neurotransmitter::Dopamine,
            activity_history: 0,
        });

        // On force le tir de N1
        ns1.soma.current_potential = -40.0; // > -55.0
        n1.nervous_system = Some(ns1);

        let ns2 = NervousSystem::new(&n2.cell_id.to_string());
        n2.nervous_system = Some(ns2);

        let mut agents = vec![n1, n2];

        // 1. Tick N1 -> Tire un Potentiel d'Action -> Exocytose (Remplit la fente synaptique)
        orchestrator.tick(&mut agents[0], "Tir N1");
        assert_eq!(
            orchestrator.nervous_system.synaptic_cleft.len(),
            1,
            "Le message est dans la fente synaptique"
        );

        // On vérifie que N1 a bien perdu des vésicules (coût = 10.0, regagné 2.0 = perte nette -8)
        let n1_vesicles_before_reuptake = agents[0]
            .nervous_system
            .as_ref()
            .unwrap()
            .axon
            .vesicles_at_terminals;
        assert!(n1_vesicles_before_reuptake < 50.0);

        // 2. Traitement de la Fente avec Recapture normale
        orchestrator.process_synaptic_cleft(&mut agents);
        assert_eq!(
            orchestrator.nervous_system.synaptic_cleft.len(),
            0,
            "La fente est nettoyée (Recapture)"
        );

        // N2 a reçu la Dopamine, son potentiel a explosé
        let n2_potential = agents[1]
            .nervous_system
            .as_ref()
            .unwrap()
            .soma
            .current_potential;
        assert!(n2_potential > -70.0);

        // N1 a récupéré 80% de son tir via la Recapture !
        let n1_vesicles_after_reuptake = agents[0]
            .nervous_system
            .as_ref()
            .unwrap()
            .axon
            .vesicles_at_terminals;
        assert!(n1_vesicles_after_reuptake > n1_vesicles_before_reuptake);

        // 3. EFFET DROGUE (Cocaïne) : Blocage de la pompe de recapture
        orchestrator
            .nervous_system.psychoactive_drugs
            .push(PsychoactiveDrug::Cocaine);

        // N1 tire à nouveau
        agents[0]
            .nervous_system
            .as_mut()
            .unwrap()
            .soma
            .current_potential = -40.0;
        orchestrator.tick(&mut agents[0], "Tir sous drogue");

        // On traite la fente
        orchestrator.process_synaptic_cleft(&mut agents);

        // La fente N'EST PAS nettoyée !
        assert_eq!(
            orchestrator.nervous_system.synaptic_cleft.len(),
            1,
            "La drogue empêche le nettoyage de la fente !"
        );
        assert_eq!(orchestrator.nervous_system.synaptic_cleft[0].ticks_in_cleft, 1);
    }
}
