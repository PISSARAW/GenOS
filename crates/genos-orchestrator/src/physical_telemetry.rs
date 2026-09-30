//! Mesures matérielles de l'exécution, facultatives lorsque la source manque.
use crate::director::{Decision, Director};
use crate::physics::PhysicalState;
use crate::planner::{Goal, WorldState};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct MissionPhysicsProfile {
    pub episodes: u64,
    pub successes: u64,
    pub friction_scale: f64,
}

impl Default for MissionPhysicsProfile {
    fn default() -> Self {
        Self { episodes: 0, successes: 0, friction_scale: 1.0 }
    }
}

impl MissionPhysicsProfile {
    pub fn record_episode(&mut self, success: bool) {
        self.episodes = self.episodes.saturating_add(1);
        self.successes = self.successes.saturating_add(u64::from(success));
        if self.episodes >= 3 {
            let rate = self.successes as f64 / self.episodes as f64;
            self.friction_scale = (1.1 - rate * 0.2).clamp(0.8, 1.2);
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct PhysicalTelemetry {
    pub workspace_files: Option<usize>,
    /// Octets du vecteur de contexte réellement transmis au directeur.
    pub context_bytes: Option<usize>,
    /// Dépendances directes déclarées dans les manifests reconnus.
    pub declared_dependencies: Option<usize>,
    /// Fraction de lignes couvertes lue depuis `lcov.info` (si présent).
    pub line_coverage: Option<f64>,
    pub git_dirty_files: Option<usize>,
    pub git_branches: Option<usize>,
    pub ci_budget_ratio: Option<f64>,
}

impl PhysicalTelemetry {
    pub fn sample() -> Self {
        Self::sample_with_context(None)
    }

    pub fn sample_with_context(context: Option<&[f64]>) -> Self {
        let root = std::env::current_dir().ok();
        Self {
            workspace_files: root.as_deref().and_then(count_workspace_files),
            context_bytes: context.and_then(|values| serde_json::to_vec(values).ok().map(|v| v.len())),
            declared_dependencies: root.as_deref().and_then(count_declared_dependencies),
            line_coverage: root.as_deref().and_then(read_lcov_coverage),
            git_dirty_files: root
                .as_deref()
                .and_then(|path| git_count(path, "status", &["--short"])),
            git_branches: root
                .as_deref()
                .and_then(|path| git_count(path, "branch", &["--list"])),
            ci_budget_ratio: ci_budget_ratio(),
        }
    }

    /// Incorpore les mesures disponibles aux variables de contrôle [0,1].
    pub fn apply(&self, state: &mut PhysicalState) {
        self.apply_with_scale(state, 1.0);
    }

    pub fn apply_with_scale(&self, state: &mut PhysicalState, friction_scale: f64) {
        if let Some(files) = self.workspace_files {
            state.friction = (state.friction + (files as f64 / 5000.0).min(0.2) * friction_scale).clamp(0.0, 1.0);
        }
        if let Some(bytes) = self.context_bytes {
            state.friction = (state.friction + (bytes as f64 / 1_000_000.0).min(0.15)).clamp(0.0, 1.0);
        }
        if let Some(dependencies) = self.declared_dependencies {
            state.entropy = (state.entropy + (dependencies as f64 / 2_000.0).min(0.15)).clamp(0.0, 1.0);
        }
        if let Some(coverage) = self.line_coverage {
            state.energy = (state.energy + (coverage - 0.5) * 0.1).clamp(0.0, 1.0);
        }
        if let Some(dirty) = self.git_dirty_files {
            state.entropy = (state.entropy + (dirty as f64 / 100.0).min(0.2)).clamp(0.0, 1.0);
        }
        if let Some(branches) = self.git_branches {
            state.inertia = (state.inertia + (branches as f64 / 100.0).min(0.15)).clamp(0.0, 1.0);
        }
        if let Some(ratio) = self.ci_budget_ratio {
            state.energy = state.energy.min(ratio);
            state.pressure = state.pressure.max(1.0 - ratio);
        }
    }
}

/// Applique la dérivation mesurée avant d'appeler la politique normale.
pub(crate) fn decide(
    director: &Director,
    state: &WorldState,
    goal: &Goal,
) -> (Decision, PhysicalState) {
    let mut physical = PhysicalState::derive(
        state,
        director.physical_memory.as_ref().map(|memory| &memory.0),
    );
    let profile = director.mission_physics.get(&goal.mission_key()).cloned().unwrap_or_default();
    PhysicalTelemetry::sample_with_context(Some(&director.last_context))
        .apply_with_scale(&mut physical, profile.friction_scale);
    let context = crate::physics::DecisionContext {
        state,
        goal,
        phys: &physical,
        previous_strategy: director.physical_memory.as_ref().map(|memory| memory.1),
    };
    (director.decide_physical(&context), physical)
}

fn count_declared_dependencies(root: &Path) -> Option<usize> {
    let mut total = 0usize;
    let mut found = false;
    for manifest in ["Cargo.toml", "backend/package.json", "mcp/package.json", "package.json"] {
        let content = std::fs::read_to_string(root.join(manifest)).ok();
        let Some(content) = content else { continue };
        found = true;
        if manifest.ends_with("package.json") {
            let parsed: serde_json::Value = serde_json::from_str(&content).ok()?;
            for key in ["dependencies", "devDependencies", "peerDependencies"] {
                total += parsed.get(key).and_then(serde_json::Value::as_object).map_or(0, |deps| deps.len());
            }
        } else {
            let mut in_dependencies = false;
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('[') {
                    in_dependencies = matches!(trimmed, "[dependencies]" | "[dev-dependencies]" | "[build-dependencies]");
                } else if in_dependencies && trimmed.contains('=') && !trimmed.starts_with('#') {
                    total += 1;
                }
            }
        }
    }
    found.then_some(total)
}

fn read_lcov_coverage(root: &Path) -> Option<f64> {
    let report = std::fs::read_to_string(root.join("coverage/lcov.info")).ok()?;
    let mut found = 0usize;
    let mut covered = 0usize;
    for line in report.lines() {
        if let Some((_, hits)) = line.strip_prefix("DA:").and_then(|value| value.split_once(',')) {
            found += 1;
            covered += usize::from(hits.parse::<usize>().ok()? > 0);
        }
    }
    (found > 0).then_some(covered as f64 / found as f64)
}

fn git_count(root: &Path, command: &str, args: &[&str]) -> Option<usize> {
    let output = Command::new("git")
        .args([command])
        .args(args)
        .current_dir(root)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).lines().count())
}

fn count_workspace_files(root: &Path) -> Option<usize> {
    let mut pending = vec![PathBuf::from(root)];
    let mut count = 0usize;
    while let Some(directory) = pending.pop() {
        for entry in std::fs::read_dir(directory).ok()? {
            let entry = entry.ok()?;
            let name = entry.file_name();
            if matches!(name.to_str(), Some(".git" | "target" | "node_modules")) {
                continue;
            }
            let kind = entry.file_type().ok()?;
            if kind.is_dir() {
                pending.push(entry.path());
            } else if kind.is_file() {
                count += 1;
            }
        }
    }
    Some(count)
}

fn ci_budget_ratio() -> Option<f64> {
    let remaining = std::env::var("CI_BUDGET_REMAINING")
        .or_else(|_| std::env::var("GITHUB_RUN_ATTEMPT_REMAINING"))
        .ok()?
        .parse::<f64>()
        .ok()?;
    let total = std::env::var("CI_BUDGET_TOTAL")
        .or_else(|_| std::env::var("GITHUB_RUN_ATTEMPT_TOTAL"))
        .ok()?
        .parse::<f64>()
        .ok()?;
    (total > 0.0).then(|| (remaining / total).clamp(0.0, 1.0))
}
