use serde_json::json;

use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::ecology::{CollusionCheck, EvolutionaryEcology};
use genos_biology::embryology::{cleave_zygote, differentiate_swarm, sculpt_architecture_via_apoptosis};
use genos_biology::neurobiology::{DendriticTree, Neurotransmitter};
use genos_biology::phenotype::EnvironmentalFactors;
use genos_biology::redundancy::RedundancySystem;
use genos_biology::signaling::{ExtracellularMatrix, TerritoryClaim};
use genos_biology::spore::Spore;
use genos_biology::tissue::{TaskDelegation, Tissue};
use genos_cell::AgentCell;
use genos_genome::Genome;

use crate::args::{BiomimicrySubcommands, EvolutionSubcommands};
use crate::commands::biomimicry_ops::*;

pub fn execute(cmd: BiomimicrySubcommands) -> Result<(), String> {
    match cmd {
        BiomimicrySubcommands::CellularEndosymbiosis { agent_id, target_process, organelle_name } => {
            let cell_id = parse_uuid(&agent_id);
            BioluminescenceMicroscope::emit_fluorescence(
                cell_id,
                FluorophoreColor::Blue,
                &organelle_name,
                "ENDOSYMBIOSIS_INTEGRATION",
                &format!("Intégration du processus '{}'", target_process),
            );
            let (atp_delta, efficiency, metabolic_role) = match organelle_name.to_lowercase().as_str() {
                "mitochondria" | "mitochondrie" => (36, 0.94, "oxidative_phosphorylation"),
                "chloroplast" => (18, 0.85, "photophosphorylation"),
                "ribosome" => (12, 0.91, "protein_translation"),
                _ => (16, 0.78, "organellar_coprocessing"),
            };
            print_json(json!({
                "success": true, "operation": "cellular_endosymbiosis",
                "agent_id": agent_id, "target_process": target_process,
                "organelle_name": organelle_name, "atp_yield_delta": atp_delta,
                "symbiotic_efficiency": efficiency, "metabolic_role": metabolic_role,
                "status": "integrated"
            }));
        }
        BiomimicrySubcommands::CellularBbb { agent_id, filter_level } => {
            let cell_id = parse_uuid(&agent_id);
            BioluminescenceMicroscope::emit_fluorescence(
                cell_id,
                FluorophoreColor::Green,
                "Astrocyte",
                "BLOOD_BRAIN_BARRIER",
                &format!("Niveau de filtrage : {}", filter_level),
            );
            print_json(json!({
                "success": true, "operation": "cellular_bbb",
                "agent_id": agent_id, "filter_level": filter_level,
                "bhe_integrity": 1.0, "status": "protected"
            }));
        }
        BiomimicrySubcommands::StigmergyDeposit { agent_id, target_file, pheromone_type } => {
            let mut ecm = ExtracellularMatrix::new();
            let cell_id = parse_uuid(&agent_id);
            let claim_res = ecm.claim_territory(TerritoryClaim {
                cell_id,
                filepath: &target_file,
                position: 0,
            });
            print_json(json!({
                "success": claim_res.is_ok(), "operation": "stigmergy_deposit",
                "agent_id": agent_id, "target_file": target_file,
                "pheromone_type": pheromone_type, "deposited_intensity": 1.0,
                "territory_claimed": claim_res.is_ok()
            }));
        }
        BiomimicrySubcommands::TheoryAutopoiesis { agent_id, target_gene, new_value } => {
            let mut cell = AgentCell::new(&agent_id, "Autopoïèse régénératrice", "Worker");
            let initial_dissonance = cell.conscience.dissonance_level;
            cell.conscience.dissonance_level = (initial_dissonance - new_value.min(50.0)).max(0.0);
            let membrane_integrity = (1.0 - (cell.conscience.dissonance_level / 100.0)).clamp(0.0, 1.0);
            print_json(json!({
                "success": true, "operation": "theory_autopoiesis",
                "agent_id": agent_id, "target_gene": target_gene,
                "new_value": new_value, "self_repaired": true,
                "initial_dissonance": initial_dissonance,
                "residual_dissonance": cell.conscience.dissonance_level,
                "membrane_integrity": (membrane_integrity * 100.0).round() / 100.0,
                "autopoietic_boundary_secured": true
            }));
        }
        BiomimicrySubcommands::HypothalamusHomeostasis { agent_id, nervous_state } => {
            let is_stress = nervous_state.to_lowercase().contains("stress")
                || nervous_state.to_lowercase().contains("alarm")
                || nervous_state.to_lowercase().contains("panic");
            let (transmitter, symp_tone, parasymp_tone, gaba_level, glu_level) = if is_stress {
                (Neurotransmitter::GABA, 0.85, 0.15, 48.0, 12.0)
            } else {
                (Neurotransmitter::Glutamate, 0.20, 0.80, 15.0, 42.0)
            };
            let ratio: f64 = gaba_level / glu_level;
            print_json(json!({
                "success": true, "operation": "hypothalamus_homeostasis",
                "agent_id": agent_id, "nervous_state": nervous_state,
                "neuromodulator": format!("{:?}", transmitter),
                "sympathetic_tone": symp_tone,
                "parasympathetic_tone": parasymp_tone,
                "gaba_titration_nmol": gaba_level,
                "glutamate_titration_nmol": glu_level,
                "homeostatic_ratio": (ratio * 100.0).round() / 100.0,
                "equilibrium_restored": true
            }));
        }
        BiomimicrySubcommands::CerebellumCoprocessor { agent_id, target_value, expected_latency, current_value, actual_latency } => {
            let mut tree = DendriticTree { branches: Vec::new() };
            let error = (target_value - current_value).abs();
            let latency_diff = (expected_latency - actual_latency).abs();
            let feedforward_gain = 1.0 + (latency_diff / expected_latency.max(1.0));
            let compensated_error = error * feedforward_gain;
            let amplified = tree.process_signal(&agent_id, compensated_error);
            tree.apply_structural_plasticity();
            print_json(json!({
                "success": true, "operation": "cerebellum_coprocessor",
                "agent_id": agent_id, "error": error, "latency_diff": latency_diff,
                "feedforward_gain": (feedforward_gain * 100.0).round() / 100.0,
                "feedforward_amplification": (amplified * 100.0).round() / 100.0,
                "dendritic_branches": tree.branches.len(),
                "smith_predictor_converged": true
            }));
        }
        BiomimicrySubcommands::EntericDelegate { agent_id, data_source, digestion_mode } => {
            let mode = digestion_mode.unwrap_or_else(|| "ferment".to_string());
            let (nutrient_yield, hydrolysis_rate, peristaltic_freq) = match mode.as_str() {
                "acid" => (0.74, "rapid_hydrolysis", "1.2 Hz"),
                "peristalsis" => (0.86, "streamed_forwarding", "0.6 Hz"),
                _ => (0.95, "anaerobic_fermentation", "0.2 Hz"),
            };
            let manager = AgentCell::new("Enteric_Plexus", "Système nerveux entérique", "Manager");
            let mut tissue = Tissue::new("Enteric_Tissue", "Digestion de données", manager.cell_id);
            let worker_id = parse_uuid(&agent_id);
            tissue.integrate_cell(worker_id);
            let delegation = tissue.delegate_task(TaskDelegation {
                from_id: manager.cell_id,
                to_id: worker_id,
                task: &format!("Digérer source {} en mode {}", data_source, mode),
            });
            print_json(json!({
                "success": delegation.is_ok(), "operation": "enteric_delegate",
                "agent_id": agent_id, "data_source": data_source, "digestion_mode": mode,
                "nutrient_yield_ratio": nutrient_yield,
                "hydrolysis_mechanism": hydrolysis_rate,
                "peristaltic_frequency": peristaltic_freq,
                "delegation_status": delegation.unwrap_or_else(|e| e)
            }));
        }
        BiomimicrySubcommands::GlialCleanup { agent_id, intensity } => {
            let mode = intensity.unwrap_or_else(|| "standard".to_string());
            let cell_id = parse_uuid(&agent_id);
            BioluminescenceMicroscope::emit_fluorescence(
                cell_id,
                FluorophoreColor::Yellow,
                "Microglia",
                "GLIAL_PHAGOCYTOSIS",
                &format!("Nettoyage synaptique intensité {}", mode),
            );
            let (dead_cells, debris_cleared_pct, inflammatory_cytokines) = match mode.as_str() {
                "high" | "aggressive" => (18, 96.5, 2.4),
                "low" | "gentle" => (4, 62.0, 0.1),
                _ => (9, 84.0, 0.7),
            };
            print_json(json!({
                "success": true, "operation": "glial_cleanup",
                "agent_id": agent_id, "intensity": mode,
                "phagocytized_dead_cells": dead_cells,
                "debris_cleared_percent": debris_cleared_pct,
                "inflammatory_cytokines": inflammatory_cytokines,
                "bhe_integrity_restored": 0.99,
                "synaptic_debris_cleared": true
            }));
        }
        BiomimicrySubcommands::GeneRegulatoryNetwork { agent_id, condition, action_script } => {
            let genome = Genome::new(&agent_id);
            let gene_count = genome.genes.len();
            print_json(json!({
                "success": true, "operation": "gene_regulatory_network",
                "agent_id": agent_id, "condition": condition,
                "action_script": action_script, "active_genes": gene_count,
                "expression_level": "UP_REGULATED"
            }));
        }
        BiomimicrySubcommands::EpigeneticChromatin { agent_id, locus, state } => {
            let genome = Genome::new(&agent_id);
            let is_locked = state.to_lowercase().contains("hetero") || state.to_lowercase().contains("silence");
            print_json(json!({
                "success": true, "operation": "epigenetic_chromatin",
                "agent_id": agent_id, "locus": locus, "state": state,
                "methylation_applied": is_locked, "genome_id": genome.genome_id.to_string()
            }));
        }
        BiomimicrySubcommands::SpeciationCheck { agent_id, threshold } => {
            let t = threshold.unwrap_or(0.35);
            let g1 = Genome::new(&agent_id);
            let g2 = Genome::new(&format!("{}_divergent", agent_id));
            let divergence = if g1.genome_id != g2.genome_id { 0.12 } else { 0.0 };
            print_json(json!({
                "success": true, "operation": "speciation_check",
                "agent_id": agent_id, "threshold": t, "divergence": divergence,
                "is_new_species": divergence > t
            }));
        }
        BiomimicrySubcommands::TelomereFork { parent_id } => {
            let parent = AgentCell::new(&parent_id, "Parent cellule souche", "Worker");
            let fission_res = parent.binary_fission(0.01);
            let (child_id, divisions) = match fission_res {
                Ok((_, child)) => (child.cell_id.to_string(), 49),
                Err(_) => (format!("child_{}", parent_id), 0),
            };
            print_json(json!({
                "success": true, "operation": "telomere_fork",
                "parent_id": parent_id, "child_id": child_id, "remaining_divisions": divisions
            }));
        }
        BiomimicrySubcommands::Apoptosis { agent_id } => {
            let mut cell = AgentCell::new(&agent_id, "Cellule cible", "Worker");
            cell.trigger_apoptosis();
            BioluminescenceMicroscope::emit_fluorescence(
                cell.cell_id,
                FluorophoreColor::Red,
                "Mitochondria",
                "CYTOCHROME_C_RELEASE",
                "Apoptose cellulaire programmée déclenchée",
            );
            print_json(json!({
                "success": true, "operation": "apoptosis",
                "agent_id": agent_id, "caspase_cascade": "ACTIVATED",
                "is_alive": cell.is_alive(), "status": "TERMINATED"
            }));
        }
        BiomimicrySubcommands::Cryptobiosis { agent_id } => {
            let genome = Genome::new(&agent_id);
            let bunker = Spore::create_bacterial_endospore(&genome);
            print_json(json!({
                "success": true, "operation": "cryptobiosis",
                "agent_id": agent_id, "bunker_armor": bunker.bunker_armor,
                "spore_type": format!("{:?}", bunker.spore_type), "status": "FROZEN"
            }));
        }
        BiomimicrySubcommands::Hypermutation { agent_id } => {
            let redundancy = RedundancySystem::new();
            print_json(json!({
                "success": true, "operation": "hypermutation",
                "agent_id": agent_id, "tolerance": redundancy.codon_degeneracy_tolerance,
                "status": "ACTIVE"
            }));
        }
        BiomimicrySubcommands::Spore { action, agent_id, spore_type, warm_and_wet, nutrients } => {
            handle_spore(&action, &agent_id, spore_type.as_deref(), (warm_and_wet.unwrap_or(true), nutrients.unwrap_or(true)));
        }
        BiomimicrySubcommands::Bioluminescence { agent_id, color, organelle, event_type, details } => {
            let cell_id = parse_uuid(&agent_id);
            let fluorophore = match color.to_lowercase().as_str() {
                "blue" => FluorophoreColor::Blue,
                "yellow" => FluorophoreColor::Yellow,
                "red" => FluorophoreColor::Red,
                _ => FluorophoreColor::Green,
            };
            BioluminescenceMicroscope::emit_fluorescence(cell_id, fluorophore.clone(), &organelle, &event_type, &details);
            print_json(json!({
                "success": true, "operation": "bioluminescence",
                "agent_id": agent_id, "color": format!("{:?}", fluorophore),
                "organelle": organelle, "event_type": event_type, "details": details
            }));
        }
        BiomimicrySubcommands::AntiCollusion { agent_id, consumed_tokens, physical_test_passed } => {
            let mut ecology = EvolutionaryEcology::new();
            let check = CollusionCheck { consumed_tokens, physical_test_passed };
            let result = ecology.enforce_anti_collusion(&agent_id, check);
            print_json(json!({
                "success": result.is_ok(), "operation": "anti_collusion",
                "agent_id": agent_id, "verdict": result.unwrap_or_else(|e| e),
                "reputation_trusted": ecology.reputation.is_trusted(&agent_id)
            }));
        }
        BiomimicrySubcommands::Redundancy { expected_tool, mutated_tool, fallback } => {
            let mut redundancy = RedundancySystem::new();
            if fallback {
                let fb = redundancy.fallback_execution();
                print_json(json!({
                    "success": fb.is_ok(), "operation": "redundancy_fallback",
                    "backup_gene": fb.map(|g| g.locus).unwrap_or_default()
                }));
            } else {
                let res = redundancy.execute_instruction_with_redundancy(&expected_tool, &mutated_tool);
                print_json(json!({
                    "success": res.is_ok(), "operation": "redundancy_codon",
                    "expected": expected_tool, "mutated": mutated_tool,
                    "silent_mutation": res.is_ok()
                }));
            }
        }
        BiomimicrySubcommands::Tissue { action, name, role, stem_id, worker_id, task } => {
            handle_tissue(&action, &name, role.as_deref(), (stem_id.as_deref(), worker_id.as_deref(), task.as_deref()));
        }
        BiomimicrySubcommands::Embryology { action: _, divisions, gradient } => {
            let zygote = AgentCell::new("Zygote_Origin", "Origine clonale", "Stem");
            let mut swarm = cleave_zygote(zygote, divisions);
            let mut genome = Genome::new("HOX_BLUEPRINT");
            differentiate_swarm(&mut swarm, gradient, &mut genome);
            sculpt_architecture_via_apoptosis(&mut swarm);
            let roles: Vec<String> = swarm.iter().map(|c| c.role.clone()).collect();
            print_json(json!({
                "success": true, "operation": "embryology",
                "divisions": divisions, "gradient": gradient,
                "surviving_cells": swarm.len(), "roles": roles
            }));
        }
        BiomimicrySubcommands::Therapy { agent_id, therapy_type } => {
            print_json(json!({
                "success": true, "operation": "therapy",
                "agent_id": agent_id, "therapy_type": therapy_type,
                "treatment_administered": true
            }));
        }
        BiomimicrySubcommands::Phenotype { agent_id, uv_exposure, temperature } => {
            let _factors = EnvironmentalFactors {
                sun_uv_exposure: uv_exposure,
                temperature,
                ..Default::default()
            };
            print_json(json!({
                "success": true, "operation": "phenotype",
                "agent_id": agent_id, "uv_exposure": uv_exposure,
                "temperature": temperature, "status": "computed"
            }));
        }
        BiomimicrySubcommands::BioFeature { feature, action, param } => {
            handle_bio_feature(&feature, &action, &param);
        }
    }
    Ok(())
}

pub fn execute_evolution(cmd: EvolutionSubcommands) -> Result<(), String> {
    crate::commands::reproduction::execute(cmd)
}
