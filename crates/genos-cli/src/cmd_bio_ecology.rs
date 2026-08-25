use anyhow::{bail, Result};
use genos_core::biomimicry::{PunctuatedEquilibria, EvolutionPhase, EcologicalSuccession, SuccessionStage};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params.iter().find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn ecology_punctuated(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id").unwrap_or("agent_alpha").to_string();
    let threshold: usize = param_value(params, "plateau_threshold").unwrap_or("5").parse()?;
    
    let improved_str = param_value(params, "improved").unwrap_or("false");
    let improved = improved_str == "true";

    // Simulate current state passed by params (CLI is stateless)
    let current_phase = match param_value(params, "current_phase").unwrap_or("stasis") {
        "stasis" => EvolutionPhase::Stasis,
        "punctuation" => EvolutionPhase::Punctuation,
        _ => bail!("unknown phase"),
    };
    
    let mut stasis_counter: usize = param_value(params, "stasis_counter").unwrap_or("0").parse()?;
    
    let mut pe = PunctuatedEquilibria::new(agent_id.clone(), threshold);
    pe.current_phase = current_phase;
    pe.stasis_counter = stasis_counter;
    
    let new_phase = pe.evaluate_progress(improved);
    
    println!("Punctuated Equilibria Evaluation for {}", agent_id);
    if new_phase == EvolutionPhase::Punctuation {
        println!("PLATEAU DETECTED! Triggering evolutionary burst (high temperature / high mutation).");
    } else {
        println!("Stasis Phase. Incremental refinement. Counter: {}/{}", pe.stasis_counter, pe.plateau_threshold);
    }
    
    Ok(())
}

pub fn ecology_succession(params: &[String]) -> Result<()> {
    let project_id = param_value(params, "project_id").unwrap_or("project_x").to_string();
    let coverage: f64 = param_value(params, "coverage").unwrap_or("0.0").parse()?;
    let stability: f64 = param_value(params, "stability").unwrap_or("0.0").parse()?;
    
    let current_stage_str = param_value(params, "current_stage").unwrap_or("barren");
    let current_stage = match current_stage_str {
        "barren" => SuccessionStage::Barren,
        "pioneer" => SuccessionStage::Pioneer,
        "intermediate" => SuccessionStage::Intermediate,
        "climax" => SuccessionStage::Climax,
        _ => bail!("unknown succession stage"),
    };
    
    let mut succession = EcologicalSuccession::new(project_id.clone());
    succession.current_stage = current_stage;
    
    let new_stage = succession.advance_succession(coverage, stability);
    
    println!("Ecological Succession for {}", project_id);
    println!("Coverage: {:.2}, Stability: {:.2}", coverage, stability);
    
    match new_stage {
        SuccessionStage::Barren => println!("Environment is Barren. Prepare for Pioneers."),
        SuccessionStage::Pioneer => println!("Pioneer Stage. Spawn fast, robust indexing agents."),
        SuccessionStage::Intermediate => println!("Intermediate Stage. Spawn builders and structural agents."),
        SuccessionStage::Climax => println!("Climax Stage. Spawn expensive, specialized polishers."),
    }
    
    Ok(())
}
