use super::{Binding, Launch, ProcessReceipt, digest};
use super::super::{WorkerReply, raw_hash};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

pub fn executable_hash(executable: &Path) -> Result<String, String> {
    let bytes = std::fs::read(executable).map_err(|e| e.to_string())?;
    Ok(raw_hash(&bytes))
}

pub fn execute(binding: &Binding, request: Launch<'_>) -> Result<ProcessReceipt, String> {
    validate_launch(binding, &request)?;
    let started = Instant::now();
    let encoded = serde_json::to_vec(request.job).map_err(|e| e.to_string())?;
    if encoded.len() > 256 * 1024 { return Err("NATIVE_JOB_TOO_LARGE".into()); }
    let remaining=binding.expires_ms.checked_sub(super::super::now_ms())
        .filter(|value|*value>0).ok_or("MISSION_LEASE_EXPIRED")?;
    let request=Launch { executable:request.executable,job:request.job,maximum_ms:request.maximum_ms.min(remaining) };
    let mut child = ChildGuard(command(binding, &request).spawn()
        .map_err(|e| format!("native spawn failed: {e}"))?);
    let observation = observe(&mut child.0, started, (&request, &encoded))?;
    receipt(&request, observation)
}

fn validate_launch(binding: &Binding, request: &Launch<'_>) -> Result<(), String> {
    let job = request.job;
    if job.binding_digest != digest(binding)? || job.env_hash != binding.env_hash
        || job.policy_hash != binding.policy_hash || executable_hash(request.executable)? != binding.env_hash {
        return Err("NATIVE_EXECUTABLE_OR_JOB_CHANGED".into());
    }
    Ok(())
}

fn command(binding: &Binding, request: &Launch<'_>) -> Command {
    let mut command = Command::new(request.executable);
    command.arg("rust-protocol-worker").env_clear().current_dir(&binding.workspace)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    if let Some(system) = std::env::var_os("SystemRoot") { command.env("SystemRoot", system); }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

struct ChildGuard(Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

struct Observation {
    pid: u32,
    elapsed_ms: u64,
    status: ExitStatus,
    succeeded: bool,
    output: Vec<u8>,
}

fn observe(
    child: &mut Child, started: Instant, input: (&Launch<'_>, &[u8]),
) -> Result<Observation, String> {
    let (request, encoded) = input;
    let pid = child.id();
    let write = child.stdin.take().ok_or("child stdin missing")?.write_all(encoded);
    let timed_out = wait(child, (started, request.maximum_ms))?;
    let output = read_output(child)?;
    let status = child.wait().map_err(|e| e.to_string())?;
    let elapsed_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX).max(1);
    let parsed = parse_reply(&output, (request, pid));
    let succeeded = write.is_ok() && !timed_out && status.success() && parsed.is_ok();
    Ok(Observation { pid, elapsed_ms, status, succeeded, output: canonical_output(parsed) })
}

fn read_output(child: &mut Child) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    child.stdout.take().ok_or("child stdout missing")?.take(16385)
        .read_to_end(&mut output).map_err(|e| e.to_string())?;
    Ok(output)
}

fn canonical_output(parsed: Result<WorkerReply, String>) -> Vec<u8> {
    parsed.and_then(|reply| serde_json::to_value(&reply.result).map_err(|e| e.to_string()))
        .and_then(|value| serde_json::to_vec(&value).map_err(|e| e.to_string()))
        .unwrap_or_default()
}

fn receipt(request: &Launch<'_>, observation: Observation) -> Result<ProcessReceipt, String> {
    let job = request.job;
    let Observation { pid, elapsed_ms, status, succeeded, output } = observation;
    Ok(ProcessReceipt {
        binding_digest: job.binding_digest.clone(), operation_id: job.operation_id.clone(),
        worker_id: job.worker_id.clone(), input_hash: job.source_hash.clone(), decoded_input_hash: digest(&job.input)?, output_hash: raw_hash(&output),
        output, env_hash: job.env_hash.clone(), policy_hash: job.policy_hash.clone(),
        context_hash: job.context_hash.clone(), pid, elapsed_ms, role: job.role,
        exit_code: status.code().unwrap_or(-1), succeeded,
    })
}

fn wait(child: &mut std::process::Child, time: (Instant, u64)) -> Result<bool, String> {
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() { return Ok(false); }
        if time.0.elapsed() >= Duration::from_millis(time.1) {
            child.kill().map_err(|e| format!("process outcome unknown after deadline: {e}"))?;
            child.wait().map_err(|e| e.to_string())?;
            return Ok(true);
        }
        std::thread::sleep(Duration::from_millis(2));
    }
}

fn parse_reply(bytes: &[u8], target: (&Launch<'_>, u32)) -> Result<WorkerReply, String> {
    if bytes.len() > 16384 { return Err("NATIVE_PROCESS_REPLY_TOO_LARGE".into()); }
    let (request, pid) = target;
    let reply: WorkerReply = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    let job = request.job;
    let expected = (&job.binding_digest, &job.operation_id, &job.worker_id, job.role, &job.nonce,
        &job.context_hash, &job.env_hash, &job.policy_hash, &job.source_hash);
    let actual = (&reply.binding_digest, &reply.operation_id, &reply.worker_id, reply.role, &reply.nonce,
        &reply.context_hash, &reply.env_hash, &reply.policy_hash, &reply.result.source_hash);
    if expected != actual || reply.process_id != pid || reply.schema != "genos.rust-worker-reply/v1" {
        return Err("NATIVE_PROCESS_REPLY_MISMATCH".into());
    }
    Ok(reply)
}
