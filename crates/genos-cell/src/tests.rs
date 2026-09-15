#[cfg(test)]
mod tests {
    use crate::{AgentCell, Organelle};
    use uuid::Uuid;

    #[test]
    fn test_agent_cell_identity_and_conscience() {
        let agent = AgentCell::new("Kwame", "Le planificateur méthodique", "Architecte");
        assert_eq!(agent.name, "Kwame");
        assert_eq!(agent.name_meaning, "Le planificateur méthodique");
        assert!(agent.introduce_self().contains("Kwame"));
        assert!(agent.introduce_self().contains("Le planificateur méthodique"));
        assert!(agent.is_alive());
        assert_eq!(agent.conscience.dissonance_level, 0.0);
    }

    #[test]
    fn test_typed_organelles_are_serializable_state() {
        let mut agent = AgentCell::new("Host", "Host cell", "Worker");
        agent.organelles.push(Organelle::Mitochondrion {
            id: Uuid::new_v4(),
            atp_budget: 36,
            efficiency: 0.94,
        });
        agent.organelles.push(Organelle::Ribosome {
            id: Uuid::new_v4(),
            translation_capacity: 12,
        });
        let encoded = serde_json::to_string(&agent).expect("cell must serialize");
        let decoded: AgentCell = serde_json::from_str(&encoded).expect("cell must deserialize");
        assert_eq!(decoded.organelle_count(), 2);
    }

    #[test]
    fn test_binary_fission_budget_division_and_organelle_uniqueness() {
        let mut parent = AgentCell::new("ParentCell", "Prokaryote model", "Worker");
        parent.conscience.current_budget = 80.0;
        let organelle_id = Uuid::new_v4();
        parent.organelles.push(Organelle::Ribosome {
            id: organelle_id,
            translation_capacity: 10,
        });

        let (daughter_a, daughter_b) = parent.binary_fission(0.05).expect("fission must succeed");
        assert_eq!(daughter_a.cell_id, parent.cell_id);
        assert_ne!(daughter_b.cell_id, parent.cell_id);

        // Budget conservation
        assert_eq!(daughter_a.conscience.current_budget, 40.0);
        assert_eq!(daughter_b.conscience.current_budget, 40.0);
        assert_eq!(daughter_a.conscience.current_budget + daughter_b.conscience.current_budget, parent.conscience.current_budget);

        // Organelle ID uniqueness
        match (&daughter_a.organelles[0], &daughter_b.organelles[0]) {
            (Organelle::Ribosome { id: id_a, .. }, Organelle::Ribosome { id: id_b, .. }) => {
                assert_eq!(*id_a, organelle_id);
                assert_ne!(*id_b, organelle_id);
                assert_ne!(*id_a, *id_b);
            }
            _ => panic!("Expected Ribosome organelle"),
        }

        // Invalid mutation rates
        assert!(parent.binary_fission(-0.1).is_err());
        assert!(parent.binary_fission(1.1).is_err());
    }

    #[test]
    fn test_mitosis_preserves_total_metabolic_budget() {
        let mut parent = AgentCell::new("Parent", "Symmetric division", "Worker");
        parent.conscience.current_budget = 70.0;
        parent.conscience.baseline_budget = 100.0;

        let (daughter_a, daughter_b) = parent.mitosis().expect("mitosis must succeed");

        assert_eq!(daughter_a.conscience.current_budget, 35.0);
        assert_eq!(daughter_b.conscience.current_budget, 35.0);
        assert_eq!(daughter_a.conscience.baseline_budget, 50.0);
        assert_eq!(daughter_b.conscience.baseline_budget, 50.0);
        assert_eq!(
            daughter_a.conscience.current_budget + daughter_b.conscience.current_budget,
            70.0
        );
        assert_eq!(
            daughter_a.conscience.baseline_budget + daughter_b.conscience.baseline_budget,
            100.0
        );
    }

