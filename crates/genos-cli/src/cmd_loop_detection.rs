use anyhow::Result;
use clap::Parser;
use genos_core::loop_detection::{CircuitBreaker, IterationSnapshot};
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct LoopDetectionArgs {
    #[arg(long)]
    pub history_file: PathBuf,
    #[arg(long, default_value_t = 3)]
    pub exact_match: usize,
    #[arg(long, default_value_t = 5)]
    pub stagnation: usize,
    #[arg(long, default_value_t = 0.95)]
    pub similarity: f32,
}

pub async fn cmd_loop_detection_check(args: LoopDetectionArgs) -> Result<()> {
    let content = tokio::fs::read_to_string(&args.history_file).await?;
    let history: Vec<IterationSnapshot> = serde_json::from_str(&content)?;

    let mut breaker = CircuitBreaker::new(args.exact_match, args.stagnation, args.similarity);
    for snapshot in history {
        breaker.record_iteration(snapshot);
    }

    match breaker.check_for_loops() {
        Ok(_) => {
            println!("No cognitive loops detected.");
        }
        Err(e) => {
            println!("Cognitive loop detected: {}", e);
            std::process::exit(1);
        }
    }

    Ok(())
}
