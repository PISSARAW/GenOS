//! Mesures matérielles de l'exécution, facultatives lorsque la source manque.
use crate::director::{Decision, Director};
use crate::physics::PhysicalState;
use crate::planner::{Goal, WorldState};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, Debug, Default)]
pub struct PhysicalTelemetry {
    pub workspace_files: Option<usize>,
    pub git_dirty_files: Option<usize>,
    pub git_branches: Option<usize>,
    pub ci_budget_ratio: Option<f64>,
}

impl PhysicalTelemetry {
    pub fn sample() -> Self {
        let root = std::env::current_dir().ok();
        Self {
            workspace_files: root.as_deref().and_then(count_workspace_files),
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
        if let Some(files) = self.workspace_files {
            state.friction = (state.friction + (files as f64 / 5000.0).min(0.2)).clamp(0.0, 1.0);
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
    PhysicalTelemetry::sample().apply(&mut physical);
    let context = crate::physics::DecisionContext {
        state,
        goal,
        phys: &physical,
        previous_strategy: director.physical_memory.as_ref().map(|memory| memory.1),
    };
    (director.decide_physical(&context), physical)
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
