use anyhow::{bail, Result};
use genos_core::biomimicry::{
    AllostasisEngine, CircadianPhase, CrossModalPlasticity, DopaminergicSystem,
    EndocrineSystem, HippocampalReplay, Hormone, MotorResponse, ReflexArc, RpeSignal,
    SensoryStimulus, SuprachiasmaticNucleus, ZeitgeberSignal, EpisodicSequence,
};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params
        .iter()
        .find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn endocrine_modulate(params: &[String]) -> Result<()> {
    let swarm_id = param_value(params, "swarm_id")
        .unwrap_or("global_swarm")
        .to_string();
    let action = param_value(params, "endocrine_action")
        .ok_or_else(|| anyhow::anyhow!("missing --param endocrine_action=<secrete|decay>"))?;

    let mut system = EndocrineSystem::new(swarm_id.clone());

    if action == "secrete" {
        let hormone_str = param_value(params, "hormone")
            .ok_or_else(|| anyhow::anyhow!("missing --param hormone=<name>"))?;
        let amount: f64 = param_value(params, "amount").unwrap_or("0.5").parse()?;

        let hormone = Hormone::parse(hormone_str);
        system.secrete(hormone.clone(), amount);
        println!(
            "Secreted {} of {:?}. Swarm {} modulated.",
            amount, hormone, swarm_id
        );
    } else if action == "decay" {
        let factor: f64 = param_value(params, "decay_factor")
            .unwrap_or("0.1")
            .parse()?;
        system.decay(factor);
        println!(
            "Applied decay factor {} to endocrine system of swarm {}.",
            factor, swarm_id
        );
    } else {
        bail!("Unknown endocrine action: {}", action);
    }

    Ok(())
}

pub fn reflex_trigger(params: &[String]) -> Result<()> {
    let stimulus_type = param_value(params, "stimulus")
        .ok_or_else(|| anyhow::anyhow!("missing --param stimulus=<thermal|nociceptive>"))?;

    let nociceptive_threshold: usize = param_value(params, "pain_threshold")
        .unwrap_or("50")
        .parse()?;
    let thermal_threshold: u32 = param_value(params, "heat_threshold")
        .unwrap_or("100")
        .parse()?;

    let arc = ReflexArc::new(nociceptive_threshold, thermal_threshold);

    let stimulus = match stimulus_type {
        "thermal" => {
            let heat: u32 = param_value(params, "value").unwrap_or("0").parse()?;
            SensoryStimulus::Thermal(heat)
        }
        "nociceptive" => {
            let pain = param_value(params, "value").unwrap_or("").to_string();
            SensoryStimulus::Nociceptive(pain)
        }
        _ => bail!("Unknown stimulus type"),
    };

    match arc.evaluate_fast_path(stimulus) {
        MotorResponse::Withdraw => {
            println!("REFLEX TRIGGERED: Withdraw. Fast-path executed. Planner bypassed.");
        }
        MotorResponse::Freeze => {
            println!("REFLEX TRIGGERED: Freeze. Fast-path executed. Planner bypassed.");
        }
        MotorResponse::Ignore => {
            println!("Stimulus below threshold. Routing to Planner (Brain) for slow evaluation.");
        }
    }

    Ok(())
}

pub fn neuromodulation_rpe(params: &[String]) -> Result<()> {
    let node_id = param_value(params, "node_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param node_id=<id>"))?;

    let expected: f64 = param_value(params, "expected_reward")
        .ok_or_else(|| anyhow::anyhow!("missing --param expected_reward=<val>"))?
        .parse()?;

    let actual: f64 = param_value(params, "actual_reward")
        .ok_or_else(|| anyhow::anyhow!("missing --param actual_reward=<val>"))?
        .parse()?;

    let dopaminergic = DopaminergicSystem::new(0.3, 0.5); // baseline 0.3, LR 0.5
    let signal = RpeSignal {
        expected_reward: expected,
        actual_reward: actual,
    };

    let dopamine = dopaminergic.compute_rpe(signal);

    println!(
        "Node {} RPE Evaluation. Expected: {}, Actual: {}",
        node_id, expected, actual
    );
    println!("Dopamine level: {:.2}", dopamine);

    if dopaminergic.is_priority_pathway(dopamine) {
        println!("DOPAMINE SPIKE! Pathway reinforced for priority exploration.");
    } else if dopamine < dopaminergic.baseline_dopamine {
        println!("DOPAMINE DIP. Pathway marked for depression.");
    }

    Ok(())
}

