use anyhow::Result;
use clap::{Parser, Subcommand};
use genos_core::entities::EntityRef;
use genos_core::rebase::TrajectoryRebaser;
use genos_core::revert::ActionDependencyGraph;
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct RebaseArgs {
    #[command(subcommand)]
    pub command: RebaseSubcommand,
}

#[derive(Subcommand, Debug)]
pub enum RebaseSubcommand {
    ComputePlan {
        #[arg(long)]
        graph_file: PathBuf,
        #[arg(long)]
        injection_step: usize,
        #[arg(long)]
        injected_keys: Vec<String>,
    },
}

pub async fn run(args: RebaseArgs) -> Result<()> {
    match args.command {
        RebaseSubcommand::ComputePlan {
            graph_file,
            injection_step,
            injected_keys,
        } => {
            let content = tokio::fs::read_to_string(&graph_file).await?;
            let graph: ActionDependencyGraph = serde_json::from_str(&content)?;
            let writes: Vec<EntityRef> = injected_keys
                .into_iter()
                .map(|key| EntityRef::StateVar { key })
                .collect();
            let plan = TrajectoryRebaser::compute_rebase_plan(&graph, injection_step, &writes);
            println!("{}", serde_json::to_string_pretty(&plan)?);
            Ok(())
        }
    }
}
