use crate::args::{ApoptosisArgs, CircuitBreakerArgs, CryptobiosisArgs, HypermutationArgs};
use anyhow::{bail, Context, Result};
use genos_core::resilience::cellular::trigger_apoptosis;
use genos_core::resilience::cleaner::Hypermutation;
use genos_core::resilience::cyber_immune::{CircuitBreaker, CircuitState};
use genos_core::resilience::disaster::cryptobiose::Spore;
use std::fs;
use std::path::Path;

pub async fn cmd_resilience_apoptosis(args: ApoptosisArgs) -> Result<()> {
    println!("Triggering apoptosis for agent {}...", args.agent_id);
    trigger_apoptosis(&args.agent_id);
    Ok(())
}

pub async fn cmd_resilience_cryptobiosis(args: CryptobiosisArgs) -> Result<()> {
    let state_data = match (&args.state_file, &args.state_data) {
        (Some(path), None) => {
            fs::read(path).with_context(|| format!("reading {}", path.display()))?
        }
        (None, Some(data)) => data.clone().into_bytes(),
        (Some(_), Some(_)) => bail!("--state-file and --state-data are mutually exclusive"),
        (None, None) => bail!(
            "provide --state-file or --state-data: cryptobiosis freezes real agent state, \
             not a placeholder"
        ),
    };
    println!("Entering cryptobiosis mode: {}", args.mode);
    let spore = Spore::new(&state_data);
    let path = std::path::PathBuf::from(".genos/cryptobiosis.spore");
    spore.serialize(&path)?;
    println!("Spore saved to {:?}", path);
    Ok(())
}

pub async fn cmd_resilience_hypermutation(args: HypermutationArgs) -> Result<()> {
    println!("Starting hypermutation fuzzing on target: {}", args.target);
    let source = if Path::new(&args.target).is_file() {
        fs::read_to_string(&args.target).with_context(|| format!("reading {}", args.target))?
    } else {
        args.target.clone()
    };
    let mutated = Hypermutation::mutate_string(&source, 'x');
    let preview: String = mutated.chars().take(120).collect();
    println!(
        "Mutated {} chars; preview: {}",
        mutated.chars().count(),
        preview
    );
    Ok(())
}

pub async fn cmd_resilience_circuit_breaker(args: CircuitBreakerArgs) -> Result<()> {
    println!(
        "Tripping circuit breaker on branch: {} ({} failures, threshold {})",
        args.branch_id, args.failures, args.threshold
    );
    let mut cb = CircuitBreaker::new(args.threshold);
    for i in 1..=args.failures {
        cb.failure();
        println!(
            "Failure {}/{}. Is allowed? {}",
            i,
            args.failures,
            cb.is_allowed()
        );
    }
    match cb.state {
        CircuitState::Open => println!("Circuit OPEN: branch {} is halted", args.branch_id),
        CircuitState::Closed => println!("Circuit CLOSED: branch {} still allowed", args.branch_id),
    }
    Ok(())
}
