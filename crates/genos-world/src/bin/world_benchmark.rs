use genos_core::{AgentId, BranchId};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use serde::Serialize;
use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Instant;
use tempfile::tempdir;

#[derive(Debug, Serialize)]
struct BenchmarkReport {
    benchmark: &'static str,
    iterations: usize,
    warmups: usize,
    snapshot_size_bytes: u64,
    fork_latency_ns: DurationSummary,
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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let iterations = argument("--iterations", 500)?;
    let warmups = argument("--warmups", 20)?;
    if iterations == 0 {
        anyhow::bail!("--iterations must be greater than zero");
    }

    let root = tempdir()?;
    let seed = root.path().join("seed");
    write_fixture(&seed)?;
    let provider = DirectoryWorldProvider::new(root.path().join("state"), Some(seed))?;
    let parent = provider.create(AgentId::new(), BranchId::new()).await?;
    let snapshot = provider.snapshot(parent).await?;
    let snapshot_size_bytes = directory_size(&root.path().join("state").join("snapshots"))?;

    for _ in 0..warmups {
        let world = provider.fork(snapshot.clone()).await?;
        provider.destroy(world).await?;
    }

    let mut durations = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let started = Instant::now();
        let world = provider.fork(snapshot.clone()).await?;
        durations.push(started.elapsed().as_nanos());
        provider.destroy(world).await?;
    }

    let report = BenchmarkReport {
        benchmark: "genos-world.directory_provider_fork",
        iterations,
        warmups,
        snapshot_size_bytes,
        fork_latency_ns: summarize(&mut durations),
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
            return Ok(args
                .next()
                .ok_or_else(|| anyhow::anyhow!("{name} requires a value"))?
                .parse()?);
        }
    }
    Ok(default)
}

fn write_fixture(seed: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(seed.join("nested"))?;
    fs::write(seed.join("README.txt"), "fixed benchmark fixture\n")?;
    fs::write(
        seed.join("nested").join("payload.bin"),
        vec![b'x'; 128 * 1024],
    )?;
    Ok(())
}

fn directory_size(root: &Path) -> anyhow::Result<u64> {
    let mut size = 0;
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        if path.is_dir() {
            size += directory_size(&path)?;
        } else {
            size += fs::metadata(path)?.len();
        }
    }
    Ok(size)
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