    #[test]
    fn test_agent_cell_budding_and_hayflick_limit() {
        let mut mother = AgentCell::new("MotherYeast", "Asymmetric budding organism", "ParentWorker");
        mother.conscience.current_budget = 100.0;
        mother.hayflick_limit = 3; // Small limit for testing

        assert_eq!(mother.bud_scars, 0);
        assert_eq!(mother.remaining_divisions(), 3);
        assert!(!mother.is_senescent);

        // Bud 1
        let bud1 = mother.budding(0.3).expect("first bud should succeed");
        assert_eq!(mother.bud_scars, 1);
        assert_eq!(mother.remaining_divisions(), 2);
        assert_eq!(mother.conscience.current_budget, 70.0);
        assert_eq!(bud1.conscience.current_budget, 30.0);
        assert_eq!(bud1.bud_scars, 0);
        assert!(bud1.role.contains("Ephemeral Bud"));

        // Bud 2
        let _bud2 = mother.budding(0.5).expect("second bud should succeed");
        assert_eq!(mother.bud_scars, 2);
        assert_eq!(mother.remaining_divisions(), 1);

        // Bud 3 (reaches limit)
        let _bud3 = mother.budding(0.5).expect("third bud reaches limit");
        assert_eq!(mother.bud_scars, 3);
        assert_eq!(mother.remaining_divisions(), 0);
        assert!(mother.is_senescent);

        // Bud 4 (exceeds limit -> error)
        let err = mother.budding(0.5);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("Hayflick limit reached"));

        // Telomerase restores division potential
        mother.apply_telomerase();
        assert_eq!(mother.bud_scars, 0);
        assert!(!mother.is_senescent);
        assert_eq!(mother.remaining_divisions(), 3);
        assert!(mother.budding(0.2).is_ok());
    }

    #[test]
    fn test_agent_cell_schizogony_burst_and_lysis() {
        let mut mother = AgentCell::new("MotherSchizont", "Source", "Orchestrator");
        mother.conscience.current_budget = 100.0;
        mother.organelles.push(Organelle::Mitochondrion {
            id: Uuid::new_v4(),
            atp_budget: 36,
            efficiency: 0.95,
        });

        // 1. Invalid counts rejected
        assert!(mother.schizogony(1, 0.0).is_err());
        assert!(mother.schizogony(200, 0.0).is_err());

        // 2. Successful schizogonic burst into 4 merozoites
        let merozoites = mother.schizogony(4, 0.05).expect("schizogony must succeed");
        assert_eq!(merozoites.len(), 4);

        // Mother is lysed / apoptotic with zero remaining budget
        assert!(!mother.is_alive());
        assert!(mother.conscience.is_apoptotic);
        assert_eq!(mother.conscience.current_budget, 0.0);

        // Merozoites have partitioned budget and unique identities
        for (i, m) in merozoites.iter().enumerate() {
            assert!(m.is_alive());
            assert_ne!(m.cell_id, mother.cell_id);
            assert_eq!(m.conscience.current_budget, 25.0);
            assert!(m.name.contains(&format!("merozoite_{}", i + 1)));
            assert_eq!(m.organelle_count(), 1);
            // Organelle IDs are refreshed
            match &m.organelles[0] {
                Organelle::Mitochondrion { id, atp_budget, .. } => {
                    assert_ne!(*id, match &mother.organelles[0] { Organelle::Mitochondrion { id, .. } => *id, _ => unreachable!() });
                    assert_eq!(*atp_budget, 36);
                }
                _ => panic!("Expected mitochondrion"),
            }
        }
    }

    #[test]
    fn test_agent_cell_chromatin_state_fields() {
        let mut cell = AgentCell::new("TestCell", "Meaning", "Worker");
        assert!(cell.chromatin_state.is_none());
        assert!(cell.genome_id.is_none());

        let gid = Uuid::new_v4();
        cell.chromatin_state = Some("Euchromatin".into());
        cell.genome_id = Some(gid);

        let serialized = serde_json::to_string(&cell).unwrap();
        let deserialized: AgentCell = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized.chromatin_state, Some("Euchromatin".into()));
        assert_eq!(deserialized.genome_id, Some(gid));
    }
}
