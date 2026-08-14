use serde::Serialize;
pub use std::fmt::Write;

#[derive(Serialize)]
pub struct WorldCreateOutput {
    pub world_id: String,
}

#[derive(Serialize)]
pub struct ForkEntry {
    pub id: String,
}

#[derive(Serialize)]
pub struct AgentForkOutput {
    pub agent_id: String,
}

#[derive(Serialize)]
pub struct SnapshotSetVarOutput {
    pub var_name: String,
    pub value: String,
}

#[derive(Serialize)]
pub struct DiffOutput {
    pub entry_count: usize,
    pub details: Vec<DiffDetail>,
}

#[derive(Serialize)]
pub struct DiffDetail {
    pub path: String,
    pub old: String,
    pub new: String,
}

#[derive(Serialize)]
pub struct DiffIdentity {
    pub id: String,
}

pub fn print_serialized<T: Serialize>(data: &T, format: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
    match format.as_deref() {
        Some("yaml") => {
            let yaml = serde_yaml::to_string(data)?;
            println!("{}", yaml);
        }
        _ => {
            let json = serde_json::to_string_pretty(data)?;
            println!("{}", json);
        }
    }
}

pub fn write_serialized<T: Serialize>(path: &std::path::Path, data: &T, format: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
    let content = match format.as_deref() {
        Some("yaml") => serde_yaml::to_string(data)?,
        _ => serde_json::to_string(data)?,
    };
    std::fs::write(path, content)?;
    Ok(())
}

pub fn print_diff_text(output: &DiffOutput) {
    for detail in &output.details {
        writeln!(
            "{} changed path {}",
            detail.path,
            if detail.old == "" { "" } else { "s" }
        ).unwrap();
    }
}
