//! Contextes canoniques de génération et de vérification, sans autorité issue du texte.
use super::{Binding, Event, Store, WorkerRole, digest};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use genos_api::native_inference::{Generation, InferenceRequest, Message, ProviderConfig};

pub const SCHEMA: &str = "genos.rust-llm-context/v1";
pub const VERSION: u32 = 1;
const MAX_CONTEXT_BYTES: usize = 2_097_152;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct RequestIntent {
    pub operation_id: String,
    pub provider: ProviderConfig,
    pub generation: Generation,
    pub messages: Vec<Message>,
    pub max_input_tokens: u64,
    pub expires_ms: u64,
}

#[derive(Clone, Debug)]
pub struct ContextInput {
    pub payload: Value,
    pub source_hash: String,
    pub contract_hash: String,
    pub world_hash: String,
    pub world_generation: u64,
    pub role: WorkerRole,
    pub base_generation: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppliedContext {
    pub schema: String,
    pub version: u32,
    pub payload: Value,
    pub input_hash: String,
    pub source_hash: String,
    pub contract_hash: String,
    pub world_hash: String,
    pub world_generation: u64,
    pub context_hash: String,
    pub audience: String,
    pub role: WorkerRole,
    pub generation: u64,
    pub binding_hash: String,
}

pub fn apply(store: &mut Store, binding: &Binding, input: &ContextInput) -> Result<AppliedContext, String> {
    validate_input(input)?;
    let context = make_context(binding, input)?;
    store.transaction(binding, |tx| persist(tx, binding, (input, &context)))?
        .ok_or_else(|| "LLM_SYNAPSE_BASE_STALE: canonical context and explicit rebase required".into())
}

pub fn read(store: &Store, binding: &Binding, role: WorkerRole) -> Result<AppliedContext, String> {
    store.current(binding)?;
    let result = read_in(&store.connection, binding, role)?;
    store.current(binding)?;
    Ok(result)
}

pub fn read_in(connection: &Connection, binding: &Binding, role: WorkerRole) -> Result<AppliedContext, String> {
    super::store::current_checked(connection, binding)?;
    let context = load(connection, binding, role)?.ok_or("LLM_SYNAPSE_CONTEXT_MISSING")?;
    validate(&context, binding, role)?;
    Ok(context)
}

pub fn request(binding: &Binding, applied: &AppliedContext) -> Result<InferenceRequest, String> {
    validate(applied, binding, WorkerRole::Producer)?;
    let intent: RequestIntent = serde_json::from_value(applied.payload.clone()).map_err(error)?;
    if intent.operation_id != "infer" || intent.expires_ms > binding.expires_ms {
        return Err("LLM_SYNAPSE_REQUEST_SCOPE_MISMATCH".into());
    }
    Ok(InferenceRequest {
        operation_id:intent.operation_id,binding_hash:digest(binding)?,context_hash:applied.context_hash.clone(),
        actor_id:applied.audience.clone(),input_hash:applied.input_hash.clone(),provider:intent.provider,
        generation:intent.generation,messages:intent.messages,max_input_tokens:intent.max_input_tokens,
        expires_ms:intent.expires_ms,credential:None,cancelled:None,
    })
}

pub fn verifier_payload(intent: &RequestIntent, candidate: &str, contract: &super::llm_contract::TextContract) -> Value {
    json!({"request":intent,"candidate":candidate,"contract":contract})
}

pub fn context_hash(binding: &Binding, input: &ContextInput) -> Result<String, String> {
    validate_input(input)?;
    let payload_hash = digest(&input.payload)?;
    digest(&json!({"schema":SCHEMA,"version":VERSION,"binding_hash":digest(binding)?,
        "input_hash":payload_hash,"source_hash":input.source_hash,"contract_hash":input.contract_hash,
        "world_hash":input.world_hash,"world_generation":input.world_generation}))
}

fn make_context(binding: &Binding, input: &ContextInput) -> Result<AppliedContext, String> {
    Ok(AppliedContext {
        schema: SCHEMA.into(), version: VERSION, payload: input.payload.clone(),
        input_hash: digest(&input.payload)?, source_hash: input.source_hash.clone(),
        contract_hash: input.contract_hash.clone(), world_hash: input.world_hash.clone(),
        world_generation: input.world_generation, context_hash: context_hash(binding, input)?,
        audience: audience(binding, input.role), role: input.role,
        generation: input.base_generation.checked_add(1).ok_or("LLM_SYNAPSE_GENERATION_OVERFLOW")?,
        binding_hash: digest(binding)?,
    })
}

fn persist(tx: &Transaction<'_>, binding: &Binding, data: (&ContextInput, &AppliedContext)) -> Result<Option<AppliedContext>, String> {
    let (input, context) = data;
    ensure_schema(tx)?;
    let previous = load(tx, binding, input.role)?;
    if is_replay(&previous, binding, context)? { return Ok(previous); }
    if previous.as_ref().map_or(0, |value| value.generation) != input.base_generation {
        request_missing(tx, binding, input)?;
        return Ok(None);
    }
    commit_context(tx, binding, context)?;
    Ok(Some(context.clone()))
}

fn ensure_schema(connection: &Connection) -> Result<(), String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS rust_llm_synapse (
        run_id TEXT NOT NULL,role TEXT NOT NULL,context_json TEXT NOT NULL,PRIMARY KEY(run_id,role)
    )").map_err(error)
}

