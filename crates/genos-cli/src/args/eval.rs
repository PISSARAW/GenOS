use clap::{Args, Subcommand};
use std::path::PathBuf;

#[derive(Args, Debug)]
pub struct EvalCommand {
    #[command(subcommand)]
    pub command: EvalSubcommands,
}
#[derive(Subcommand, Debug)]
pub enum EvalSubcommands {
    Import(EvalImportArgs),
    Run(EvalRunArgs),
}
#[derive(Args, Debug)]
pub struct EvalImportArgs {
    pub input: PathBuf,
    #[arg(short, long)]
    pub output: PathBuf,
}
#[derive(Args, Debug)]
pub struct EvalRunArgs {
    pub dataset: PathBuf,
    #[arg(short, long)]
    pub responses: PathBuf,
    #[arg(short, long)]
    pub output: Option<PathBuf>,
}
