use serde_json::json;

use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::ecology::{CollusionCheck, EvolutionaryEcology};
use genos_biology::embryology::{cleave_zygote, differentiate_swarm, sculpt_architecture_via_apoptosis, seed_hox_genome};
use genos_biology::neurobiology::Neurotransmitter;
use genos_biology::phenotype::{create_default_registry, EnvironmentalFactors};
use genos_biology::redundancy::RedundancySystem;
use genos_biology::tissue::{TaskDelegation, Tissue};
use genos_cell::AgentCell;
use genos_genome::{Gene, Genome};
use rand;
use std::fs;
use std::path::PathBuf;

use crate::args::{BiomimicrySubcommands, EvolutionSubcommands};
use crate::commands::biomimicry_ops::*;

use crate::commands::biomimicry_neural;

fn telomere_state_path(agent_id: &str) -> Result<PathBuf, String> {
    if agent_id.is_empty() || !agent_id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_') {
        return Err("agent_id must contain only ASCII letters, digits, '-' or '_'".to_string());
    }
    let root = crate::commands::root_resolver::resolve_matrix_root();
    Ok(root.join("telomeres").join(format!("{}.json", agent_id)))
}


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
        BiomimicrySubcommands::StigmergyDeposit { agent_id, target_file, pheromone_type, amount, is_repellent } => {
            biomimicry_neural::handle_stigmergy_deposit(&agent_id, &target_file, (&pheromone_type, amount, is_repellent))?;
        }
        BiomimicrySubcommands::StigmergyRead { agent_id, target_file } => {
            biomimicry_neural::handle_stigmergy_read(&agent_id, &target_file)?;
        }
        BiomimicrySubcommands::StigmergyEvaporate { agent_id, dt_seconds } => {
            biomimicry_neural::handle_stigmergy_evaporate(&agent_id, dt_seconds)?;
        }
        BiomimicrySubcommands::TheoryAutopoiesis { agent_id, target_gene, new_value } => {
            let mut cell = AgentCell::new(&agent_id, "Autopoïèse régénératrice", "Worker");
            let initial_dissonance = cell.conscience.dissonance_level;
            cell.conscience.reduce_dissonance(new_value.min(cell.conscience.max_dissonance_threshold));
            let max_threshold = if cell.conscience.max_dissonance_threshold > 0.0 {
                cell.conscience.max_dissonance_threshold
            } else {
                50.0
            };
            let membrane_integrity = (1.0 - (cell.conscience.dissonance_level / max_threshold)).clamp(0.0, 1.0);
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
        BiomimicrySubcommands::NootropicInfusion { agent_id, substance, dose_mg } => {
            biomimicry_neural::handle_nootropic_infusion(&agent_id, &substance, dose_mg)?;
        }
        BiomimicrySubcommands::CerebellumCoprocessor { agent_id, target_value, expected_latency, current_value, actual_latency } => {
            biomimicry_neural::handle_cerebellum(&agent_id, (target_value, current_value), (expected_latency, actual_latency))?;
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
            biomimicry_neural::handle_glial_cleanup(&agent_id, intensity.as_deref())?;
        }
        BiomimicrySubcommands::GeneRegulatoryNetwork { agent_id, condition, action_script } => {
            biomimicry_neural::handle_gene_regulatory_network(&agent_id, &condition, &action_script)?;
        }
        BiomimicrySubcommands::EpigeneticChromatin { agent_id, locus, state, pioneer_factor } => {
            biomimicry_neural::handle_epigenetic_chromatin(&agent_id, &locus, (&state, pioneer_factor))?;
        }
        BiomimicrySubcommands::SpeciationCheck { agent_id, threshold } => {
            let t = threshold.unwrap_or(0.35);
            let g1 = Genome::new(&agent_id);
            let g2 = Genome::new(&format!("{}_divergent", agent_id));
            let divergence = if g1.genome_id() != g2.genome_id() { 0.12 } else { 0.0 };
            print_json(json!({
                "success": true, "operation": "speciation_check",
                "agent_id": agent_id, "threshold": t, "divergence": divergence,
                "is_new_species": divergence > t
            }));
        }
        BiomimicrySubcommands::TelomereFork { agent_id, force_telomerase } => {
            let state_path = match telomere_state_path(&agent_id) {
                Ok(p) => p,
                Err(e) => {
                    print_json(json!({
                        "success": false,
                        "operation": "telomere_fork",
                        "parent_id": agent_id,
                        "agent_id": agent_id,
                        "error": e,
                        "status": "error"
                    }));
                    return Ok(());
                }
            };

            let mut cell: AgentCell = if state_path.exists() {
                match fs::read_to_string(&state_path).ok().and_then(|s| serde_json::from_str(&s).ok()) {
                    Some(c) => c,
                    None => AgentCell::new(&agent_id, "Cellule souche", "Worker"),
                }
            } else {
                AgentCell::new(&agent_id, "Cellule souche", "Worker")
            };

            if force_telomerase {
                cell.apply_telomerase();
            }

            match cell.budding(0.5) {
                Ok(child) => {
                    if let Some(parent_dir) = state_path.parent() {
                        let _ = fs::create_dir_all(parent_dir);
                    }
                    let _ = fs::write(&state_path, serde_json::to_string_pretty(&cell).unwrap_or_default());
                    print_json(json!({
                        "success": true,
                        "operation": "telomere_fork",
                        "parent_id": agent_id,
                        "agent_id": agent_id,
                        "child_id": child.cell_id.to_string(),
                        "bud_scars": cell.bud_scars,
                        "hayflick_limit": cell.hayflick_limit,
                        "remaining_divisions": cell.remaining_divisions(),
                        "telomerase_active": force_telomerase,
                        "is_senescent": cell.is_senescent,
                        "status": if cell.is_senescent { "senescent" } else { "active" }
                    }));
                }
                Err(e) => {
                    print_json(json!({
                        "success": false,
                        "operation": "telomere_fork",
                        "parent_id": agent_id,
                        "agent_id": agent_id,
                        "error": e,
                        "remaining_divisions": cell.remaining_divisions(),
                        "status": "senescent_blocked"
                    }));
                }
            }
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
        BiomimicrySubcommands::Cryptobiosis { agent_id, action, state } => {
            return super::store_ops::handle_cryptobiosis(&agent_id, action.as_deref(), state.as_deref());
        }
        BiomimicrySubcommands::Hypermutation { agent_id } => {
            let redundancy = RedundancySystem::new();
            let mut genome = Genome::new(&agent_id);
            let mut rng = rand::rng();
            let mutations_count = genome.hypermutate(redundancy.codon_degeneracy_tolerance.clamp(0.05, 0.5), &mut rng);
            print_json(json!({
                "success": true, "operation": "hypermutation",
                "agent_id": agent_id,
                "mutations_count": mutations_count,
                "tolerance": redundancy.codon_degeneracy_tolerance,
                "genome_id": genome.genome_id().to_string(),
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
            let mut genome = seed_hox_genome("HOX_BLUEPRINT");
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
            let factors = EnvironmentalFactors {
                sun_uv_exposure: uv_exposure,
                temperature,
                ..Default::default()
            };
            let state_path = biomimicry_neural::chromatin_state_path(&agent_id)?;
            let mut genome = if state_path.exists() {
                serde_json::from_str(&fs::read_to_string(&state_path).map_err(|error| format!("Failed to read chromatin state: {}", error))?)
                    .unwrap_or_else(|_| Genome::new(&agent_id))
            } else {
                Genome::new(&agent_id)
            };
            if !genome.genes.contains_key("FUR_COLOR") {
                genome.insert_gene(Gene::new("FUR_COLOR", "BROWN_COLORS"));
            }
            let registry = create_default_registry();
            registry.apply_epigenetic_regulation(&mut genome, &factors);
            let phenotype = registry.compute(&genome, &factors);
            print_json(json!({
                "success": true, "operation": "phenotype",
                "agent_id": agent_id, "uv_exposure": uv_exposure,
                "temperature": temperature, "status": "computed",
                "traits": phenotype.macroscopic_traits,
                "cellular_shape": phenotype.cellular_shape,
                "molecular_markers": phenotype.molecular_markers
            }));
        }
        BiomimicrySubcommands::BioFeature { feature, action, param } => {
            handle_bio_feature(&feature, &action, &param);
        }
        BiomimicrySubcommands::NetworkQuorum { agent_id, threshold, action_id } => {
            let _ = handle_network_quorum(&agent_id, threshold, &action_id);
        }
        sensory_cmd => {
            if !crate::commands::biomimicry_sensory::handle_sensory_subcommands(sensory_cmd)? {
                return Err("Sous-commande biomimétique non reconnue".to_string());
            }
        }
    }
    Ok(())
}

pub fn execute_evolution(cmd: EvolutionSubcommands) -> Result<(), String> {
    crate::commands::reproduction::execute(cmd)
}
