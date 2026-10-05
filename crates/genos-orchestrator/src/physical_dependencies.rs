//! Graphe des imports locaux Rust/JS/TS et dépendances déclarées Cargo/npm.
use super::physical_measurements::*;
use super::physical_workspace::partial;
use std::collections::BTreeSet;
use std::path::Path;
use std::time::Instant;

pub fn dependencies(
    config: &WorkspacePhysicsConfig,
    files: &Measurement<WorkspaceInventory>,
) -> Measurement<DependencyGraph> {
    let Some(inventory) = files.usable() else {
        return Measurement::unavailable("Cargo/npm and local imports", MeasurementStatus::Missing);
    };
    let mut result = Measurement::measured(
        DependencyGraph::default(),
        "Cargo/npm and local Rust/JS/TS imports",
    );
    let mut read_bytes = 0;
    let started = Instant::now();
    for (name, file) in &inventory.files {
        if !supported(name) {
            continue;
        }
        read_bytes += file.bytes;
        if read_bytes > config.max_read_bytes || started.elapsed() > config.scan_timeout {
            partial(&mut result, "dependency analysis budget exhausted");
            break;
        }
        let Ok(text) = read_document(config, name) else {
            partial(&mut result, "source unreadable or oversized");
            continue;
        };
        let graph = result.value.as_mut().unwrap();
        if name.ends_with("Cargo.toml") || name.ends_with("package.json") {
            if !manifest(graph, name, &text) {
                partial(&mut result, "invalid manifest");
            }
        } else {
            parse_source(graph, name, (&text, inventory));
        }
    }
    if files.status == MeasurementStatus::Partial {
        partial(&mut result, "workspace inventory partial");
    }
    if result.value.as_ref().unwrap().unresolved_imports > 0 {
        partial(&mut result, "some local imports unresolved");
    }
    result
}

fn supported(path: &str) -> bool {
    path.ends_with("Cargo.toml")
        || path.ends_with("package.json")
        || matches!(
            Path::new(path).extension().and_then(|value| value.to_str()),
            Some("rs" | "js" | "cjs" | "mjs" | "ts" | "tsx" | "jsx")
        )
}

fn manifest(graph: &mut DependencyGraph, name: &str, text: &str) -> bool {
    if name.ends_with("package.json") {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(text) else {
            return false;
        };
        let mut names = BTreeSet::new();
        for kind in [
            "dependencies",
            "devDependencies",
            "peerDependencies",
            "optionalDependencies",
        ] {
            if let Some(deps) = value.get(kind).and_then(serde_json::Value::as_object) {
                names.extend(deps.keys().cloned());
            }
        }
        graph.declared.insert(name.into(), names);
    } else {
        let Ok(value) = text.parse::<toml::Value>() else {
            return false;
        };
        let mut names = BTreeSet::new();
        cargo_dependencies(&value, &mut names);
        graph.declared.insert(name.into(), names);
    }
    true
}

fn cargo_dependencies(value: &toml::Value, names: &mut BTreeSet<String>) {
    let Some(table) = value.as_table() else {
        return;
    };
    for (key, entry) in table {
        if matches!(
            key.as_str(),
            "dependencies" | "dev-dependencies" | "build-dependencies"
        ) {
            if let Some(deps) = entry.as_table() {
                names.extend(deps.keys().cloned());
            }
        } else if matches!(key.as_str(), "workspace" | "target")
            || key.starts_with("cfg(")
            || key.contains('-')
        {
            cargo_dependencies(entry, names);
        }
    }
}

fn parse_source(graph: &mut DependencyGraph, name: &str, source: (&str, &WorkspaceInventory)) {
    let (text, inventory) = source;
    graph.parsed_files += 1;
    let rust = name.ends_with(".rs");
    let Ok(imports) = crate::physical_imports::imports(text, rust) else {
        graph.unresolved_imports += 1;
        return;
    };
    for import in imports {
        let local = if rust {
            ["crate::", "self::", "super::", "module::", "path:"]
                .iter()
                .any(|prefix| import.starts_with(prefix))
        } else {
            import.starts_with('.')
        };
        if !local {
            graph.external_imports += 1;
            continue;
        }
        let target = if rust {
            resolve_rust(name, &import, inventory)
        } else {
            resolve_js(name, &import, inventory)
        };
        match target {
            Some(target) => {
                graph.edges.entry(name.into()).or_default().insert(target);
            }
            None => graph.unresolved_imports += 1,
        }
    }
}

fn resolve_js(name: &str, import: &str, inventory: &WorkspaceInventory) -> Option<String> {
    let parent = Path::new(name).parent()?;
    let base = normalize(&parent.join(import))?;
    let mut candidates = vec![base.clone()];
    for extension in ["js", "cjs", "mjs", "ts", "tsx", "jsx"] {
        candidates.push(format!("{base}.{extension}"));
        candidates.push(format!("{base}/index.{extension}"));
    }
    candidates
        .into_iter()
        .find(|candidate| inventory.files.contains_key(candidate))
}

fn resolve_rust(name: &str, import: &str, inventory: &WorkspaceInventory) -> Option<String> {
    let parent = Path::new(name).parent()?;
    if let Some(path) = import.strip_prefix("path:") {
        let target = normalize(&parent.join(path))?;
        return inventory.files.contains_key(&target).then_some(target);
    }
    let mut parts: Vec<_> = import.split("::").collect();
    let mut base = rust_module_dir(name);
    match parts.first().copied() {
        Some("crate") => {
            base = if name.starts_with("src/") {
                "src".into()
            } else {
                Path::new(name.split("/src/").next()?).join("src")
            };
            parts.remove(0);
        }
        Some("self" | "module") => {
            parts.remove(0);
        }
        Some("super") => {
            base = parent.to_path_buf();
            parts.remove(0);
        }
        _ => {}
    }
    let mut candidates = Vec::new();
    for part in parts {
        base.push(part);
        let relative = normalize(&base)?;
        candidates.push(format!("{relative}.rs"));
        candidates.push(format!("{relative}/mod.rs"));
    }
    candidates
        .into_iter()
        .rev()
        .find(|path| inventory.files.contains_key(path))
}

fn rust_module_dir(name: &str) -> std::path::PathBuf {
    let path = Path::new(name);
    let parent = path.parent().unwrap_or(Path::new(""));
    if matches!(
        path.file_stem().and_then(|stem| stem.to_str()),
        Some("lib" | "main" | "mod")
    ) {
        parent.to_path_buf()
    } else {
        parent.join(path.file_stem().unwrap_or_default())
    }
}

fn normalize(path: &Path) -> Option<String> {
    let mut parts = Vec::new();
    for part in path.components() {
        match part {
            std::path::Component::Normal(value) => parts.push(value.to_string_lossy().into_owned()),
            std::path::Component::ParentDir => {
                parts.pop()?;
            }
            std::path::Component::CurDir => {}
            _ => return None,
        }
    }
    Some(parts.join("/"))
}
