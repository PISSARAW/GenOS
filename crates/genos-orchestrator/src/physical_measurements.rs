//! Contrats de mesure : une absence, une erreur et une observation sont distinctes.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum MeasurementStatus {
    Measured,
    Partial,
    Missing,
    Invalid,
    Stale,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Measurement<T> {
    pub value: Option<T>,
    pub source: String,
    pub observed_at_ms: u64,
    pub status: MeasurementStatus,
    pub detail: Option<String>,
}

impl<T> Default for Measurement<T> {
    fn default() -> Self {
        Self::unavailable("unspecified", MeasurementStatus::Missing)
    }
}

impl<T> Measurement<T> {
    pub fn measured(value: T, source: impl Into<String>) -> Self {
        Self {
            value: Some(value),
            source: source.into(),
            observed_at_ms: now_ms(),
            status: MeasurementStatus::Measured,
            detail: None,
        }
    }
    pub fn unavailable(source: impl Into<String>, status: MeasurementStatus) -> Self {
        Self {
            value: None,
            source: source.into(),
            observed_at_ms: now_ms(),
            status,
            detail: None,
        }
    }
    pub fn usable(&self) -> Option<&T> {
        matches!(
            self.status,
            MeasurementStatus::Measured | MeasurementStatus::Partial
        )
        .then_some(self.value.as_ref())
        .flatten()
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Debug)]
pub struct WorkspacePhysicsConfig {
    pub root: PathBuf,
    pub max_entries: usize,
    pub max_depth: usize,
    pub max_file_bytes: u64,
    pub max_read_bytes: u64,
    pub scan_timeout: Duration,
    pub cache_ttl: Duration,
    pub report_max_age: Duration,
    pub coverage_paths: Vec<PathBuf>,
}

impl WorkspacePhysicsConfig {
    pub fn for_root(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            max_entries: 30_000,
            max_depth: 32,
            max_file_bytes: 2_000_000,
            max_read_bytes: 32_000_000,
            scan_timeout: Duration::from_millis(500),
            cache_ttl: Duration::from_secs(5),
            report_max_age: Duration::from_secs(86_400),
            coverage_paths: vec![
                "coverage/lcov.info".into(),
                "backend/coverage/lcov.info".into(),
                "coverage/coverage-final.json".into(),
                "backend/coverage/coverage-final.json".into(),
            ],
        }
    }
}

impl Default for WorkspacePhysicsConfig {
    fn default() -> Self {
        Self::for_root(std::env::current_dir().unwrap_or_default())
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ContextUsage {
    pub bytes: usize,
    pub tokens: Option<u64>,
    pub capacity_tokens: Option<u64>,
}

impl ContextUsage {
    pub fn from_payload(payload: &[u8]) -> Self {
        Self {
            bytes: payload.len(),
            ..Self::default()
        }
    }
    pub fn token_pressure(&self) -> Option<f64> {
        let capacity = self.capacity_tokens.filter(|capacity| *capacity > 0)?;
        Some((self.tokens? as f64 / capacity as f64).clamp(0.0, 1.0))
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct EvidenceDebt {
    pub outstanding: u64,
    pub required: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WorkspaceInventory {
    pub files: BTreeMap<String, FileObservation>,
    pub bytes: u64,
    pub excluded_symlinks: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileObservation {
    pub bytes: u64,
    pub modified_at_ms: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DependencyGraph {
    pub edges: BTreeMap<String, BTreeSet<String>>,
    pub declared: BTreeMap<String, BTreeSet<String>>,
    pub unresolved_imports: usize,
    pub parsed_files: usize,
    pub external_imports: usize,
}

impl DependencyGraph {
    pub fn edge_count(&self) -> usize {
        self.edges.values().map(BTreeSet::len).sum()
    }
    pub fn declared_count(&self) -> usize {
        self.declared.values().map(BTreeSet::len).sum()
    }
    pub fn gravity(&self) -> BTreeMap<String, f64> {
        let mut incoming = BTreeMap::<String, usize>::new();
        for targets in self.edges.values() {
            for target in targets {
                *incoming.entry(target.clone()).or_default() += 1;
            }
        }
        let denominator = self.parsed_files.max(1) as f64;
        incoming
            .into_iter()
            .map(|(path, count)| (path, (count as f64 / denominator).min(1.0)))
            .collect()
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CoverageObservation {
    pub lines_found: usize,
    pub lines_hit: usize,
    pub branches_found: usize,
    pub branches_hit: usize,
    pub files: BTreeMap<String, (usize, usize)>,
}

impl CoverageObservation {
    pub fn line_ratio(&self) -> Option<f64> {
        (self.lines_found > 0).then(|| self.lines_hit as f64 / self.lines_found as f64)
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WorkspaceMeasurements {
    pub inventory: Measurement<WorkspaceInventory>,
    pub dependencies: Measurement<DependencyGraph>,
    pub coverage: Measurement<CoverageObservation>,
    pub git_dirty_files: Measurement<usize>,
    pub git_branches: Measurement<usize>,
}

pub(crate) fn confined(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|error| error.to_string())?;
    let resolved = root
        .join(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !resolved.starts_with(&root) {
        return Err("path outside workspace".into());
    }
    Ok(resolved)
}

pub(crate) fn read_document(config: &WorkspacePhysicsConfig, path: &str) -> Result<String, String> {
    let resolved = confined(&config.root, Path::new(path))?;
    let size = std::fs::metadata(&resolved)
        .map_err(|error| error.to_string())?
        .len();
    if size > config.max_file_bytes {
        return Err("source exceeds read limit".into());
    }
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(resolved)
        .map_err(|error| error.to_string())?
        .take(config.max_file_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > config.max_file_bytes {
        return Err("source grew beyond read limit".into());
    }
    String::from_utf8(bytes).map_err(|error| error.to_string())
}
