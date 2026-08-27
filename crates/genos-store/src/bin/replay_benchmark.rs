use chrono::{TimeZone, Utc};
use genos_core::{AgentEvent, AgentEventType, AgentId, BranchId, CorrelationId, EventId};
use genos_store::fingerprint_replay;
use serde::Serialize;
use serde_json::json;
use std::env;
use std::process::Command;
use std::time::Instant;

#[derive(Debug, Serialize)]
struct BenchmarkReport {
    benchmark: &'static str,
    iterations: usize,
    warmups: usize,
    events_per_run: usize,
    event_input_bytes: usize,
    durations_ns: DurationSummary,
    replay_fingerprint: String,
    platform: PlatformMetadata,
    repository_revision: String,
    command_line: Vec<String>,
}

#[derive(Debug, Serialize)]
struct DurationSummary {
    p50: u128,
    p95: u128,
    p99: u128,
    mean: f64,
    stddev: f64,
    min: u128,
    max: u128,
}

#[derive(Debug, Serialize)]
struct PlatformMetadata {
    os: &'static str,
    arch: &'static str,
    rustc: String,
    hostname: String,
}

fn main() -> anyhow::Result<()> {
    let iterations = argument("--iterations", 500)?;
    let event_count = argument("--events", 100)?;
    let warmups = argument("--warmups", 20)?;
    if iterations == 0 || event_count == 0 {
        anyhow::bail!("--iterations and --events must be greater than zero");
    }

    let events = make_events(event_count);
    let event_input_bytes = serde_json::to_vec(&events)?.len();
    let expected = fingerprint_replay(&events)?;

    for _ in 0..warmups {
        std::hint::black_box(fingerprint_replay(&events)?);
    }

    let mut durations = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let started = Instant::now();
        let actual = fingerprint_replay(&events)?;
        let elapsed = started.elapsed().as_nanos();
        anyhow::ensure!(
            actual == expected,
            "replay fingerprint changed during benchmark"
        );
        durations.push(elapsed);
    }

    let summary = summarize(&mut durations);
    let report = BenchmarkReport {
        benchmark: "genos-store.replay_fingerprint",
        iterations,
        warmups,
        events_per_run: event_count,
        event_input_bytes,
        durations_ns: summary,
        replay_fingerprint: expected.final_state_hash,
        platform: PlatformMetadata {
            os: env::consts::OS,
            arch: env::consts::ARCH,
            rustc: rustc_version(),
            hostname: env::var("HOSTNAME").unwrap_or_else(|_| "unknown".to_string()),
        },
        repository_revision: git_revision(),
        command_line: env::args().collect(),
    };

    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

fn argument(name: &str, default: usize) -> anyhow::Result<usize> {
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == name {
            let value = args
                .next()
                .ok_or_else(|| anyhow::anyhow!("{name} requires a value"))?;
            return Ok(value.parse()?);
        }
    }
    Ok(default)
}

fn make_events(count: usize) -> Vec<AgentEvent> {
    let agent_id = AgentId::new();
    let branch_id = BranchId("benchmark-branch".to_string());
    let correlation_id = CorrelationId::new();
    let timestamp = Utc.timestamp_opt(1_700_000_000, 0).single().unwrap();

    (1..=count)
        .map(|sequence| AgentEvent {
            cost_schema: None,
            event_id: EventId(format!("benchmark-event-{sequence:06}")),
            agent_id: agent_id.clone(),
            branch_id: Some(branch_id.clone()),
            sequence: sequence as u64,
            timestamp,
            event_type: match sequence % 4 {
                0 => AgentEventType::ModelResponded,
                1 => AgentEventType::AgentStep,
                2 => AgentEventType::MemoryUpdated,
                _ => AgentEventType::ToolCompleted,
            },
            payload: json!({
                "sequence": sequence,
                "key": "benchmark",
                "value": sequence.to_string()
            }),
            causation_id: None,
            correlation_id: Some(correlation_id.clone()),
        })
        .collect()
}

fn summarize(durations: &mut [u128]) -> DurationSummary {
    durations.sort_unstable();
    let mean = durations.iter().map(|value| *value as f64).sum::<f64>() / durations.len() as f64;
    let variance = durations
        .iter()
        .map(|value| {
            let delta = *value as f64 - mean;
            delta * delta
        })
        .sum::<f64>()
        / durations.len() as f64;

    DurationSummary {
        p50: percentile(durations, 0.50),
        p95: percentile(durations, 0.95),
        p99: percentile(durations, 0.99),
        mean,
        stddev: variance.sqrt(),
        min: *durations.first().unwrap(),
        max: *durations.last().unwrap(),
    }
}

fn percentile(sorted: &[u128], quantile: f64) -> u128 {
    let index = ((sorted.len() as f64 * quantile).ceil() as usize).saturating_sub(1);
    sorted[index.min(sorted.len() - 1)]
}

fn rustc_version() -> String {
    Command::new("rustc")
        .arg("--version")
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn git_revision() -> String {
    Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}
