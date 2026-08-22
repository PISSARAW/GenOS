use clap::{Args, Subcommand};
use std::path::PathBuf;

#[derive(Args, Debug)]
pub struct PlatformCommand {
    #[command(subcommand)]
    pub command: PlatformSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum PlatformSubcommands {
    /// Ingest a text-like document into a portable local index.
    Ingest(PlatformIngestArgs),
    /// Run hybrid lexical/semantic search.
    Search(PlatformSearchArgs),
    /// Print the currently available platform capabilities.
    Status,
}

#[derive(Args, Debug)]
pub struct PlatformIngestArgs {
    pub document: PathBuf,
    #[arg(short, long, default_value = ".genos/platform-index.json")]
    pub index: PathBuf,
    #[arg(long, default_value_t = 800)]
    pub chunk_size: usize,
    #[arg(long, default_value_t = 120)]
    pub overlap: usize,
}

#[derive(Args, Debug)]
pub struct PlatformSearchArgs {
    pub query: String,
    #[arg(short, long, default_value = ".genos/platform-index.json")]
    pub index: PathBuf,
    #[arg(short, long, default_value_t = 5)]
    pub limit: usize,
}
