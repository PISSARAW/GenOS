use std::fs;
use std::path::Path;
use serde_json::json;
use uuid::Uuid;
use crate::args::CapsuleSubcommands;

pub fn execute(cmd: CapsuleSubcommands) -> Result<(), String> {
    match cmd {
        CapsuleSubcommands::Create { snapshot, seed, budget_steps } => handle_create(&snapshot, seed.as_deref(), budget_steps),
    }
}

pub fn handle_audit(snapshot_id: &str, output: Option<&str>) -> Result<(), String> {
    let audit_id = format!("audit-{}", Uuid::new_v4().simple());
    let capsule_dir = crate::commands::root_resolver::resolve_matrix_root().join("capsules");
    let capsule_file = capsule_dir.join(format!("{}.json", snapshot_id));

    if !capsule_file.exists() {
        return Err(format!("Capsule not found for snapshot: {}", snapshot_id));
    }

    let (hash, compliance_score, status) = if capsule_file.exists() {
        if let Ok(content) = fs::read_to_string(&capsule_file) {
            if let Ok(capsule) = serde_json::from_str::<genos_store::Capsule>(&content) {
                let verified = capsule.verify();
                let score = if verified { 1.0 } else { 0.0 };
                let st = if verified { "APPROVED" } else { "TAMPERED" };
                (capsule.hash, score, st)
            } else {
                ("corrupt".into(), 0.0, "CORRUPT")
            }
        } else {
            ("unreadable".into(), 0.0, "ERROR")
        }
    } else {
        unreachable!("capsule existence was checked above");
    };

    let audit_data = json!({
        "audit_id": audit_id,
        "snapshot_id": snapshot_id,
        "integrity_hash": hash,
        "policy_violations": if compliance_score < 1.0 { 1 } else { 0 },
        "compliance_score": compliance_score,
        "status": status
    });

    let rendered = serde_json::to_string_pretty(&audit_data).unwrap();
    if let Some(out) = output {
        let _ = fs::write(out, &rendered);
    }
    println!("{}", rendered);
    Ok(())
}

pub fn handle_merge(branch_id: &str, conditions: Option<&str>) -> Result<(), String> {
    Err(format!(
        "Merge is unavailable: branch '{}' was not persisted or merged{}.",
        branch_id,
        conditions.map(|value| format!(" (conditions: {})", value)).unwrap_or_default()
    ))
}

fn extract_action_signature(val: &serde_json::Value) -> String {
    match val {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Object(map) => {
            for key in &["action", "type", "command", "tool", "name", "step"] {
                if let Some(serde_json::Value::String(s)) = map.get(*key) {
                    return s.clone();
                }
            }
            if let Some(cmd) = map.get("payload").and_then(|p| p.get("command")).and_then(|c| c.as_str()) {
                return cmd.to_string();
            }
            serde_json::to_string(val).unwrap_or_default()
        }
        _ => serde_json::to_string(val).unwrap_or_default(),
    }
}

fn calculate_jaccard_similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    let a_tokens: std::collections::HashSet<&str> = a.split_whitespace().collect();
    let b_tokens: std::collections::HashSet<&str> = b.split_whitespace().collect();
    if a_tokens.is_empty() && b_tokens.is_empty() {
        return 1.0;
    }
    let intersection = a_tokens.intersection(&b_tokens).count();
    let union = a_tokens.union(&b_tokens).count();
    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

