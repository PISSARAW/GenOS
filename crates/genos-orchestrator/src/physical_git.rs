//! Commandes Git en lecture seule, avec délai et plafond de sortie.
use super::physical_measurements::*;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub fn sample_git(config: &WorkspacePhysicsConfig) -> (Measurement<usize>, Measurement<usize>) {
    let dirty = git_output(
        config,
        &["status", "--porcelain=v1", "-z", "--untracked-files=no"],
    )
    .map(|output| count_dirty(&output));
    let branches = git_output(
        config,
        &["for-each-ref", "--format=%(refname)", "refs/heads"],
    )
    .map(|output| {
        output
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .count()
    });
    (
        git_measurement(dirty, "git status --porcelain -z"),
        git_measurement(branches, "git refs/heads"),
    )
}

fn git_measurement(value: Option<usize>, source: &str) -> Measurement<usize> {
    value
        .map(|value| Measurement::measured(value, source))
        .unwrap_or_else(|| Measurement::unavailable(source, MeasurementStatus::Missing))
}

fn count_dirty(output: &[u8]) -> usize {
    let mut records = output
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty());
    let mut count = 0;
    while let Some(record) = records.next() {
        count += 1;
        if record
            .iter()
            .take(2)
            .any(|byte| matches!(*byte, b'R' | b'C'))
        {
            records.next();
        }
    }
    count
}

fn git_output(config: &WorkspacePhysicsConfig, args: &[&str]) -> Option<Vec<u8>> {
    let mut child = Command::new("git")
        .args(args)
        .current_dir(&config.root)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped())
        .spawn()
        .ok()?;
    let stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout.take(256_001).read_to_end(&mut bytes).ok()?;
        (bytes.len() <= 256_000).then_some(bytes)
    });
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait().ok()? {
            let bytes = reader.join().ok().flatten();
            return status.success().then_some(bytes).flatten();
        }
        if started.elapsed() > config.scan_timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            return None;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
}
