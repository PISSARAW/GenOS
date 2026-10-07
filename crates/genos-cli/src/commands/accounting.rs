use std::fs;
use std::path::PathBuf;
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

fn env_root(name: &str) -> Option<PathBuf> {
    match std::env::var(name) {
        Ok(value) => Some(PathBuf::from(value)),
        Err(_) => None,
    }
}

fn parent_root() -> Option<PathBuf> {
    match std::env::current_dir() {
        Ok(current) => match current.parent() {
            Some(parent) => Some(parent.to_path_buf()),
            None => None,
        },
        Err(_) => None,
    }
}

fn find_trajectory(agent_id: &str) -> Option<PathBuf> {
    let candidates = [
        env_root("GENOS_WORKSPACE_ROOT"),
        env_root("GENOS_ROOT"),
        Some(PathBuf::from(".")),
        parent_root(),
    ];
    for cand in candidates.into_iter().flatten() {
        let p = cand.join(".genos").join("trajectories").join(format!("{}.json", agent_id));
        if p.exists() {
            return Some(p);
        }
    }
    None
}

fn load_trajectory(path: &std::path::Path, agent_id: &str) -> Result<(serde_json::Value, String), String> {
    match fs::read_to_string(path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(parsed) => Ok((parsed, content)),
            Err(e) => Err(format!("Malformed trajectory JSON for agent '{}': {}", agent_id, e)),
        },
        Err(e) => Err(format!("Failed to read trajectory for agent '{}': {}", agent_id, e)),
    }
}

fn str_len_quarter(value: &serde_json::Value) -> usize {
    match value.as_str() {
        Some(s) => (s.len() + 3) / 4,
        None => 0,
    }
}

fn detail_len(turn: &serde_json::Value, primary: &str, fallback: &str) -> usize {
    match turn.get(primary) {
        Some(v) => {
            let n = str_len_quarter(v);
            if n > 0 {
                return n;
            }
            match turn.get(fallback) {
                Some(w) => str_len_quarter(w),
                None => 0,
            }
        }
        None => match turn.get(fallback) {
            Some(w) => str_len_quarter(w),
            None => 0,
        },
    }
}

fn turn_prompt_tokens(turn: &serde_json::Value) -> usize {
    match turn.get("prompt_tokens") {
        Some(v) => match v.as_u64() {
            Some(n) => n as usize,
            None => detail_len(turn, "detail", "cmd"),
        },
        None => detail_len(turn, "detail", "cmd"),
    }
}

fn turn_completion_tokens(turn: &serde_json::Value) -> usize {
    match turn.get("completion_tokens") {
        Some(v) => match v.as_u64() {
            Some(n) => n as usize,
            None => detail_len(turn, "action", "output"),
        },
        None => detail_len(turn, "action", "output"),
    }
}

fn turn_in_window(turn: &serde_json::Value, max_age: Option<i64>, now: i64) -> bool {
    match max_age {
        None => true,
        Some(limit) => match parse_turn_timestamp(turn) {
            None => true,
            Some(ts) => now - ts <= limit,
        },
    }
}

fn sum_turn_tokens(turns: &[serde_json::Value], max_age: Option<i64>, now: i64) -> (usize, usize) {
    let mut prompt_sum = 0usize;
    let mut completion_sum = 0usize;
    for turn in turns {
        if turn_in_window(turn, max_age, now) {
            prompt_sum += turn_prompt_tokens(turn);
            completion_sum += turn_completion_tokens(turn);
        }
    }
    (prompt_sum, completion_sum)
}

fn u64_field(obj: &serde_json::Value, key: &str) -> u64 {
    match obj.get(key) {
        Some(v) => match v.as_u64() {
            Some(n) => n,
            None => 0,
        },
        None => 0,
    }
}

fn usage_tokens(parsed: &serde_json::Value) -> Option<(usize, usize)> {
    match parsed.get("usage") {
        None => None,
        Some(usage) => {
            let p = u64_field(usage, "prompt_tokens") + u64_field(usage, "input_tokens");
            let c = u64_field(usage, "completion_tokens") + u64_field(usage, "output_tokens");
            if p > 0 {
                return Some((p as usize, c as usize));
            }
            if c > 0 {
                return Some((p as usize, c as usize));
            }
            None
        }
    }
}

fn metrics_tokens(parsed: &serde_json::Value) -> Option<(usize, usize)> {
    match parsed.get("metrics") {
        None => None,
        Some(metrics) => match metrics.get("tokens") {
            None => None,
            Some(tokens) => {
                let p = u64_field(tokens, "prompt");
                let c = u64_field(tokens, "completion");
                if p > 0 {
                    return Some((p as usize, c as usize));
                }
                if c > 0 {
                    return Some((p as usize, c as usize));
                }
                None
            }
        },
    }
}

fn estimate_tokens(content: &str) -> (usize, usize) {
    let prompt = (content.len() / 4).max(1);
    let completion = (prompt / 3).max(1);
    (prompt, completion)
}

fn turns_tokens(parsed: &serde_json::Value, max_age: Option<i64>, now: i64) -> Option<(usize, usize)> {
    match parsed.get("turns") {
        None => None,
        Some(t) => match t.as_array() {
            None => None,
            Some(arr) => {
                let (p, c) = sum_turn_tokens(arr, max_age, now);
                if p > 0 {
                    return Some((p, c));
                }
                if c > 0 {
                    return Some((p, c));
                }
                None
            }
        },
    }
}

pub fn compute_agent_tokens(agent_id: &str, timeframe: Option<&str>) -> Result<(usize, usize), String> {
    let trajectory_path = match find_trajectory(agent_id) {
        Some(p) => p,
        None => return Err(format!("Trajectory file not found for agent '{}' at .genos/trajectories/{}.json", agent_id, agent_id)),
    };
    let (parsed, content) = match load_trajectory(&trajectory_path, agent_id) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let max_age_seconds = parse_timeframe_seconds(timeframe);
    let now = chrono::Utc::now().timestamp();
    match turns_tokens(&parsed, max_age_seconds, now) {
        Some(v) => return Ok(v),
        None => {},
    }
    match usage_tokens(&parsed) {
        Some(v) => return Ok(v),
        None => {},
    }
    match metrics_tokens(&parsed) {
        Some(v) => return Ok(v),
        None => {},
    }
    Ok(estimate_tokens(&content))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

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
