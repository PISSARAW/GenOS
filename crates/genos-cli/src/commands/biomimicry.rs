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
mod therapy;

mod cellular;
mod genetic;
mod neural;

use cellular::{execute_cellular_endosymbiosis, execute_cellular_bbb, execute_theory_autopoiesis, execute_hypothalamus_homeostasis, execute_enteric_delegate};
use genetic::{execute_speciation_check, execute_telomere_fork, execute_apoptosis, execute_hypermutation, execute_anti_collusion, execute_redundancy, execute_embryology};
use neural::{execute_bioluminescence, execute_phenotype};

pub fn execute(cmd: BiomimicrySubcommands) -> Result<(), String> {
    match cmd {
        BiomimicrySubcommands::CellularEndosymbiosis { agent_id, target_process, organelle_name } => {
            execute_cellular_endosymbiosis(&agent_id, &target_process, &organelle_name)
        }
        BiomimicrySubcommands::CellularBbb { agent_id, filter_level } => {
            execute_cellular_bbb(&agent_id, &filter_level)
        }
        BiomimicrySubcommands::StigmergyDeposit { agent_id, target_file, pheromone_type, amount, is_repellent } => {
            biomimicry_neural::handle_stigmergy_deposit(&agent_id, &target_file, (&pheromone_type, amount, is_repellent))
        }
        BiomimicrySubcommands::StigmergyRead { agent_id, target_file } => {
            biomimicry_neural::handle_stigmergy_read(&agent_id, &target_file)
        }
        BiomimicrySubcommands::StigmergyEvaporate { agent_id, dt_seconds } => {
            biomimicry_neural::handle_stigmergy_evaporate(&agent_id, dt_seconds)
        }
        BiomimicrySubcommands::TheoryAutopoiesis { agent_id, target_gene, new_value } => {
            execute_theory_autopoiesis(&agent_id, &target_gene, new_value)
        }
        BiomimicrySubcommands::HypothalamusHomeostasis { agent_id, nervous_state } => {
            execute_hypothalamus_homeostasis(&agent_id, &nervous_state)
        }
        BiomimicrySubcommands::CerebellumCoprocessor { agent_id, target_value, expected_latency, current_value, actual_latency } => {
            biomimicry_neural::handle_cerebellum(&agent_id, (target_value, current_value), (expected_latency, actual_latency))
        }
        BiomimicrySubcommands::EntericDelegate { agent_id, data_source, digestion_mode } => {
            execute_enteric_delegate(&agent_id, &data_source, digestion_mode.as_deref())
        }
        BiomimicrySubcommands::GlialCleanup { agent_id, intensity } => {
            biomimicry_neural::handle_glial_cleanup(&agent_id, intensity.as_deref())
        }
        BiomimicrySubcommands::GeneRegulatoryNetwork { agent_id, condition, action_script } => {
            biomimicry_neural::handle_gene_regulatory_network(&agent_id, &condition, &action_script)
        }
        BiomimicrySubcommands::EpigeneticChromatin { agent_id, locus, state, pioneer_factor } => {
            biomimicry_neural::handle_epigenetic_chromatin(&agent_id, &locus, (&state, pioneer_factor))
        }
        BiomimicrySubcommands::SpeciationCheck { agent_id, threshold } => {
            execute_speciation_check(&agent_id, threshold.unwrap_or(0.35))
        }
        BiomimicrySubcommands::TelomereFork { agent_id, force_telomerase } => {
            execute_telomere_fork(&agent_id, force_telomerase)
        }
        BiomimicrySubcommands::Apoptosis { agent_id } => {
            execute_apoptosis(&agent_id)
        }
        BiomimicrySubcommands::Cryptobiosis { agent_id, action, state } => {
            super::store_ops::handle_cryptobiosis(&agent_id, action.as_deref(), state.as_deref())
        }
        BiomimicrySubcommands::Hypermutation { agent_id } => {
            execute_hypermutation(&agent_id)
        }
        BiomimicrySubcommands::Spore { action, agent_id, spore_type, warm_and_wet, nutrients } => {
            handle_spore(SporeCommand {
                action: &action,
                agent_id: &agent_id,
                spore_type: spore_type.as_deref(),
                conditions: (warm_and_wet.unwrap_or(true), nutrients.unwrap_or(true)),
            });
            Ok(())
        }
        BiomimicrySubcommands::Bioluminescence { agent_id, color, organelle, event_type, details } => {
            execute_bioluminescence(neural::BioluminescenceArgs {
                agent_id: &agent_id,
                color: &color,
                organelle: &organelle,
                event_type: &event_type,
                details: &details,
            })
        }
        BiomimicrySubcommands::AntiCollusion { agent_id, consumed_tokens, physical_test_passed } => {
            execute_anti_collusion(&agent_id, consumed_tokens, physical_test_passed)
        }
        BiomimicrySubcommands::Redundancy { expected_tool, mutated_tool, fallback } => {
            execute_redundancy(&expected_tool, &mutated_tool, fallback)
        }
        BiomimicrySubcommands::Tissue { action, name, role, stem_id, worker_id, task } => {
            handle_tissue(TissueCommand {
                action: &action,
                name: &name,
                role: role.as_deref(),
                params: (stem_id.as_deref(), worker_id.as_deref(), task.as_deref()),
            });
            Ok(())
        }
        BiomimicrySubcommands::Embryology { action: _, divisions, gradient } => {
            execute_embryology(divisions, gradient)
        }
        BiomimicrySubcommands::Therapy { agent_id, therapy_type, journal, authorization_file } => {
            print_json(therapy::execute((&agent_id, &therapy_type), (journal, authorization_file))?);
            Ok(())
        }
        BiomimicrySubcommands::Phenotype { agent_id, uv_exposure, temperature } => {
            execute_phenotype(&agent_id, uv_exposure, temperature)
        }
        BiomimicrySubcommands::BioFeature { feature, action, param } => {
            handle_bio_feature(&feature, &action, &param);
            Ok(())
        }
        BiomimicrySubcommands::NetworkQuorum { agent_id, threshold, action_id } => {
            handle_network_quorum(&agent_id, threshold, &action_id)
        }
        sensory_cmd => {
            if !crate::commands::biomimicry_sensory::handle_sensory_subcommands(sensory_cmd)? {
                return Err("Sous-commande biomimétique non reconnue".to_string());
            }
            Ok(())
        }
    }
}

pub fn execute_evolution(cmd: EvolutionSubcommands) -> Result<(), String> {
    crate::commands::reproduction::execute(cmd)
}