pub fn hippocampal_consolidate(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .unwrap_or("agent_alpha")
        .to_string();
    let score: f64 = param_value(params, "success_score")
        .unwrap_or("0.9")
        .parse()?;

    let mut episode = EpisodicSequence::new();
    let mut current_time = 0;
    let mut has_step = false;

    for p in params {
        if let Some(step) = p.strip_prefix("dag_step=") {
            episode.bind_event(step, current_time);
            current_time += 100;
            has_step = true;
        }
    }
    if !has_step {
        episode.bind_event("default_step", 0);
    }

    let replay = HippocampalReplay::new(agent_id);
    match replay.consolidate_memory(&episode, score) {
        Ok(res) => println!("{}", res),
        Err(e) => bail!("Replay failed: {}", e),
    }
    Ok(())
}

pub fn circadian_toggle(params: &[String]) -> Result<()> {
    let swarm_id = param_value(params, "swarm_id")
        .unwrap_or("global_swarm")
        .to_string();
    let current = match param_value(params, "current_phase").unwrap_or("diurnal") {
        "diurnal" => CircadianPhase::Diurnal,
        "nocturnal" => CircadianPhase::Nocturnal,
        _ => bail!("Unknown phase"),
    };

    let mut clock = SuprachiasmaticNucleus::new(swarm_id.clone(), current.clone());
    let new_phase = match current {
        CircadianPhase::Diurnal => {
            clock.reset_clock(ZeitgeberSignal::Darkness);
            CircadianPhase::Nocturnal
        },
        CircadianPhase::Nocturnal => {
            clock.reset_clock(ZeitgeberSignal::Light);
            CircadianPhase::Diurnal
        },
    };
    println!("Swarm {} phase toggled to {:?}", swarm_id, new_phase);
    if clock.can_execute_heavy_maintenance() {
        println!("Nocturnal phase: Heavy maintenance (GC, Replay) permitted.");
    } else {
        println!("Diurnal phase: Active serving prioritized.");
    }
    Ok(())
}

pub fn allostasis_anticipate(params: &[String]) -> Result<()> {
    let swarm_id = param_value(params, "swarm_id")
        .unwrap_or("global_swarm")
        .to_string();
    let cue: f64 = param_value(params, "stress_cue").unwrap_or("0.5").parse()?;
    let base: u64 = param_value(params, "base_budget")
        .unwrap_or("1000")
        .parse()?;

    let engine = AllostasisEngine::new(swarm_id.clone(), base);
    let pre_allocated = engine.anticipate_load(cue);
    println!(
        "Allostasis Swarm {}: Cue={}, Base={}, Pre-allocated Budget={}",
        swarm_id, cue, base, pre_allocated
    );
    Ok(())
}

pub fn cross_modal_remap(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .unwrap_or("agent_alpha")
        .to_string();
    let failing = param_value(params, "failing_tool")
        .ok_or_else(|| anyhow::anyhow!("missing --param failing_tool=<tool>"))?;

    let plasticity = CrossModalPlasticity::new(agent_id);
    match plasticity.remap_modality(failing) {
        Ok(sub) => println!(
            "Plasticity success: {} remapped to substitute -> {}",
            failing, sub
        ),
        Err(e) => println!("Plasticity failed: {}", e),
    }
    Ok(())
}

pub fn multisensory_integration(params: &[String]) -> Result<()> {
    let sensory_input = param_value(params, "input").unwrap_or("visual,auditory");
    println!("Performing multisensory integration on inputs: {}", sensory_input);
    Ok(())
}

pub fn thalamic_filtering(params: &[String]) -> Result<()> {
    let input = param_value(params, "input").unwrap_or("default_input");
    let threshold: f64 = param_value(params, "threshold").unwrap_or("0.5").parse()?;
    println!("Applying thalamic filtering to {} with threshold {}", input, threshold);
    Ok(())
}

