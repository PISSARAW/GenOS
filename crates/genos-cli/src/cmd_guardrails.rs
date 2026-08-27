use anyhow::Result;
use clap::{Parser, Subcommand};
use genos_core::guardrails::{ExecutionGuardrails, ExecutionMetrics};

#[derive(Parser, Debug)]
pub struct GuardrailsArgs {
    #[command(subcommand)]
    pub command: GuardrailsSubcommand,
}

#[derive(Subcommand, Debug)]
pub enum GuardrailsSubcommand {
    Verify {
        #[arg(long)]
        iteration: usize,
        #[arg(long)]
        tokens: usize,
        #[arg(long)]
        elapsed: u64,
        #[arg(long)]
        uncertainty: f64,
    },
}

pub async fn run(args: GuardrailsArgs) -> Result<()> {
    match args.command {
        GuardrailsSubcommand::Verify {
            iteration,
            tokens,
            elapsed,
            uncertainty,
        } => {
            let guardrails = ExecutionGuardrails::default();
            let metrics = ExecutionMetrics {
                current_iteration: iteration,
                total_tokens_used: tokens,
                elapsed_seconds: elapsed,
                current_uncertainty_score: uncertainty,
            };
            match guardrails.verify(&metrics) {
                Ok(_) => {
                    println!("Guardrails OK.");
                }
                Err(e) => {
                    println!("Guardrails Triggered: {}", e);
                    std::process::exit(1);
                }
            }
            Ok(())
        }
    }
}
