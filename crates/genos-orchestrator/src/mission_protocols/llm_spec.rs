use super::{Binding, Event, Store, digest, now_ms, raw_hash};
use super::{llm_allostasis::Limits, llm_contract::TextContract};
use genos_api::native_inference::{Generation, Message, ProviderConfig};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const SCHEMA: &str = "genos.rust-llm-mission/v1";
pub const POLICY: &[u8] = b"genos.rust.llm-artifact/v1:explicit-provider:bounded-text:observed-usage:contract-evidence:cas-only";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LlmRunSpec {
    pub schema: String,
    pub mission_id: String,
    pub workspace: PathBuf,
    pub mission: String,
    pub config_path: String,
    pub config_hash: String,
    pub source_hash: String,
    pub provider: ProviderConfig,
    pub generation: Generation,
    pub messages: Vec<Message>,
    pub contract: TextContract,
    pub limits: Limits,
    pub max_input_tokens: u64,
    pub timeout_ms: u64,
    pub env_hash: String,
}

impl LlmRunSpec {
    pub fn validate(&self) -> Result<(), String> {
        uuid::Uuid::parse_str(&self.mission_id).map_err(|_| "LLM_MISSION_ID_INVALID")?;
        if self.schema != SCHEMA || self.mission.trim().is_empty() || self.mission.len() > 65536 {
            return Err("LLM_MISSION_SCHEMA_OR_PROMPT_INVALID".into());
        }
        if !(1000..=180000).contains(&self.timeout_ms) || self.limits.wall_ms > self.timeout_ms {
            return Err("LLM_DEADLINE_INVALID".into());
        }
        self.contract.validate()?;
        validate_request_config(self)
    }
}

fn validate_hashes(spec: &LlmRunSpec) -> Result<(), String> {
    if [&spec.config_hash, &spec.source_hash, &spec.env_hash].iter().any(|hash| {
        hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit())
    }) { return Err("LLM_SOURCE_OR_ENVIRONMENT_HASH_INVALID".into()); }
    if spec.max_input_tokens == 0 || spec.messages.is_empty() { return Err("LLM_REQUEST_INPUT_REQUIRED".into()); }
    Ok(())
}

fn validate_request_config(spec: &LlmRunSpec) -> Result<(),String> {
    validate_hashes(spec)?;
    genos_api::native_inference::validate_provider(&spec.provider)?;
    spec.generation.validate()?;
    super::llm_allostasis::validate_demand(&spec.limits,spec.max_input_tokens,spec.generation.max_output_tokens)?;
    let length: usize = spec.messages.iter().map(|message| message.content.len()).sum();
    if spec.messages.len()>64 || length>65536 { return Err("LLM_EFFECTIVE_MESSAGES_TOO_LARGE".into()); }
    Ok(())
}

impl Store {
    pub fn admit_llm(&mut self, spec: &LlmRunSpec) -> Result<Binding, String> {
        spec.validate()?;
        let binding = binding_for(spec)?;
        let _guard = self.current_writer(&binding)?;
        let tx = self.connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
        reject_existing(&tx, &spec.mission_id)?;
        persist_admission(&tx,&binding,spec)?;
        super::store::current_checked(&tx,&binding)?;
        tx.commit().map_err(error)?;
        Ok(binding)
    }

    pub fn llm_spec(&self, binding: &Binding) -> Result<LlmRunSpec, String> {
        admitted_in(&self.connection, binding)
    }
}

fn persist_admission(tx:&rusqlite::Transaction<'_>, binding:&Binding, spec:&LlmRunSpec) -> Result<(),String> {
    super::store::insert_binding(tx,binding)?;
    tx.execute("INSERT INTO rust_protocol_current VALUES (?1,?2,?3)",
        params![binding.mission_id,binding.run_id,binding.generation]).map_err(error)?;
    Store::event(tx,binding,Event { protocol:"RUNTIME",phase:"ADMIT",payload:serde_json::to_value(spec).map_err(error)? })
}

fn binding_for(spec: &LlmRunSpec) -> Result<Binding, String> {
    let workspace = spec.workspace.canonicalize().map_err(error)?;
    if !workspace.is_dir() { return Err("LLM_WORKSPACE_REQUIRED".into()); }
    Ok(Binding { mission_id:spec.mission_id.clone(), run_id:uuid::Uuid::new_v4().to_string(),
        actor_id:format!("mission:{}",spec.mission_id), workspace:workspace.to_string_lossy().into(),
        generation:1, policy_hash:raw_hash(POLICY), request_hash:digest(spec)?, env_hash:spec.env_hash.clone(),
        expires_ms:now_ms().checked_add(spec.timeout_ms).ok_or("LLM_DEADLINE_OVERFLOW")? })
}

fn reject_existing(connection: &Connection, mission: &str) -> Result<(), String> {
    let exists: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM rust_protocol_current WHERE mission_id=?1)",
        [mission], |row| row.get(0)).map_err(error)?;
    if exists { return Err("MISSION_ALREADY_ADMITTED: resume or explicit handoff required".into()); }
    Ok(())
}

pub(crate) fn admitted_in(connection: &Connection, binding: &Binding) -> Result<LlmRunSpec, String> {
    historical(connection, binding)?;
    let payload=checked_payload(connection,binding)?;
    let spec: LlmRunSpec = serde_json::from_value(payload).map_err(error)?;
    validate_binding(&spec, binding)?;
    Ok(spec)
}

fn checked_payload(connection: &Connection, binding: &Binding) -> Result<serde_json::Value,String> {
    let (raw, hash): (String,String) = connection.query_row("SELECT payload_json,digest FROM rust_protocol_events
        WHERE run_id=?1 AND protocol='RUNTIME' AND phase='ADMIT' ORDER BY sequence LIMIT 1",
        [&binding.run_id], |row| Ok((row.get(0)?,row.get(1)?))).map_err(error)?;
    let payload: serde_json::Value = serde_json::from_str(&raw).map_err(error)?;
    validate_payload(binding,&payload,&hash)?;
    Ok(payload)
}

fn validate_payload(binding:&Binding, payload:&serde_json::Value, hash:&str) -> Result<(),String> {
    if digest(&(binding,"RUNTIME","ADMIT",&payload))? != hash || digest(&payload)? != binding.request_hash {
        return Err("LLM_ADMISSION_CORRUPTED".into());
    }
    Ok(())
}

fn historical(connection: &Connection, binding: &Binding) -> Result<(), String> {
    let stored: Option<String> = connection.query_row("SELECT binding_json FROM rust_protocol_runs WHERE run_id=?1",
        [&binding.run_id], |row| row.get(0)).optional().map_err(error)?;
    if stored.as_deref() != Some(&serde_json::to_string(binding).map_err(error)?) {
        return Err("LLM_HISTORICAL_BINDING_FORGED".into());
    }
    Ok(())
}

fn validate_binding(spec: &LlmRunSpec, binding: &Binding) -> Result<(), String> {
    spec.validate()?;
    let workspace = spec.workspace.canonicalize().map_err(error)?;
    let identity = (spec.mission_id.as_str(), spec.env_hash.as_str(), workspace.to_string_lossy());
    if identity.0 != binding.mission_id || identity.1 != binding.env_hash || identity.2 != binding.workspace
        || binding.policy_hash != raw_hash(POLICY) { return Err("LLM_ADMISSION_BINDING_MISMATCH".into()); }
    Ok(())
}

fn error(error: impl std::fmt::Display) -> String { error.to_string() }
