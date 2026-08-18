use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::{de::DeserializeOwned, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn dev_dir(root: &Path) -> PathBuf {
    root.join("dev")
}

pub fn ledger(root: &Path, name: &str) -> PathBuf {
    dev_dir(root).join(format!("{name}.json"))
}

pub fn read_vec<T: DeserializeOwned>(path: &Path) -> Result<Vec<T>> {
    if !path.exists() {
        return Ok(vec![]);
    }
    serde_json::from_slice(&fs::read(path)?).with_context(|| format!("read {}", path.display()))
}

pub fn save_vec<T: Serialize>(path: &Path, values: &[T]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(values)?)?;
    Ok(())
}

pub fn save_one<T: Serialize>(root: &Path, collection: &str, id: &str, value: &T) -> Result<PathBuf> {
    let path = dev_dir(root).join(collection).join(format!("{id}.json"));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_vec_pretty(value)?)?;
    Ok(path)
}

pub fn read_one<T: DeserializeOwned>(root: &Path, collection: &str, id: &str) -> Result<T> {
    if id.is_empty()
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        return Err(anyhow!("invalid {collection} id '{id}'"));
    }
    let path = dev_dir(root).join(collection).join(format!("{id}.json"));
    serde_json::from_slice(
        &fs::read(&path).with_context(|| format!("unknown {collection} id '{id}'"))?,
    )
    .with_context(|| format!("parse {}", path.display()))
}

pub fn output(value: impl Serialize) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(&value)?);
    Ok(())
}

pub fn unique_id(prefix: &str) -> String {
    format!("{prefix}_{}", Utc::now().timestamp_micros())
}
