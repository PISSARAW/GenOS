//! Contexte typé effectivement relu avant la création des entrées des workers.

use super::{Binding, ContextCommitment, Event, Store, WorkerRole, context_digest, digest};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::json;

const SCHEMA: &str = "genos.rust-integer-sum-context/v1";

#[derive(Clone, Debug)]
pub struct ContextInput {
    pub source_hash: String,
    pub input: Vec<i64>,
    pub role: WorkerRole,
    pub base_generation: u64,
    pub world_hash: String,
    pub world_generation: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppliedContext {
    pub schema: String,
    pub source_hash: String,
    pub input_hash: String,
    pub input: Vec<i64>,
    pub context_hash: String,
    pub role: WorkerRole,
    pub audience: String,
    pub generation: u64,
    pub binding_hash: String,
    pub world_hash: String,
    pub world_generation: u64,
}

pub fn apply(
    store: &mut Store, binding: &Binding, input: &ContextInput,
) -> Result<AppliedContext, String> {
    validate_input(input)?;
    let context = make_context(binding, input)?;
    store.transaction(binding, |tx| persist(tx, binding, (input, &context)))?
        .ok_or_else(|| "SYNAPSE_BASE_STALE: canonical context and explicit rebase required".into())
}

fn persist(
    tx: &rusqlite::Transaction<'_>, binding: &Binding, data: (&ContextInput, &AppliedContext),
) -> Result<Option<AppliedContext>, String> {
    let (input, context) = data;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS rust_mission_synapse (
        run_id TEXT NOT NULL, role TEXT NOT NULL, context_json TEXT NOT NULL,
        PRIMARY KEY(run_id,role)
    )").map_err(error)?;
    let previous = load(tx, binding, input.role)?;
    if is_replay(&previous, binding, context)? { return Ok(previous); }
    let revision = previous.as_ref().map_or(0, |value| value.generation);
    if revision != input.base_generation {
        record_missing(tx, binding, input)?;
        return Ok(None);
    }
    commit_context(tx, binding, context)?;
    Ok(Some(context.clone()))
}

fn is_replay(
    previous: &Option<AppliedContext>, binding: &Binding, context: &AppliedContext,
) -> Result<bool, String> {
    let Some(previous) = previous else { return Ok(false); };
    validate(previous, binding, context.role)?;
    Ok(previous.context_hash == context.context_hash && previous.generation == context.generation)
}

fn commit_context(
    tx: &rusqlite::Transaction<'_>, binding: &Binding, context: &AppliedContext,
) -> Result<(), String> {
    record_applied(tx, binding, context)?;
    tx.execute("INSERT INTO rust_mission_synapse VALUES (?1,?2,?3)
        ON CONFLICT(run_id,role) DO UPDATE SET context_json=excluded.context_json", params![
        binding.run_id, context.role.as_str(), serde_json::to_string(context).map_err(error)?,
    ]).map_err(error)?;
    Ok(())
}

pub fn read(store: &Store, binding: &Binding, role: WorkerRole) -> Result<AppliedContext, String> {
    store.current(binding)?;
    let context = read_checked(&store.connection, binding, role)?;
    store.current(binding)?;
    Ok(context)
}

pub(crate) fn read_checked(
    connection: &rusqlite::Connection, binding: &Binding, role: WorkerRole,
) -> Result<AppliedContext, String> {
    let context = load(connection, binding, role)?
        .ok_or("SYNAPSE_CONTEXT_MISSING: canonical context required")?;
    validate(&context, binding, role)?;
    Ok(context)
}

fn make_context(binding: &Binding, input: &ContextInput) -> Result<AppliedContext, String> {
    let mut context = AppliedContext {
        schema: SCHEMA.into(), source_hash: input.source_hash.clone(),
        input_hash: digest(&input.input)?, input: input.input.clone(),
        context_hash: String::new(), role: input.role,
        audience: audience(binding, input.role),
        generation: input.base_generation.checked_add(1).ok_or("SYNAPSE generation overflow")?,
        binding_hash: digest(binding)?,
        world_hash: input.world_hash.clone(), world_generation: input.world_generation,
    };
    context.context_hash = content_hash(&context, binding)?;
    Ok(context)
}

fn content_hash(context: &AppliedContext, binding: &Binding) -> Result<String, String> {
    context_digest(binding, &ContextCommitment {
        source_hash: context.source_hash.clone(), input_hash: context.input_hash.clone(),
        base_hash: context.world_hash.clone(), base_generation: context.world_generation,
    })
}

fn validate(context: &AppliedContext, binding: &Binding, role: WorkerRole) -> Result<(), String> {
    if context.schema != SCHEMA || context.role != role || context.audience != audience(binding, role) {
        return Err("SYNAPSE_SCHEMA_OR_AUDIENCE_MISMATCH: canonical context required".into());
    }
    validate_binding(context, binding)?;
    validate_hash(&context.world_hash)?;
    validate_values(&context.source_hash, &context.input)
}

fn validate_binding(context: &AppliedContext, binding: &Binding) -> Result<(), String> {
    if context.binding_hash != digest(binding)? || context.context_hash != content_hash(context, binding)?
        || context.input_hash != digest(&context.input)? || context.generation == 0 {
        return Err("SYNAPSE_CONTEXT_BINDING_MISMATCH".into());
    }
    Ok(())
}

fn validate_input(input: &ContextInput) -> Result<(), String> {
    validate_hash(&input.world_hash)?;
    validate_values(&input.source_hash, &input.input)
}

fn validate_values(hash: &str, input: &[i64]) -> Result<(), String> {
    validate_hash(hash)?;
    super::integer::validate(input)
}

fn validate_hash(hash: &str) -> Result<(), String> {
    if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("SYNAPSE hash must identify exact native content".into());
    }
    Ok(())
}

fn load(
    connection: &rusqlite::Connection, binding: &Binding, role: WorkerRole,
) -> Result<Option<AppliedContext>, String> {
    let exists: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master
        WHERE type='table' AND name='rust_mission_synapse')", [], |row| row.get(0))
        .map_err(error)?;
    if !exists { return Ok(None); }
    let serialized: Option<String> = connection.query_row(
        "SELECT context_json FROM rust_mission_synapse WHERE run_id=?1 AND role=?2",
        params![binding.run_id, role.as_str()], |row| row.get(0),
    ).optional().map_err(error)?;
    serialized.map(|json| serde_json::from_str(&json).map_err(error)).transpose()
}

fn audience(binding: &Binding, role: WorkerRole) -> String {
    format!("{}:{}", binding.run_id, role.as_str())
}

fn record_missing(
    tx: &rusqlite::Transaction<'_>, binding: &Binding, input: &ContextInput,
) -> Result<(), String> {
    Store::event(tx, binding, Event { protocol: "SYNAPSE", phase: "REQUEST_MISSING",
        payload: json!({"role":input.role,"base_generation":input.base_generation,
            "missing":["base"],"canonical_requested":true}) })
}

fn record_applied(
    tx: &rusqlite::Transaction<'_>, binding: &Binding, context: &AppliedContext,
) -> Result<(), String> {
    for phase in ["DECLARE_CONTEXT", "OFFER_DELTA", "APPLY_DELTA", "ACK_STATE"] {
        Store::event(tx, binding, Event { protocol: "SYNAPSE", phase,
            payload: json!({"context_hash":context.context_hash,"audience":context.audience,
                "generation":context.generation,"input_hash":context.input_hash}) })?;
    }
    Ok(())
}

fn error(value: impl std::fmt::Display) -> String { value.to_string() }