pub fn handle_loop_detection(cmd: &crate::args::LoopDetectionCmd) -> Result<(), String> {
    let path = Path::new(&cmd.history_file);
    let exists = path.exists();
    if !exists {
        let output = json!({
            "history_file": cmd.history_file,
            "file_exists": false,
            "exact_match_threshold": cmd.exact_match,
            "stagnation_threshold": cmd.stagnation,
            "similarity_threshold": cmd.similarity,
            "loop_detected": false,
            "recommendation": "FILE_NOT_FOUND"
        });
        println!("{}", serde_json::to_string_pretty(&output).unwrap());
        return Ok(());
    }

    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read history file: {}", e))?;
    let mut actions: Vec<String> = Vec::new();

    // 1. Try JSON array
    if let Ok(serde_json::Value::Array(arr)) = serde_json::from_str::<serde_json::Value>(&content) {
        for item in arr {
            actions.push(extract_action_signature(&item));
        }
    } else {
        // 2. Try line by line (JSONL or plain text)
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                actions.push(extract_action_signature(&val));
            } else {
                actions.push(trimmed.to_string());
            }
        }
    }

    let mut loop_detected = false;
    let mut loop_type = "NONE";
    let mut reason = "No loop detected".to_string();

    let n = actions.len();
    let exact_thresh = cmd.exact_match.max(2);
    let stag_thresh = cmd.stagnation.max(3);

    // Check 1: Consecutive exact match repetition
    if n >= exact_thresh {
        let last_action = &actions[n - 1];
        let mut consecutive = 0;
        for action in actions.iter().rev() {
            if action == last_action {
                consecutive += 1;
            } else {
                break;
            }
        }
        if consecutive >= exact_thresh {
            loop_detected = true;
            loop_type = "EXACT_MATCH_REPETITION";
            reason = format!("Action '{}' repeated {} consecutive times (threshold: {})", last_action, consecutive, exact_thresh);
        }
    }

    // Check 2: Periodic alternating cycles (period 2 or 3)
    if !loop_detected {
        for period in [2, 3] {
            if n >= period * 2 {
                let check_len = (period * exact_thresh).min(n);
                let slice = &actions[n - check_len..];
                let mut matches = 0;
                let mut comps = 0;
                for i in period..slice.len() {
                    comps += 1;
                    if slice[i] == slice[i - period] {
                        matches += 1;
                    }
                }
                if comps >= period && matches == comps {
                    loop_detected = true;
                    loop_type = "PERIODIC_CYCLE";
                    reason = format!("Periodic cycle of period {} detected across {} actions", period, check_len);
                    break;
                }
            }
        }
    }

    // Check 3: Stagnation within recent window
    if !loop_detected && n >= stag_thresh {
        let window_size = (stag_thresh + 2).min(n);
        let window = &actions[n - window_size..];
        let mut counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for act in window {
            *counts.entry(act.as_str()).or_insert(0) += 1;
        }
        for (act, count) in counts {
            if count >= stag_thresh {
                loop_detected = true;
                loop_type = "STAGNATION";
                reason = format!("Action '{}' appeared {} times in last {} steps (threshold: {})", act, count, window_size, stag_thresh);
                break;
            }
        }
    }

    // Check 4: High similarity repetition
    if !loop_detected && n >= exact_thresh && cmd.similarity > 0.0 {
        let window = &actions[n - exact_thresh..];
        let mut all_similar = true;
        for i in 1..window.len() {
            let sim = calculate_jaccard_similarity(&window[i - 1], &window[i]);
            if sim < cmd.similarity {
                all_similar = false;
                break;
            }
        }
        if all_similar {
            loop_detected = true;
            loop_type = "HIGH_SIMILARITY";
            reason = format!("Consecutive actions exceeded similarity threshold {:.2} over {} steps", cmd.similarity, exact_thresh);
        }
    }

    let recommendation = if loop_detected {
        "BREAK_LOOP_OR_HALT"
    } else {
        "PROCEED"
    };

    let output = json!({
        "history_file": cmd.history_file,
        "file_exists": true,
        "total_actions": n,
        "exact_match_threshold": cmd.exact_match,
        "stagnation_threshold": cmd.stagnation,
        "similarity_threshold": cmd.similarity,
        "loop_detected": loop_detected,
        "loop_type": loop_type,
        "reason": reason,
        "recommendation": recommendation
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

pub fn handle_causality_fork(boundary_id: &str, new_boundary_id: &str) -> Result<(), String> {
    Err(format!(
        "Causal fork is unavailable: boundary '{}' cannot be persisted as '{}'.",
        boundary_id, new_boundary_id
    ))
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
    let _ = fs::create_dir_all(&capsule_dir);
    let path = capsule_dir.join(format!("{}.json", capsule.capsule_id));
    let _ = fs::write(&path, serde_json::to_string_pretty(&capsule).unwrap());

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
