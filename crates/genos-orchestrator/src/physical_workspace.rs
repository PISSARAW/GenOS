//! Inventaire borné, sans traversée des liens symboliques.
use super::physical_measurements::*;
use std::path::Path;
use std::time::{Instant, UNIX_EPOCH};

pub fn inventory(config: &WorkspacePhysicsConfig) -> Measurement<WorkspaceInventory> {
    let mut result = Measurement::measured(WorkspaceInventory::default(), "workspace filesystem");
    let Ok(root) = config.root.canonicalize() else {
        return Measurement::unavailable("workspace filesystem", MeasurementStatus::Missing);
    };
    let started = Instant::now();
    let mut pending = vec![(root.clone(), 0)];
    let mut visited = 0;
    while let Some((directory, depth)) = pending.pop() {
        if visited >= config.max_entries || started.elapsed() >= config.scan_timeout {
            partial(&mut result, "scan budget exhausted");
            break;
        }
        let Ok(entries) = std::fs::read_dir(&directory) else {
            partial(&mut result, "directory unreadable");
            continue;
        };
        for entry in entries {
            visited += 1;
            if visited > config.max_entries || started.elapsed() >= config.scan_timeout {
                partial(&mut result, "scan budget exhausted");
                return result;
            }
            let Ok(entry) = entry else {
                partial(&mut result, "entry unreadable");
                continue;
            };
            inspect_entry(&mut result, &entry, (&root, depth, config, &mut pending));
        }
    }
    result
}

type Traversal<'a> = (
    &'a Path,
    usize,
    &'a WorkspacePhysicsConfig,
    &'a mut Vec<(std::path::PathBuf, usize)>,
);

fn inspect_entry(
    result: &mut Measurement<WorkspaceInventory>,
    entry: &std::fs::DirEntry,
    traversal: Traversal<'_>,
) {
    let (root, depth, config, pending) = traversal;
    let Ok(kind) = entry.file_type() else {
        partial(result, "entry type unreadable");
        return;
    };
    if kind.is_symlink() {
        result.value.as_mut().unwrap().excluded_symlinks += 1;
        return;
    }
    if kind.is_dir() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if excluded(&name) {
            return;
        }
        if depth >= config.max_depth {
            partial(result, "depth limit reached");
            return;
        }
        pending.push((entry.path(), depth + 1));
    } else if kind.is_file() {
        record_file(result, entry, root);
    }
}

fn record_file(
    result: &mut Measurement<WorkspaceInventory>,
    entry: &std::fs::DirEntry,
    root: &Path,
) {
    let Ok(metadata) = entry.metadata() else {
        partial(result, "file unreadable");
        return;
    };
    let name = entry
        .path()
        .strip_prefix(root)
        .unwrap()
        .to_string_lossy()
        .replace('\\', "/");
    let modified_at_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_millis() as u64);
    let inventory = result.value.as_mut().unwrap();
    inventory.bytes = inventory.bytes.saturating_add(metadata.len());
    inventory.files.insert(
        name,
        FileObservation {
            bytes: metadata.len(),
            modified_at_ms,
        },
    );
}

fn excluded(name: &str) -> bool {
    name.starts_with('.')
        || matches!(
            name,
            "target" | "node_modules" | "coverage" | "dist" | "build"
        )
}

pub(crate) fn partial<T>(measurement: &mut Measurement<T>, detail: &str) {
    measurement.status = MeasurementStatus::Partial;
    measurement.detail = Some(detail.into());
}
