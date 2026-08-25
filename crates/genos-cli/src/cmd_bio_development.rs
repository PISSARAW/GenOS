use anyhow::{bail, Result};
use genos_core::biomimicry::{Embryogenesis, EmbryoPhase, HoxBlueprint, BodySegment, WaddingtonLandscape, Trajectory, MetamorphosisEngine, LifeStage, RegenerativeBlastema, TissueStatus};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params.iter().find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn embryogenesis_advance(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param agent_id=<id>"))?
        .to_string();
    let current = param_value(params, "current_phase")
        .ok_or_else(|| anyhow::anyhow!("missing --param current_phase=<phase>"))?;
    let phase = EmbryoPhase::parse(current)
        .ok_or_else(|| anyhow::anyhow!("invalid phase: {}", current))?;
        
    let preconditions = param_value(params, "preconditions_met")
        .unwrap_or("false") == "true";

    let mut embryo = Embryogenesis { agent_id: agent_id.clone(), current_phase: phase };
    match embryo.advance(preconditions) {
        Ok(next_phase) => {
            println!("Agent {} advanced to phase {:?}", agent_id, next_phase);
            Ok(())
        },
        Err(e) => bail!("Failed to advance: {}", e),
    }
}

pub fn hox_verify(params: &[String]) -> Result<()> {
    let mut blueprint = HoxBlueprint::new();
    // Default blueprint construction for the sake of the CLI
    blueprint.add_gene("identity".to_string(), BodySegment::Anterior, 1);
    blueprint.add_gene("reasoning".to_string(), BodySegment::Thorax, 1);
    blueprint.add_gene("mcp_tools".to_string(), BodySegment::Posterior, 1);
    
    let activated: Vec<String> = params
        .iter()
        .filter_map(|p| p.strip_prefix("activated=").map(|s| s.to_string()))
        .collect();

    if activated.is_empty() {
        bail!("Missing --param activated=<capability>");
    }

    match blueprint.verify_colinearity(&activated) {
        Ok(_) => {
            println!("Hox colinearity verified. Capabilities activated in correct biological order.");
            Ok(())
        },
        Err(e) => bail!("Hox colinearity violation: {}", e),
    }
}

pub fn canalization_evaluate(params: &[String]) -> Result<()> {
    let expected = param_value(params, "expected_phenotype")
        .ok_or_else(|| anyhow::anyhow!("missing --param expected_phenotype=<hash>"))?
        .to_string();
    let width: f64 = param_value(params, "valley_width")
        .unwrap_or("0.8")
        .parse()?;
        
    let landscape = WaddingtonLandscape::new(expected, width);
    
    // Parse simulated trajectories from params
    let trajectories: Vec<Trajectory> = params
        .iter()
        .filter_map(|p| p.strip_prefix("trajectory=").map(|s| Trajectory { final_state_hash: s.to_string() }))
        .collect();

    if trajectories.is_empty() {
        bail!("Missing --param trajectory=<final_state_hash>");
    }

    match landscape.evaluate_canalization(&trajectories) {
        Ok(ratio) => {
            println!("Trajectory is canalized! Robustness ratio: {:.2}", ratio);
            Ok(())
        },
        Err(e) => bail!("Canalization failed: {}", e),
    }
}

pub fn metamorphosis_transition(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param agent_id=<id>"))?
        .to_string();
        
    let current_stage_str = param_value(params, "current_stage")
        .unwrap_or("larval");
        
    let initial_stage = match current_stage_str {
        "larval" => LifeStage::Larval,
        "pupal" => LifeStage::Pupal,
        "imago" => LifeStage::Imago,
        _ => bail!("Invalid life stage"),
    };
    
    let mut engine = MetamorphosisEngine::new(agent_id.clone(), initial_stage);

    match engine.trigger_transition() {
        Ok(new_stage) => {
            println!("Agent {} successfully transitioned to stage {:?}", agent_id, new_stage);
            
            // If going to Pupal, compute tissues changes
            if new_stage == LifeStage::Pupal {
                let current_tools: Vec<String> = params
                    .iter()
                    .filter_map(|p| p.strip_prefix("current_tool=").map(|s| s.to_string()))
                    .collect();
                let target_tools: Vec<String> = params
                    .iter()
                    .filter_map(|p| p.strip_prefix("target_tool=").map(|s| s.to_string()))
                    .collect();
                    
                let (shed, acquire) = engine.compute_tissue_changes(&current_tools, &target_tools);
                println!("Shedding obsolete tools: {:?}", shed);
                println!("Acquiring new tools: {:?}", acquire);
            }
            Ok(())
        },
        Err(e) => bail!("Metamorphosis failed: {}", e),
    }
}

pub fn regeneration_tissue(params: &[String]) -> Result<()> {
    let module_id = param_value(params, "module_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param module_id=<id>"))?
        .to_string();
    let base_hash = param_value(params, "base_checkpoint_hash")
        .unwrap_or("genesis_hash")
        .to_string();
        
    let action = param_value(params, "regenerate_action")
        .ok_or_else(|| anyhow::anyhow!("missing --param regenerate_action=<amputate|complete>"))?;

    let mut blastema = RegenerativeBlastema::new(module_id.clone(), base_hash);
    
    // Simulate corruption if we are calling amputate
    if action == "amputate" {
        blastema.status = TissueStatus::Corrupted;
        match blastema.amputate_and_form_blastema() {
            Ok(_) => {
                println!("Module {} amputated. Blastema formed, ready for regeneration.", module_id);
                Ok(())
            },
            Err(e) => bail!("Amputation failed: {}", e),
        }
    } else if action == "complete" {
        // Need to set to regenerating first to complete
        blastema.status = TissueStatus::Regenerating;
        let new_hash = format!("{}_restored", blastema.base_checkpoint_hash);
        match blastema.complete_regeneration(new_hash.clone()) {
            Ok(_) => {
                println!("Regeneration complete for {}. New hash: {}", module_id, new_hash);
                Ok(())
            },
            Err(e) => bail!("Completion failed: {}", e),
        }
    } else {
        bail!("Unknown regenerate action");
    }
}
