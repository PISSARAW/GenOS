use crate::args::OutputFormat;
use genos_core::{AgentDiff, AgentSnapshot, MemoryKind, SnapshotComparison, VariableIsolationReport};
use genos_store::BasicReplayState;
use genos_world::FileIsolationReport;
use serde::Serialize;
use std::path::Path;
use std::{fs, path::PathBuf};

// ---------- output structs ----------

#[derive(Serialize)]
pub struct WorldCreateOutput {
    pub provider: String,
    pub world_id: String,
}

#[derive(Serialize)]
pub struct WorldSnapshotOutput {
    pub provider: String,
    pub world_id: String,
    pub snapshot_id: String,
}

#[derive(Serialize)]
pub struct WorldForkOutput {
    pub provider: String,
    pub parent_snapshot_id: String,
    pub world_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct WorldDiffOutput {
    pub provider: String,
    pub world_a: String,
    pub world_b: String,
    pub files_changed: usize,
}

#[derive(Serialize)]
pub struct WorldDestroyOutput {
    pub provider: String,
    pub world_id: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct WorldReadFileOutput {
    pub provider: String,
    pub world_id: String,
    pub path: String,
    pub found: bool,
    pub contents: Option<String>,
}

#[derive(Serialize)]
pub struct WorldWriteFileOutput {
    pub provider: String,
    pub world_id: String,
    pub path: String,
    pub previous_contents: Option<String>,
    pub contents: String,
    pub created: bool,
}

#[derive(Serialize)]
pub struct WorldCheckFileOutput {
    pub provider: String,
    pub parent_world_id: String,
    pub branch_count: usize,
    pub report: FileIsolationReport,
}

#[derive(Serialize)]
pub struct ReplayBasicOutput {
    pub store_path: String,
    pub branch_id: Option<String>,
    pub anchor_snapshot_id: Option<String>,
    pub state: BasicReplayState,
}

#[derive(Serialize)]
pub struct ReplayFromSnapshotOutput {
    pub snapshot_store_path: String,
    pub event_store_path: String,
    pub snapshot_id: String,
    pub branch_id: String,
    pub from_sequence_exclusive: u64,
    pub replayed_events: usize,
    pub state: BasicReplayState,
}

#[derive(Serialize)]
pub struct AgentForkOutput {
    pub parent_snapshot_id: String,
    pub parent_agent_id: String,
    pub parent_branch_id: String,
    pub count: usize,
    pub saved_to_store: bool,
    pub snapshot_store_path: Option<String>,
    pub event_store_path: Option<String>,
    pub forks: Vec<ForkEntry>,
}

#[derive(Serialize)]
pub struct ForkEntry {
    pub index: u32,
    pub snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    pub first_event_sequence: u64,
    pub path: Option<String>,
    pub fork_event_id: Option<String>,
}

#[derive(Serialize)]
pub struct SnapshotSetVarOutput {
    pub snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    pub key: String,
    pub previous_value: Option<String>,
    pub value: String,
    pub out_path: Option<String>,
    pub snapshot_store_path: Option<String>,
    pub event_store_path: Option<String>,
    pub event_id: Option<String>,
    pub event_sequence: u64,
}

#[derive(Serialize)]
pub struct CognitionChange {
    pub field: String,
    pub previous: String,
    pub value: String,
}

#[derive(Serialize)]
pub struct SnapshotSetCognitionOutput {
    pub snapshot_id: String,
    pub branch_id: String,
    pub genome_id: String,
    pub changed: Vec<CognitionChange>,
    pub out_path: Option<String>,
    pub snapshot_store_path: Option<String>,
}

#[derive(Serialize)]
pub struct SnapshotAddMemoryOutput {
    pub snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    pub memory_id: String,
    pub kind: MemoryKind,
    pub content: String,
    /// Provenance recorded with the memory: the branch it was created on, when,
    /// and what it came from.
    pub created_in: String,
    pub created_at: String,
    pub source: Option<String>,
    pub semantic_ref_count: usize,
    pub episodic_ref_count: usize,
    pub out_path: Option<String>,
    pub snapshot_store_path: Option<String>,
    pub event_store_path: Option<String>,
    pub event_id: Option<String>,
    pub event_sequence: u64,
}

#[derive(Serialize)]
pub struct SnapshotCheckVarOutput {
    pub parent_snapshot_id: String,
    pub branch_count: usize,
    pub report: VariableIsolationReport,
}

#[derive(Serialize)]
pub struct DiffOutput {
    pub a_snapshot_id: String,
    pub b_snapshot_id: String,
    /// True when the two snapshots carry the same logical state.
    pub empty: bool,
    pub entry_count: usize,
    pub changed_paths: Vec<String>,
    /// Reported for context only: identity is never part of the diff.
    pub identity: DiffIdentity,
    pub diff: AgentDiff,
}

#[derive(Serialize)]
pub struct DiffIdentity {
    pub distinct_snapshot_id: bool,
    pub distinct_agent_id: bool,
    pub distinct_branch_id: bool,
    pub distinct_identity: bool,
}

#[derive(Serialize)]
pub struct SnapshotCompareOutput {
    pub a_snapshot_id: String,
    pub b_snapshot_id: String,
    pub comparison: SnapshotComparison,
}

#[derive(Serialize)]
pub struct SnapshotSaveOutput {
    pub store_path: String,
    pub snapshot_id: String,
}

#[derive(Serialize)]
pub struct SnapshotGetOutput {
    pub store_path: String,
    pub snapshot_id: String,
    pub found: bool,
    pub snapshot: Option<AgentSnapshot>,
}

#[derive(Serialize)]
pub struct SnapshotListOutput {
    pub store_path: String,
    pub count: usize,
    pub snapshot_ids: Vec<String>,
}

// ---------- helpers ----------

pub fn write_serialized<T: Serialize>(path: &Path, value: &T, format: OutputFormat) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    match format {
        OutputFormat::Json => fs::write(path, serde_json::to_string_pretty(value)?)?,
        OutputFormat::Yaml => fs::write(path, serde_yaml::to_string(value)?)?,
    }
    Ok(())
}

pub fn print_serialized<T: Serialize>(value: &T, format: OutputFormat) -> anyhow::Result<()> {
    match format {
        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(value)?),
        OutputFormat::Yaml => println!("{}", serde_yaml::to_string(value)?),
    }
    Ok(())
}

pub fn print_diff_text(out: &DiffOutput) {
    println!("diff a={} b={}", out.a_snapshot_id, out.b_snapshot_id);

    if out.empty {
        println!("no logical difference");

        // Worth saying out loud: the diff is empty even though these two are
        // different agents on different branches.
        let distinct: Vec<&str> = [
            ("snapshot_id", out.identity.distinct_snapshot_id),
            ("agent_id", out.identity.distinct_agent_id),
            ("branch_id", out.identity.distinct_branch_id),
        ]
        .into_iter()
        .filter_map(|(name, differs)| differs.then_some(name))
        .collect();

        if distinct.is_empty() {
            println!("identity: same snapshot on both sides");
        } else {
            println!("identity differs: {}", distinct.join(", "));
        }
        return;
    }

    print!("{}", out.diff.to_text());
    println!(
        "{} changed path{}",
        out.entry_count,
        if out.entry_count == 1 { "" } else { "s" }
    );
}

/// Some callers want to default a path to "the file the snapshot came from";
/// this helper is the one place that knows how to interpret a `--snapshot`
/// string as a file path or an id.
pub fn snapshot_path_or_none(spec: &str) -> Option<PathBuf> {
    let path = PathBuf::from(spec);
    path.is_file().then_some(path)
}
