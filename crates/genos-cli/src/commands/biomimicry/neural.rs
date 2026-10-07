use serde_json::json;

use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::embryology::{cleave_zygote, differentiate_swarm, sculpt_architecture_via_apoptosis, seed_hox_genome};
use genos_biology::phenotype::{create_default_registry, EnvironmentalFactors};
use genos_cell::AgentCell;
use genos_genome::{Gene, Genome};
use std::fs;

use crate::commands::biomimicry_ops::*;
use crate::commands::biomimicry_neural;

pub struct BioluminescenceArgs<'a> {
    pub(super) agent_id: &'a str,
    pub(super) color: &'a str,
    pub(super) organelle: &'a str,
    pub(super) event_type: &'a str,
    pub(super) details: &'a str,
}

pub fn execute_bioluminescence(args: BioluminescenceArgs) -> Result<(), String> {
    let cell_id = parse_uuid(args.agent_id);
    let fluorophore = match args.color.to_lowercase().as_str() {
        "blue" => FluorophoreColor::Blue,
        "yellow" => FluorophoreColor::Yellow,
        "red" => FluorophoreColor::Red,
        _ => FluorophoreColor::Green,
    };
    BioluminescenceMicroscope::emit_fluorescence(cell_id, fluorophore.clone(), (&args.organelle, &args.event_type, &args.details));
    print_json(json!({
        "success": true, "operation": "bioluminescence",
        "agent_id": args.agent_id, "color": format!("{:?}", fluorophore),
        "organelle": args.organelle, "event_type": args.event_type, "details": args.details
    }));
    Ok(())
}

pub fn execute_phenotype(agent_id: &str, uv_exposure: f64, temperature: f64) -> Result<(), String> {
    let factors = EnvironmentalFactors {
        sun_uv_exposure: uv_exposure,
        temperature,
        ..Default::default()
    };
    let state_path = biomimicry_neural::chromatin_state_path(agent_id)?;
    let mut genome = if state_path.exists() {
        serde_json::from_str(&fs::read_to_string(&state_path).map_err(|error| format!("Failed to read chromatin state: {}", error))?)
            .unwrap_or_else(|_| Genome::new(agent_id))
    } else {
        Genome::new(agent_id)
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
    Ok(())
}
