use serde_json::json;

use crate::commands::biomimicry_features::extract_param;
use genos_biology::instinct::{
    ExecutionContext, FixedActionPattern, HormoneState, InnateReleasingMechanism, InstinctLibrary,
    InstinctProgram, InstinctRunContext, Modality, MotorStep, SignStimulus, StimulusField,
};

/// Point d'entrée CLI de la feature biomimétique `instinct`.
pub fn handle_instinct(action: &str, params: &[String]) {
    match action {
        "list" | "library" => handle_list(),
        _ => handle_trigger(action, params),
    }
}

fn default_forage_paf() -> FixedActionPattern {
    FixedActionPattern::new(
        "forage_return",
        vec![
            MotorStep::new("deposit_harvest_marker", "genos_biomimicry").auto(),
            MotorStep::new("reorient_goal_vector", "genos_biomimicry").auto(),
            MotorStep::new("return_to_hive", "genos_snapshot"),
        ],
    )
}

fn default_forage_program() -> InstinctProgram {
    InstinctProgram::new(
        "LOCUS_INSTINCT_FORAGE_RETURN",
        InnateReleasingMechanism::new(Modality::Pheromone, "resource_exhausted", 0.5),
        default_forage_paf(),
    )
}

fn read_f64(params: &[String], key: &str, default: f64) -> f64 {
    extract_param(params, key)
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(default)
}

fn read_bool(params: &[String], key: &str, default: bool) -> bool {
    extract_param(params, key)
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(default)
}

fn read_hormones(params: &[String]) -> HormoneState {
    HormoneState {
        oxytocin: read_f64(params, "oxytocin", 0.0),
        prolactin: read_f64(params, "prolactin", 0.0),
        testosterone: read_f64(params, "testosterone", 0.0),
        cortisol: read_f64(params, "cortisol", 0.0),
        dopamine: read_f64(params, "dopamine", 0.0),
    }
}

fn read_execution(params: &[String]) -> ExecutionContext {
    let tools = extract_param(params, "authorized_tools")
        .or_else(|| extract_param(params, "tools"))
        .unwrap_or_else(|| "genos_biomimicry,genos_snapshot".to_string());
    let authorized_tools = tools
        .split(',')
        .map(|tool| tool.trim().to_string())
        .filter(|tool| !tool.is_empty())
        .collect();
    ExecutionContext {
        authorized_tools,
        atp_budget: read_f64(params, "atp", 100.0),
        apoptotic: read_bool(params, "apoptotic", false),
        chain_depth: 0,
    }
}

fn handle_trigger(action: &str, params: &[String]) {
    let locus = extract_param(params, "instinct_id")
        .or_else(|| extract_param(params, "locus"))
        .unwrap_or_else(|| "LOCUS_INSTINCT_FORAGE_RETURN".to_string());
    let modality = Modality::parse(
        &extract_param(params, "modality").unwrap_or_else(|| "pheromone".to_string()),
    );
    let signature =
        extract_param(params, "signature").unwrap_or_else(|| "resource_exhausted".to_string());
    let intensity = read_f64(params, "intensity", 0.9);
    let threshold = read_f64(params, "threshold", 0.5);
    let gain = read_f64(params, "sensitivity_gain", 1.0);

    let mechanism = InnateReleasingMechanism::new(modality, &signature, threshold).with_gain(gain);
    let program = InstinctProgram::new(&locus, mechanism, default_forage_paf());
    let field = StimulusField::new().push(SignStimulus::new(modality, &signature, intensity));
    let hormones = read_hormones(params);
    let execution = read_execution(params);
    let ctx = InstinctRunContext {
        field: &field,
        hormones: &hormones,
        execution: &execution,
    };
    let outcome = program.run(&ctx);

    println!("{}", json!({
        "success": true, "feature": "instinct", "action": action,
        "instinct_id": locus, "modality": modality.as_str(), "signature": signature,
        "developmentally_locked": program.is_locked(),
        "hormones": hormones, "outcome": outcome,
        "execution_mode": "validation_only", "external_actions_dispatched": false
    }));
}

fn handle_list() {
    let library = InstinctLibrary::new().register(default_forage_program());
    let count = library.len();
    println!("{}", json!({
        "success": true, "feature": "instinct", "action": "list",
        "count": count, "instincts": library
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_program_is_locked_and_encodable() {
        let program = default_forage_program();
        assert!(program.is_locked());
        assert!(genos_biology::instinct::is_instinct_locus(&program.to_gene().locus));
    }

    #[test]
    fn read_f64_falls_back_to_default() {
        let params = vec!["intensity=0.75".to_string()];
        assert_eq!(read_f64(&params, "intensity", 0.1), 0.75);
        assert_eq!(read_f64(&params, "missing", 0.1), 0.1);
    }
}
