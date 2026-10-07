use std::fs;
use std::path::Path;
use serde_json::json;
use crate::args::CapsuleSubcommands;

pub fn execute(cmd: CapsuleSubcommands) -> Result<(), String> {
    match cmd {
        CapsuleSubcommands::Create { snapshot, seed, budget_steps } => handle_create(&snapshot, seed.as_deref(), budget_steps),
    }
}

pub fn handle_audit(snapshot_id: &str, output: Option<&str>, opts: &super::output_guard::WriteOptions) -> Result<(), String> {
    let req = super::capsule_audit::AuditRequest { snapshot_id, output, force: opts.force, parents: opts.parents };
    super::capsule_audit::handle_audit(&req)
}

pub fn handle_merge(_branch_id: &str, _conditions: Option<&str>) -> Result<(), String> {
    Err("Merge not implemented: capsule metadata cannot prove branch invariants or authorize promotion.".into())
}

pub fn handle_loop_detection(cmd: &crate::args::LoopDetectionCmd) -> Result<(), String> {
    let path = Path::new(&cmd.history_file);
    match path.exists() {
        false => return super::capsule_loop::report_missing_file(cmd),
        true => {},
    }
    let actions = match super::capsule_loop::load_actions(path) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let params = super::capsule_loop::LoopParams {
        exact_thresh: cmd.exact_match.max(2),
        stag_thresh: cmd.stagnation.max(3),
        similarity: cmd.similarity,
    };
    let finding = super::capsule_loop::detect_loop(&actions, &params);
    super::capsule_loop::report_loop_result(cmd, &actions, &finding)
}

pub fn handle_causality_fork(boundary_id: &str, new_boundary_id: &str) -> Result<(), String> {
    let capsule_dir = crate::commands::root_resolver::resolve_matrix_root().join("capsules");
    let _ = fs::create_dir_all(&capsule_dir);

    let mut payload = json!({
        "parent_boundary": boundary_id,
        "fork_timestamp": chrono::Utc::now().to_rfc3339()
    });

    if let Ok(entries) = fs::read_dir(&capsule_dir) {
        for entry in entries.flatten() {
            if let Ok(content) = fs::read_to_string(entry.path()) {
                if let Ok(capsule) = serde_json::from_str::<genos_store::Capsule>(&content) {
                    if capsule.boundary_id == boundary_id {
                        payload = capsule.data.clone();
                        break;
                    }
                }
            }
        }
    }

    let forked_capsule = genos_store::Capsule::create(new_boundary_id, payload);
    let path = capsule_dir.join(format!("{}.json", forked_capsule.capsule_id));
    fs::write(&path, serde_json::to_string_pretty(&forked_capsule).unwrap())
        .map_err(|e| format!("Failed to write forked capsule at '{}': {}", path.display(), e))?;

    let output = json!({
        "success": true,
        "boundary_id": boundary_id,
        "new_boundary_id": new_boundary_id,
        "capsule_id": forked_capsule.capsule_id.to_string(),
        "hash": forked_capsule.hash,
        "status": "FORKED"
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

pub struct PhenotypeValues {
    pub expected: f64,
    pub observed: f64,
    pub tolerance: f64,
}

pub fn handle_phenotype_measure(trait_name: &str, values: PhenotypeValues) -> Result<(), String> {
    let expected = values.expected;
    let observed = values.observed;
    let tolerance = values.tolerance;
    let divergence = (expected - observed).abs();
    let within_tolerance = divergence <= tolerance;
    let output = json!({
        "trait_name": trait_name,
        "expected": expected,
        "observed": observed,
        "tolerance": tolerance,
        "divergence": divergence,
        "pass": within_tolerance
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

fn handle_create(snapshot: &str, seed: Option<&str>, budget_steps: Option<u32>) -> Result<(), String> {
    let payload = if Path::new(snapshot).exists() {
        let content = fs::read_to_string(snapshot).unwrap_or_else(|_| "{}".into());
        serde_json::from_str(&content).unwrap_or(json!({ "raw": content }))
    } else if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(snapshot) {
        parsed
    } else {
        json!({
            "snapshot_ref": snapshot,
            "seed": seed.unwrap_or("default_seed"),
            "budget_steps": budget_steps.unwrap_or(100)
        })
    };

    let capsule = genos_store::Capsule::create("sandbox_boundary", payload);
    let verified = capsule.verify();

    let capsule_dir = crate::commands::root_resolver::resolve_matrix_root().join("capsules");
    fs::create_dir_all(&capsule_dir)
        .map_err(|error| format!("Failed to create capsule directory '{}': {}", capsule_dir.display(), error))?;
    let path = capsule_dir.join(format!("{}.json", capsule.capsule_id));
    let serialized = serde_json::to_string_pretty(&capsule)
        .map_err(|error| format!("Failed to serialize capsule: {}", error))?;
    fs::write(&path, serialized)
        .map_err(|error| format!("Failed to write capsule '{}': {}", path.display(), error))?;

    let output = json!({
        "success": true,
        "capsule_id": capsule.capsule_id.to_string(),
        "hash": capsule.hash,
        "verified": verified,
        "snapshot": snapshot,
        "seed": seed.unwrap_or("default_seed"),
        "budget_steps": budget_steps.unwrap_or(100),
        "status": "ACTIVE_SANDBOX"
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}
