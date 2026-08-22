use crate::args::{PromptDiffArgs, PromptPublishArgs, PromptRenderArgs};
use anyhow::{Context, Result};
use genos_platform::{PromptRegistry, PromptVersion};
use std::{collections::BTreeMap, fs, path::Path};

fn load(path: &Path) -> Result<PromptRegistry> {
    if !path.exists() {
        return Ok(PromptRegistry::default());
    }
    Ok(serde_json::from_slice(
        &fs::read(path).with_context(|| format!("reading {}", path.display()))?,
    )?)
}
fn save(path: &Path, registry: &PromptRegistry) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(registry)?)?;
    Ok(())
}
pub fn cmd_prompt_publish(args: PromptPublishArgs) -> Result<()> {
    let mut registry = load(&args.registry)?;
    let version = registry
        .publish(args.name, args.template, args.label)
        .clone();
    save(&args.registry, &registry)?;
    println!("{}@{} {}", version.name, version.version, version.digest);
    Ok(())
}
pub fn cmd_prompt_render(args: PromptRenderArgs) -> Result<()> {
    let registry = load(&args.registry)?;
    let variables: BTreeMap<_, _> = args.variables.into_iter().collect();
    let rendered = registry
        .render(&args.name, args.version, &variables)
        .with_context(|| format!("prompt {} was not found", args.name))?;
    println!("{}", rendered);
    Ok(())
}
pub fn cmd_prompt_diff(args: PromptDiffArgs) -> Result<()> {
    let registry = load(&args.registry)?;
    let left = registry
        .get(&args.name, Some(args.left))
        .with_context(|| format!("prompt {}@{} was not found", args.name, args.left))?;
    let right = registry
        .get(&args.name, Some(args.right))
        .with_context(|| format!("prompt {}@{} was not found", args.name, args.right))?;
    let result = serde_json::json!({"name": args.name, "left": version_summary(left), "right": version_summary(right), "changed": left.template != right.template});
    println!("{}", serde_json::to_string_pretty(&result)?);
    Ok(())
}
fn version_summary(prompt: &PromptVersion) -> serde_json::Value {
    serde_json::json!({"version": prompt.version, "digest": prompt.digest, "template": prompt.template, "labels": prompt.labels})
}
