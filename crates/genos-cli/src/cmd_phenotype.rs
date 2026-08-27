use anyhow::Result;
use clap::{Parser, Subcommand};
use genos_core::phenotype::measure_divergence;

#[derive(Parser, Debug)]
pub struct PhenotypeArgs {
    #[command(subcommand)]
    pub command: PhenotypeSubcommand,
}

#[derive(Subcommand, Debug)]
pub enum PhenotypeSubcommand {
    MeasureDivergence {
        #[arg(long)]
        trait_name: String,
        #[arg(long)]
        expected: f64,
        #[arg(long)]
        observed: f64,
        #[arg(long)]
        tolerance: f64,
    },
}

pub async fn run(args: PhenotypeArgs) -> Result<()> {
    match args.command {
        PhenotypeSubcommand::MeasureDivergence {
            trait_name,
            expected,
            observed,
            tolerance,
        } => {
            let div = measure_divergence(trait_name, expected, observed, tolerance);
            println!("{}", serde_json::to_string_pretty(&div)?);
            Ok(())
        }
    }
}
