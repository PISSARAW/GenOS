use std::fs;
use std::path::Path;
use serde_json::json;
pub(crate) fn extract_action_signature(val: &serde_json::Value) -> String {
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

pub(crate) fn calculate_jaccard_similarity(a: &str, b: &str) -> f64 {
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

pub struct LoopFinding {
    pub detected: bool,
    pub kind: &'static str,
    pub reason: String,
}

impl LoopFinding {
    pub fn none() -> Self {
        Self { detected: false, kind: "NONE", reason: "No loop detected".to_string() }
    }
}

pub struct LoopParams {
    pub exact_thresh: usize,
    pub stag_thresh: usize,
    pub similarity: f64,
}

pub fn report_missing_file(cmd: &crate::args::LoopDetectionCmd) -> Result<(), String> {
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
    Ok(())
}

fn push_line_action(actions: &mut Vec<String>, line: &str) {
    let trimmed = line.trim();
    match trimmed.is_empty() {
        true => {},
        false => match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(val) => actions.push(extract_action_signature(&val)),
            Err(_) => actions.push(trimmed.to_string()),
        },
    }
}

pub fn parse_actions(content: &str) -> Vec<String> {
    let mut actions: Vec<String> = Vec::new();
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(serde_json::Value::Array(arr)) => {
            for item in arr {
                actions.push(extract_action_signature(&item));
            }
        }
        _ => {
            for line in content.lines() {
                push_line_action(&mut actions, line);
            }
        }
    }
    actions
}

pub fn load_actions(path: &Path) -> Result<Vec<String>, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(parse_actions(&content)),
        Err(e) => Err(format!("Failed to read history file: {}", e)),
    }
}

fn consecutive_tail_count(actions: &[String]) -> (String, usize) {
    match actions.last() {
        None => (String::new(), 0),
        Some(last) => {
            let mut consecutive = 0usize;
            for action in actions.iter().rev() {
                match action == last {
                    true => consecutive += 1,
                    false => break,
                }
            }
            (last.clone(), consecutive)
        }
    }
}

fn check_exact(actions: &[String], exact_thresh: usize) -> Option<LoopFinding> {
    match actions.len() >= exact_thresh {
        false => None,
        true => {
            let (last, consecutive) = consecutive_tail_count(actions);
            match consecutive >= exact_thresh {
                false => None,
                true => Some(LoopFinding {
                    detected: true,
                    kind: "EXACT_MATCH_REPETITION",
                    reason: format!("Action '{}' repeated {} consecutive times (threshold: {})", last, consecutive, exact_thresh),
                }),
            }
        }
    }
}

fn slice_matches_period(slice: &[String], period: usize) -> bool {
    let mut matches = 0usize;
    let mut comps = 0usize;
    for i in period..slice.len() {
        comps += 1;
        match slice[i] == slice[i - period] {
            true => matches += 1,
            false => {},
        }
    }
    match comps >= period {
        false => false,
        true => matches == comps,
    }
}

fn check_period_for(actions: &[String], period: usize, exact_thresh: usize) -> Option<LoopFinding> {
    match actions.len() >= period * 2 {
        false => None,
        true => {
            let check_len = (period * exact_thresh).min(actions.len());
            let slice = &actions[actions.len() - check_len..];
            match slice_matches_period(slice, period) {
                false => None,
                true => Some(LoopFinding {
                    detected: true,
                    kind: "PERIODIC_CYCLE",
                    reason: format!("Periodic cycle of period {} detected across {} actions", period, check_len),
                }),
            }
        }
    }
}

fn check_periodic(actions: &[String], exact_thresh: usize) -> Option<LoopFinding> {
    match check_period_for(actions, 2, exact_thresh) {
        Some(f) => Some(f),
        None => check_period_for(actions, 3, exact_thresh),
    }
}

fn count_window_hits(window: &[String], stag_thresh: usize) -> Option<(String, usize)> {
    let mut counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for act in window {
        *counts.entry(act.as_str()).or_insert(0) += 1;
    }
    for (act, count) in counts {
        match count >= stag_thresh {
            true => return Some((act.to_string(), count)),
            false => {},
        }
    }
    None
}

fn check_stagnation(actions: &[String], stag_thresh: usize) -> Option<LoopFinding> {
    match actions.len() >= stag_thresh {
        false => None,
        true => {
            let window_size = (stag_thresh + 2).min(actions.len());
            let window = &actions[actions.len() - window_size..];
            match count_window_hits(window, stag_thresh) {
                None => None,
                Some((act, count)) => Some(LoopFinding {
                    detected: true,
                    kind: "STAGNATION",
                    reason: format!("Action '{}' appeared {} times in last {} steps (threshold: {})", act, count, window_size, stag_thresh),
                }),
            }
        }
    }
}

fn window_all_similar(window: &[String], threshold: f64) -> bool {
    for i in 1..window.len() {
        let sim = calculate_jaccard_similarity(&window[i - 1], &window[i]);
        match sim < threshold {
            true => return false,
            false => {},
        }
    }
    true
}

fn check_similarity(actions: &[String], exact_thresh: usize, threshold: f64) -> Option<LoopFinding> {
    match actions.len() >= exact_thresh {
        false => None,
        true => match threshold > 0.0 {
            false => None,
            true => {
                let window = &actions[actions.len() - exact_thresh..];
                match window_all_similar(window, threshold) {
                    false => None,
                    true => Some(LoopFinding {
                        detected: true,
                        kind: "HIGH_SIMILARITY",
                        reason: format!("Consecutive actions exceeded similarity threshold {:.2} over {} steps", threshold, exact_thresh),
                    }),
                }
            }
        },
    }
}

pub fn detect_loop(actions: &[String], params: &LoopParams) -> LoopFinding {
    match check_exact(actions, params.exact_thresh) {
        Some(f) => return f,
        None => {},
    }
    match check_periodic(actions, params.exact_thresh) {
        Some(f) => return f,
        None => {},
    }
    match check_stagnation(actions, params.stag_thresh) {
        Some(f) => return f,
        None => {},
    }
    match check_similarity(actions, params.exact_thresh, params.similarity) {
        Some(f) => return f,
        None => {},
    }
    LoopFinding::none()
}

pub fn report_loop_result(cmd: &crate::args::LoopDetectionCmd, actions: &[String], finding: &LoopFinding) -> Result<(), String> {
    let recommendation = match finding.detected {
        true => "BREAK_LOOP_OR_HALT",
        false => "PROCEED",
    };
    let output = json!({
        "history_file": cmd.history_file,
        "file_exists": true,
        "total_actions": actions.len(),
        "exact_match_threshold": cmd.exact_match,
        "stagnation_threshold": cmd.stagnation,
        "similarity_threshold": cmd.similarity,
        "loop_detected": finding.detected,
        "loop_type": finding.kind,
        "reason": finding.reason,
        "recommendation": recommendation
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}
