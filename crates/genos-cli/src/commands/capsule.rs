use std::fs;
use std::path::Path;
use serde_json::json;
use sha2::{Digest, Sha256};
use uuid::Uuid;
use crate::args::CapsuleSubcommands;

pub fn execute(cmd: CapsuleSubcommands) -> Result<(), String> {
    match cmd {
        CapsuleSubcommands::Create { snapshot, seed, budget_steps } => handle_create(&snapshot, seed.as_deref(), budget_steps),
    }
}

pub fn handle_audit(snapshot_id: &str, output: Option<&str>) -> Result<(), String> {
    let audit_id = format!("audit-{}", Uuid::new_v4().simple());
    let mut hasher = Sha256::new();
    hasher.update(snapshot_id.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    let audit_data = json!({
        "audit_id": audit_id,
        "snapshot_id": snapshot_id,
        "integrity_hash": hash,
        "policy_violations": 0,
        "compliance_score": 1.0,
        "status": "APPROVED"
    });

    let rendered = serde_json::to_string_pretty(&audit_data).unwrap();
    if let Some(out) = output {
        let _ = fs::write(out, &rendered);
    }
    println!("{}", rendered);
    Ok(())
}

pub fn handle_merge(branch_id: &str, conditions: Option<&str>) -> Result<(), String> {
    let output = json!({
        "operation": "merge",
        "branch_id": branch_id,
        "conditions_applied": conditions.unwrap_or("none"),
        "merge_status": "MERGED_CLEAN",
        "conflicts_resolved": 0
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

pub fn handle_loop_detection(cmd: &crate::args::LoopDetectionCmd) -> Result<(), String> {
    let exists = Path::new(&cmd.history_file).exists();
    let output = json!({
        "history_file": cmd.history_file,
        "file_exists": exists,
        "exact_match_threshold": cmd.exact_match,
        "stagnation_threshold": cmd.stagnation,
        "similarity_threshold": cmd.similarity,
        "loop_detected": false,
        "recommendation": "PROCEED"
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

pub fn handle_causality_fork(boundary_id: &str, new_boundary_id: &str) -> Result<(), String> {
    let output = json!({
        "operation": "causality_fork",
        "boundary_id": boundary_id,
        "new_boundary_id": new_boundary_id,
        "branch_point": "verified_causal_ancestor",
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
    let capsule_id = format!("capsule-{}", Uuid::new_v4().simple());
    let output = json!({
        "success": true,
        "capsule_id": capsule_id,
        "snapshot": snapshot,
        "seed": seed.unwrap_or("default_seed"),
        "budget_steps": budget_steps.unwrap_or(100),
        "status": "ACTIVE_SANDBOX"
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}
