use anyhow::Result;
use clap::{Parser, Subcommand};
use genos_core::causality::CausalBoundary;

#[derive(Parser, Debug)]
pub struct CausalityArgs {
    #[command(subcommand)]
    pub command: CausalitySubcommand,
}

#[derive(Subcommand, Debug)]
pub enum CausalitySubcommand {
    Fork {
        #[arg(long)]
        boundary_id: String,
        #[arg(long)]
        new_boundary_id: String,
    },
}

pub async fn run(args: CausalityArgs) -> Result<()> {
    match args.command {
        CausalitySubcommand::Fork { boundary_id, new_boundary_id } => {
            let boundary = CausalBoundary::new(boundary_id.clone(), None);
            let fork = boundary.fork(new_boundary_id);
            println!("Forked causal boundary from {} to {}", boundary_id, fork.boundary_id);
            Ok(())
        }
    }
}