fn is_replay(previous: &Option<AppliedContext>, binding: &Binding, context: &AppliedContext) -> Result<bool, String> {
    let Some(previous) = previous else { return Ok(false); };
    validate(previous, binding, context.role)?;
    Ok(previous.context_hash == context.context_hash && previous.generation == context.generation)
}

fn commit_context(tx: &Transaction<'_>, binding: &Binding, context: &AppliedContext) -> Result<(), String> {
    tx.execute("INSERT INTO rust_llm_synapse VALUES (?1,?2,?3)
        ON CONFLICT(run_id,role) DO UPDATE SET context_json=excluded.context_json",
        params![binding.run_id,context.role.as_str(),serde_json::to_string(context).map_err(error)?]).map_err(error)?;
    for phase in ["DECLARE_CONTEXT", "OFFER_DELTA", "APPLY_DELTA", "ACK_STATE"] {
        Store::event(tx, binding, Event { protocol:"SYNAPSE",phase,payload:json!({
            "schema":SCHEMA,"context_hash":context.context_hash,"input_hash":context.input_hash,
            "audience":context.audience,"generation":context.generation}) })?;
    }
    Ok(())
}

fn request_missing(tx: &Transaction<'_>, binding: &Binding, input: &ContextInput) -> Result<(), String> {
    Store::event(tx, binding, Event { protocol:"SYNAPSE",phase:"REQUEST_MISSING",payload:json!({
        "schema":SCHEMA,"role":input.role,"base_generation":input.base_generation,
        "missing":["base"],"canonical_requested":true}) })
}

fn load(connection: &Connection, binding: &Binding, role: WorkerRole) -> Result<Option<AppliedContext>, String> {
    let exists: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master
        WHERE type='table' AND name='rust_llm_synapse')", [], |row| row.get(0)).map_err(error)?;
    if !exists { return Ok(None); }
    let raw: Option<String> = connection.query_row("SELECT context_json FROM rust_llm_synapse
        WHERE run_id=?1 AND role=?2", params![binding.run_id,role.as_str()], |row| row.get(0))
        .optional().map_err(error)?;
    raw.map(|value| serde_json::from_str(&value).map_err(error)).transpose()
}

fn validate(context: &AppliedContext, binding: &Binding, role: WorkerRole) -> Result<(), String> {
    if context.schema != SCHEMA || context.version != VERSION || context.role != role
        || context.audience != audience(binding, role) || context.generation == 0 {
        return Err("LLM_SYNAPSE_SCHEMA_OR_AUDIENCE_MISMATCH".into());
    }
    validate_commitment(context, binding)
}

fn validate_commitment(context: &AppliedContext, binding: &Binding) -> Result<(), String> {
    let input = ContextInput { payload:context.payload.clone(),source_hash:context.source_hash.clone(),
        contract_hash:context.contract_hash.clone(),world_hash:context.world_hash.clone(),
        world_generation:context.world_generation,role:context.role,base_generation:0 };
    if context.binding_hash != digest(binding)? || context.input_hash != digest(&context.payload)?
        || context.context_hash != context_hash(binding, &input)? {
        return Err("LLM_SYNAPSE_CONTEXT_BINDING_MISMATCH".into());
    }
    Ok(())
}

fn validate_input(input: &ContextInput) -> Result<(), String> {
    validate_hash(&input.source_hash)?;
    validate_hash(&input.contract_hash)?;
    validate_hash(&input.world_hash)?;
    if !input.payload.is_object() || serde_json::to_vec(&input.payload).map_err(error)?.len() > MAX_CONTEXT_BYTES {
        return Err("LLM_SYNAPSE_BOUNDED_OBJECT_REQUIRED".into());
    }
    Ok(())
}

fn validate_hash(value: &str) -> Result<(), String> {
    let hash = value.strip_prefix("sha256:").unwrap_or(value);
    if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("LLM_SYNAPSE_CONTENT_HASH_INVALID".into());
    }
    Ok(())
}

fn audience(binding: &Binding, role: WorkerRole) -> String { format!("{}:{}", binding.run_id, role.as_str()) }
fn error(value: impl std::fmt::Display) -> String { value.to_string() }
