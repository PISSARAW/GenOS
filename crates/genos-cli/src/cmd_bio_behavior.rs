use anyhow::{bail, Result};
use genos_core::biomimicry::{
    LearningStatus, MimicrySpoofer, PlayBehavior, SocialLearning, ThanatosisState,
};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params
        .iter()
        .find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn behavior_social(params: &[String]) -> Result<()> {
    let junior_id = param_value(params, "junior_id")
        .unwrap_or("junior_alpha")
        .to_string();
    let senior_id = param_value(params, "senior_id")
        .unwrap_or("senior_beta")
        .to_string();
    let alignment: f64 = param_value(params, "alignment_score")
        .unwrap_or("0.8")
        .parse()?;

    let mut sl = SocialLearning::new(junior_id.clone(), senior_id.clone());

    println!("Social Learning: {} observing {}.", junior_id, senior_id);
    match sl.attempt_mimicry(alignment) {
        Ok(LearningStatus::Mastered) => {
            println!("SUCCESS: Macro mastered via pedagogy. MCTS tokens saved!")
        }
        Err(e) => println!("WARN: {}", e),
        _ => {}
    }

    Ok(())
}

pub fn behavior_play(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .unwrap_or("agent_alpha")
        .to_string();
    let budget: u64 = param_value(params, "play_budget")
        .unwrap_or("5000")
        .parse()?;
    let action = param_value(params, "action").ok_or_else(|| anyhow::anyhow!("missing action"))?;

    let mut pb = PlayBehavior::new(agent_id.clone(), budget);

    if action == "initiate" {
        match pb.initiate_play() {
            Ok(msg) => println!("{}", msg),
            Err(e) => bail!("{}", e),
        }
    } else if action == "conclude" {
        let spent: u64 = param_value(params, "tokens_spent")
            .unwrap_or("1000")
            .parse()?;
        let discoveries: usize = param_value(params, "discoveries").unwrap_or("1").parse()?;
        pb.is_active = true; // mocking state for conclusion
        let res = pb.conclude_play(spent, discoveries);
        println!("{}", res);
    } else {
        bail!("Unknown play action");
    }

    Ok(())
}

pub fn behavior_thanatosis(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .unwrap_or("agent_alpha")
        .to_string();
    let action = param_value(params, "action").ok_or_else(|| anyhow::anyhow!("missing action"))?;

    let mut ts = ThanatosisState::new(agent_id.clone());

    if action == "trigger" {
        let threat = param_value(params, "threat_source").unwrap_or("unknown_adversary");
        println!("{}", ts.trigger_fake_death(threat));
    } else if action == "revive" {
        println!("{}", ts.revive());
    } else {
        bail!("Unknown thanatosis action");
    }

    Ok(())
}

pub fn behavior_mimicry(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .unwrap_or("agent_alpha")
        .to_string();
    let target = param_value(params, "target_profile")
        .ok_or_else(|| anyhow::anyhow!("missing target_profile"))?;

    let mut ms = MimicrySpoofer::new(agent_id.clone(), "GenOS-Base".to_string());
    println!("{}", ms.spoof_signature(target));

    Ok(())
}
