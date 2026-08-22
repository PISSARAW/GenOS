use clap::{Args, Subcommand};
use std::path::PathBuf;

#[derive(Args, Debug)]
pub struct PromptCommand {
    #[command(subcommand)]
    pub command: PromptSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum PromptSubcommands {
    Publish(PromptPublishArgs),
    Render(PromptRenderArgs),
    Diff(PromptDiffArgs),
}

#[derive(Args, Debug)]
pub struct PromptPublishArgs {
    pub name: String,
    pub template: String,
    #[arg(short, long, default_value = ".genos/prompts.json")]
    pub registry: PathBuf,
    #[arg(long, value_delimiter = ',')]
    pub label: Vec<String>,
}

#[derive(Args, Debug)]
pub struct PromptRenderArgs {
    pub name: String,
    #[arg(long)]
    pub version: Option<u32>,
    #[arg(long = "var", value_parser = parse_var)]
    pub variables: Vec<(String, String)>,
    #[arg(short, long, default_value = ".genos/prompts.json")]
    pub registry: PathBuf,
}

#[derive(Args, Debug)]
pub struct PromptDiffArgs {
    pub name: String,
    pub left: u32,
    pub right: u32,
    #[arg(short, long, default_value = ".genos/prompts.json")]
    pub registry: PathBuf,
}

fn parse_var(value: &str) -> Result<(String, String), String> {
    value
        .split_once('=')
        .map(|(key, value)| (key.into(), value.into()))
        .ok_or_else(|| "variables must use KEY=VALUE".into())
}
