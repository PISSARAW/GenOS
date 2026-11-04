use super::{Binding, ContextCommitment, Event, RunSpec, schema, write_gate};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub struct Store {
    pub(crate) connection: Connection,
    pub(crate) writer: std::sync::Arc<write_gate::Gate>,
}

pub fn raw_hash(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }

pub fn digest(value: &impl Serialize) -> Result<String, String> {
    let value = serde_json::to_value(value).map_err(|e| e.to_string())?;
    Ok(genos_common::evidence::digest_json(&value))
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

pub fn context_digest(binding: &Binding, data: &ContextCommitment) -> Result<String, String> {
    digest(&serde_json::json!({ "binding_hash":digest(binding)?, "source_hash":data.source_hash,
        "input_hash":data.input_hash, "base_hash":data.base_hash, "base_generation":data.base_generation }))
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        Self::open_bounded(path, Duration::from_secs(5))
    }

    pub(crate) fn open_for_binding(path: &Path, binding: &Binding) -> Result<Self, String> {
        Self::open_bounded(path, remaining(binding)?)
    }

    fn open_bounded(path: &Path, timeout: Duration) -> Result<Self, String> {
        let writer = write_gate::shared(path)?;
        let _guard = writer.acquire(timeout)?;
        let connection = Connection::open(path).map_err(|e| e.to_string())?;
        connection.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;")
            .map_err(|e| e.to_string())?;
        connection.execute_batch(schema::SQL).map_err(|e| e.to_string())?;
        Ok(Self { connection, writer })
    }

    pub fn admit(&mut self, spec: &RunSpec) -> Result<Binding, String> {
        validate_spec(spec)?;
        let _guard = self.writer.acquire(Duration::from_millis(spec.timeout_ms))?;
        let tx = self.connection.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let binding = admit_initial(&tx, spec)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(binding)
    }

    pub fn prepare_successor(&mut self, prior: &Binding) -> Result<Binding, String> {
        self.transaction(prior, |tx| {
            let mut successor = prior.clone();
            successor.run_id = uuid::Uuid::new_v4().to_string();
            successor.generation = prior.generation.checked_add(1).ok_or("generation overflow")?;
            insert_binding(tx, &successor)?;
            inherit_request(tx, (prior, &successor))?;
            Ok(successor)
        })
    }

    pub fn current(&self, binding: &Binding) -> Result<(), String> {
        current_checked(&self.connection, binding)
    }

    pub fn transaction<T>(&mut self, binding: &Binding,
        operation: impl FnOnce(&Transaction<'_>) -> Result<T, String>) -> Result<T, String> {
        let _guard = self.current_writer(binding)?;
        let tx = self.connection.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        current_checked(&tx, binding)?;
        let result = operation(&tx)?;
        current_checked(&tx, binding)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(result)
    }

    pub fn event(tx: &Transaction<'_>, binding: &Binding, event: Event) -> Result<(), String> {
        let payload = serde_json::to_string(&event.payload).map_err(|e| e.to_string())?;
        let hash = digest(&(binding, event.protocol, event.phase, &event.payload))?;
        tx.execute("INSERT INTO rust_protocol_events(run_id,protocol,phase,payload_json,digest)
            VALUES (?1,?2,?3,?4,?5)", params![binding.run_id,event.protocol,event.phase,payload,hash])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub(crate) fn observation_transaction<T>(&mut self, binding: &Binding,
        operation: impl FnOnce(&Transaction<'_>) -> Result<T, String>) -> Result<T, String> {
        let wait = binding.expires_ms.saturating_sub(now_ms()).clamp(5000, 600000);
        let _guard = self.writer.acquire(Duration::from_millis(wait))?;
        let tx = self.connection.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        historical_checked(&tx, binding)?;
        let result = operation(&tx)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(result)
    }

    pub(crate) fn succession_transaction<T>(&mut self, bindings: (&Binding, &Binding),
        operation: impl FnOnce(&Transaction<'_>) -> Result<T, String>) -> Result<T, String> {
        let _guard = self.current_writer(bindings.0)?;
        let tx = self.connection.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        current_checked(&tx, bindings.0)?;
        let result = operation(&tx)?;
        current_checked(&tx, bindings.1)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(result)
    }

    pub(crate) fn current_writer(&self, binding: &Binding) -> Result<write_gate::Guard, String> {
        match self.writer.acquire(remaining(binding)?) {
            Err(error) if error == "WRITE_GATE_TIMEOUT" && now_ms() >= binding.expires_ms => {
                Err("MISSION_LEASE_EXPIRED".into())
            }
            result => result,
        }
    }

    pub fn binding(&self, mission_id: &str) -> Result<Binding, String> {
        let value: String = self.connection.query_row("SELECT r.binding_json FROM rust_protocol_runs r
            JOIN rust_protocol_current c ON c.run_id=r.run_id WHERE c.mission_id=?1", [mission_id],
            |row| row.get(0)).map_err(|e| e.to_string())?;
        serde_json::from_str(&value).map_err(|e| e.to_string())
    }
}

fn reject_existing(tx: &Transaction<'_>, mission: &str) -> Result<(), String> {
    let existing: Option<String> = tx.query_row(
        "SELECT run_id FROM rust_protocol_current WHERE mission_id=?1", [mission],
        |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    if existing.is_some() { return Err("MISSION_ALREADY_ADMITTED: resume or explicit handoff required".into()); }
    Ok(())
}

fn admit_initial(tx: &Transaction<'_>, spec: &RunSpec) -> Result<Binding, String> {
    reject_existing(tx, &spec.mission_id)?;
    let binding = binding_for(spec, 1)?;
    insert_binding(tx, &binding)?;
    tx.execute("INSERT INTO rust_protocol_current VALUES (?1,?2,?3)",
        params![binding.mission_id, binding.run_id, binding.generation]).map_err(|e| e.to_string())?;
    Store::event(tx, &binding, Event { protocol: "RUNTIME", phase: "ADMIT",
        payload: serde_json::to_value(spec).map_err(|e| e.to_string())? })?;
    Ok(binding)
}

fn inherit_request(tx: &Transaction<'_>, bindings: (&Binding, &Binding)) -> Result<(), String> {
    let (prior, successor) = bindings;
    let (payload, expected) = admit_payload(tx, prior)?;
    if digest(&(prior,"RUNTIME","ADMIT",&payload))? != expected { return Err("ADMIT source corrupted".into()); }
    if digest(&payload)? != successor.request_hash { return Err("ADMIT successor request mismatch".into()); }
    Store::event(tx, successor, Event { protocol:"RUNTIME",phase:"ADMIT",payload })
}

fn admit_payload(tx: &Transaction<'_>, prior: &Binding) -> Result<(serde_json::Value, String), String> {
    let (raw, expected): (String, String) = tx.query_row("SELECT payload_json,digest FROM rust_protocol_events
        WHERE run_id=?1 AND protocol='RUNTIME' AND phase='ADMIT' ORDER BY sequence LIMIT 1",
        [&prior.run_id], |r| Ok((r.get(0)?,r.get(1)?))).map_err(|e| e.to_string())?;
    let payload: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok((payload, expected))
}

fn validate_spec(spec: &RunSpec) -> Result<(), String> {
    uuid::Uuid::parse_str(&spec.mission_id).map_err(|_| "mission_id must be a UUID")?;
    if spec.objective.trim().is_empty() || !(1000..=180000).contains(&spec.timeout_ms) {
        return Err("mission objective or bounded deadline invalid".into());
    }
    if spec.env_hash.len() != 64 { return Err("native executable environment hash required".into()); }
    Ok(())
}

fn binding_for(spec: &RunSpec, generation: u64) -> Result<Binding, String> {
    let workspace = spec.workspace.canonicalize().map_err(|e| e.to_string())?;
    if !workspace.is_dir() { return Err("workspace must be an existing directory".into()); }
    Ok(Binding {
        mission_id: spec.mission_id.clone(), run_id: uuid::Uuid::new_v4().to_string(),
        actor_id: format!("mission:{}", spec.mission_id), workspace: workspace.to_string_lossy().into(),
        generation, policy_hash: raw_hash(b"genos.rust.integer-sum/v1:read-bounded-json:three-processes:cas-emit"),
        request_hash: digest(spec)?, env_hash: spec.env_hash.clone(),
        expires_ms: now_ms().checked_add(spec.timeout_ms).ok_or("deadline overflow")?,
    })
}

pub(crate) fn insert_binding(tx: &Transaction<'_>, binding: &Binding) -> Result<(), String> {
    let json = serde_json::to_string(binding).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO rust_protocol_runs(run_id,mission_id,generation,workspace,policy_hash,request_hash,binding_json)
        VALUES (?1,?2,?3,?4,?5,?6,?7)", params![binding.run_id,binding.mission_id,binding.generation,
        binding.workspace,binding.policy_hash,binding.request_hash,json]).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn current_checked(connection: &Connection, binding: &Binding) -> Result<(), String> {
    let stored: Option<String> = connection.query_row("SELECT r.binding_json FROM rust_protocol_runs r
        JOIN rust_protocol_current c ON c.run_id=r.run_id AND c.generation=r.generation
        WHERE c.mission_id=?1", [&binding.mission_id], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    let expected = serde_json::to_string(binding).map_err(|e| e.to_string())?;
    if stored.as_deref() != Some(&expected) { return Err("MISSION_INCARNATION_STALE_OR_FORGED".into()); }
    if now_ms() >= binding.expires_ms { return Err("MISSION_LEASE_EXPIRED".into()); }
    Ok(())
}

fn historical_checked(connection: &Connection, binding: &Binding) -> Result<(), String> {
    let stored: Option<String> = connection.query_row("SELECT binding_json FROM rust_protocol_runs
        WHERE run_id=?1", [&binding.run_id], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    let expected = serde_json::to_string(binding).map_err(|e| e.to_string())?;
    if stored.as_deref() != Some(&expected) { return Err("MISSION_HISTORICAL_BINDING_FORGED".into()); }
    Ok(())
}

pub(crate) fn remaining(binding: &Binding) -> Result<Duration, String> {
    let wait = binding.expires_ms.saturating_sub(now_ms()).min(600000);
    if wait == 0 { return Err("MISSION_LEASE_EXPIRED".into()); }
    Ok(Duration::from_millis(wait))
}
