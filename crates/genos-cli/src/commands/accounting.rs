use std::fs;
use std::path::{Path, PathBuf};
use serde_json::json;

pub fn handle_cost_accounting(agent_id: &str, timeframe: Option<&str>) -> Result<(), String> {
    let tf = timeframe.unwrap_or("all");
    let (prompt_tokens, completion_tokens) = compute_agent_tokens(agent_id, timeframe)?;
    let total_tokens = prompt_tokens + completion_tokens;
    let cost_usd = (prompt_tokens as f64 * 0.0000015) + (completion_tokens as f64 * 0.000002);
    let rounded_cost = (cost_usd * 10000.0).round() / 10000.0;

    println!("{}", json!({
        "operation": "cost_accounting",
        "agent_id": agent_id,
        "timeframe": tf,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "total_cost_usd": rounded_cost,
        "currency": "USD",
        "status": "CALCULATED"
    }));
    Ok(())
}

fn parse_timeframe_seconds(timeframe: Option<&str>) -> Option<i64> {
    match timeframe {
        Some("1h") => Some(3600),
        Some("24h") | Some("1d") => Some(86400),
        Some("7d") => Some(7 * 86400),
        Some("30d") => Some(30 * 86400),
        Some("all") | None => None,
        Some(custom) => {
            if let Some(h) = custom.strip_suffix('h') {
                h.parse::<i64>().ok().map(|v| v * 3600)
            } else if let Some(d) = custom.strip_suffix('d') {
                d.parse::<i64>().ok().map(|v| v * 86400)
            } else if let Some(m) = custom.strip_suffix('m') {
                m.parse::<i64>().ok().map(|v| v * 60)
            } else {
                None
            }
        }
    }
}

fn parse_turn_timestamp(turn: &serde_json::Value) -> Option<i64> {
    if let Some(ts) = turn.get("timestamp").and_then(|v| v.as_i64()) {
        return Some(if ts > 1_000_000_000_000 { ts / 1000 } else { ts });
    }
    if let Some(s) = turn.get("created_at").and_then(|v| v.as_str()) {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
            return Some(dt.timestamp());
        }
    }
    None
}

pub fn compute_agent_tokens(agent_id: &str, timeframe: Option<&str>) -> Result<(usize, usize), String> {
    let trajectory_path = PathBuf::from(format!(".genos/trajectories/{}.json", agent_id));
    if !trajectory_path.exists() {
        return Err(format!("Trajectory file not found for agent '{}' at {}", agent_id, trajectory_path.display()));
    }

    let content = fs::read_to_string(&trajectory_path)
        .map_err(|e| format!("Failed to read trajectory for agent '{}': {}", agent_id, e))?;

    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Malformed trajectory JSON for agent '{}': {}", agent_id, e))?;

    let max_age_seconds = parse_timeframe_seconds(timeframe);
    let now = chrono::Utc::now().timestamp();

    // If turns are present, filter and sum turn-level tokens
    if let Some(turns) = parsed.get("turns").and_then(|t| t.as_array()) {
        let mut prompt_sum = 0usize;
        let mut completion_sum = 0usize;

        for turn in turns {
            if let Some(limit) = max_age_seconds {
                if let Some(ts) = parse_turn_timestamp(turn) {
                    if now - ts > limit {
                        continue;
                    }
                }
            }

            let turn_prompt = turn.get("prompt_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or_else(|| {
                    turn.get("detail")
                        .or_else(|| turn.get("cmd"))
                        .and_then(|v| v.as_str())
                        .map(|s| (s.len() + 3) / 4)
                        .unwrap_or(0)
                });

            let turn_completion = turn.get("completion_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or_else(|| {
                    turn.get("action")
                        .and_then(|v| v.as_str())
                        .map(|s| (s.len() + 3) / 4)
                        .unwrap_or(0)
                });

            prompt_sum += turn_prompt;
            completion_sum += turn_completion;
        }

        if prompt_sum > 0 || completion_sum > 0 {
            return Ok((prompt_sum, completion_sum));
        }
    }

    // Otherwise check top-level usage / metrics
    if let Some(usage) = parsed.get("usage") {
        let p = usage.get("prompt_tokens").or_else(|| usage.get("input_tokens")).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let c = usage.get("completion_tokens").or_else(|| usage.get("output_tokens")).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        if p > 0 || c > 0 {
            return Ok((p, c));
        }
    }

    if let Some(metrics) = parsed.get("metrics").and_then(|m| m.get("tokens")) {
        let p = metrics.get("prompt").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let c = metrics.get("completion").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        if p > 0 || c > 0 {
            return Ok((p, c));
        }
    }

    // Default to character length estimation if no turns or usage fields exist
    let char_count = content.len();
    let prompt = (char_count / 4).max(1);
    let completion = (prompt / 3).max(1);
    Ok((prompt, completion))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cost_accounting_missing_trajectory() {
        let res = handle_cost_accounting("non-existent-agent-9999", None);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Trajectory file not found"));
    }

    #[test]
    fn test_cost_accounting_real_tokens() {
        let test_dir = Path::new(".genos/trajectories");
        let _ = fs::create_dir_all(test_dir);
        let test_file = test_dir.join("test-agent-cost.json");

        let trajectory_data = json!({
            "agent_id": "test-agent-cost",
            "usage": {
                "prompt_tokens": 1500,
                "completion_tokens": 500
            }
        });
        fs::write(&test_file, serde_json::to_string(&trajectory_data).unwrap()).unwrap();

        let tokens = compute_agent_tokens("test-agent-cost", None);
        assert!(tokens.is_ok());
        let (prompt, completion) = tokens.unwrap();
        assert_eq!(prompt, 1500);
        assert_eq!(completion, 500);

        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_cost_accounting_timeframe_filtering() {
        let test_dir = Path::new(".genos/trajectories");
        let _ = fs::create_dir_all(test_dir);
        let test_file = test_dir.join("test-agent-timeframe.json");

        let now = chrono::Utc::now().timestamp();
        let old_ts = now - 7200; // 2 hours ago

        let trajectory_data = json!({
            "agent_id": "test-agent-timeframe",
            "turns": [
                {
                    "step": 1,
                    "timestamp": old_ts,
                    "prompt_tokens": 100,
                    "completion_tokens": 50
                },
                {
                    "step": 2,
                    "timestamp": now - 60, // 1 minute ago
                    "prompt_tokens": 200,
                    "completion_tokens": 100
                }
            ]
        });
        fs::write(&test_file, serde_json::to_string(&trajectory_data).unwrap()).unwrap();

        // 1 hour window: should only include step 2
        let tokens_1h = compute_agent_tokens("test-agent-timeframe", Some("1h")).unwrap();
        assert_eq!(tokens_1h, (200, 100));

        // All window: should include both steps
        let tokens_all = compute_agent_tokens("test-agent-timeframe", Some("all")).unwrap();
        assert_eq!(tokens_all, (300, 150));

        let _ = fs::remove_file(test_file);
    }
}
