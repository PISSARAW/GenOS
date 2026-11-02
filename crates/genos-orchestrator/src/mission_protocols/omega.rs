use super::{Binding, Event, Store, WorkerRole, digest, raw_hash};
use super::process::ProcessReceipt;
use super::omega_store as data;
use data::sql;
use rusqlite::{OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Kind { Read, Select, CallIntegerSum, CheckIndependent, EmitCas }

impl Kind {
    pub fn predecessors(self) -> &'static [&'static str] {
        match self { Self::Read => &[], Self::Select => &["read"], Self::CallIntegerSum => &["select"],
            Self::CheckIndependent => &["producer"], Self::EmitCas => &["producer", "verifier_a", "verifier_b"] }
    }
    fn accepts_id(self, id: &str) -> bool {
        match self { Self::Read => id == "read", Self::Select => id == "select", Self::CallIntegerSum => id == "producer",
            Self::CheckIndependent => matches!(id, "verifier_a" | "verifier_b"), Self::EmitCas => id == "emit" }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Request {
    pub operation_id: String, pub kind: Kind, pub source_hash: String, pub base_hash: String, pub context_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Receipt {
    pub operation_id: String, pub binding_hash: String, pub output_hash: String,
    pub proof_hash: String, pub receipt_hash: String,
}

impl Receipt {
    fn make(binding: &Binding, values: (&str, &str, &str)) -> Result<Self, String> {
        let mut receipt = Self { operation_id: values.0.into(), binding_hash: digest(binding)?, output_hash: values.1.into(),
            proof_hash: values.2.into(), receipt_hash: String::new() };
        receipt.receipt_hash = receipt.hash()?;
        Ok(receipt)
    }
    fn hash(&self) -> Result<String, String> { digest(&(&self.operation_id, &self.binding_hash, &self.output_hash, &self.proof_hash)) }
    pub(super) fn validate(&self, binding: &Binding) -> Result<(), String> {
        if self.binding_hash != digest(binding)? || self.receipt_hash != self.hash()? { return Err("OMEGA_RECEIPT_INTEGRITY_INVALID".into()); }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Intent { pub operation_id: String, pub status: String, pub new_dispatch_authorized: bool, pub receipt: Option<Receipt> }

pub fn request(store: &mut Store, binding: &Binding, input: Request) -> Result<Intent, String> {
    if !input.kind.accepts_id(&input.operation_id) || input.source_hash.is_empty()
        || input.base_hash.is_empty() || input.context_hash.is_empty() { return Err("OMEGA_OPERATION_NOT_INSTALLED".into()); }
    store.transaction(binding, |tx| request_tx(tx, binding, &input))
}

fn request_tx(tx: &Transaction<'_>, binding: &Binding, input: &Request) -> Result<Intent, String> {
    data::ensure(tx)?;
    let previous: Option<String> = sql(tx.query_row("SELECT request_hash FROM protocol_omega_operations
        WHERE scope=$1 AND operation_id=$2", params![data::scope(binding)?, input.operation_id], |row| row.get(0)).optional())?;
    if let Some(previous) = previous { return replay(tx, (binding, input), &previous); }
    data::require_no_prior_dispatch(tx, (binding, input))?;
    data::dependencies(tx, (binding, input))?;
    insert_intent(tx, binding, input)?;
    Store::event(tx, binding, Event { protocol: "OMEGA", phase: "REQUEST_EFFECT", payload: json!(input) })?;
    authorize_installed(tx, binding, input)?;
    Ok(Intent { operation_id: input.operation_id.clone(), status: "intent".into(), new_dispatch_authorized: true, receipt: None })
}

fn insert_intent(tx: &Transaction<'_>, binding: &Binding, input: &Request) -> Result<(), String> {
    sql(tx.execute("INSERT INTO protocol_omega_operations(scope,mission_id,operation_id,binding_hash,request_hash,request_json,status)
        VALUES($1,$2,$3,$4,$5,$6,'intent')", params![data::scope(binding)?, binding.mission_id, input.operation_id, digest(binding)?, digest(input)?,
        serde_json::to_string(input).map_err(|error| error.to_string())?]))?;
    Ok(())
}

fn authorize_installed(tx: &Transaction<'_>, binding: &Binding, input: &Request) -> Result<(), String> {
    Store::event(tx, binding, Event { protocol: "OMEGA", phase: "AUTHORIZE_EFFECT",
        payload: json!({"operation_id":input.operation_id,"kind":input.kind,"policy_hash":binding.policy_hash,
            "authorization":"installed_integer_sum_profile","requires_resource_exposure":matches!(input.kind,
                Kind::CallIntegerSum | Kind::CheckIndependent)}) })
}

fn replay(tx: &Transaction<'_>, identity: (&Binding, &Request), fingerprint: &str) -> Result<Intent, String> {
    let (binding, request) = identity;
    if fingerprint != digest(request)? { return Err("OMEGA_OPERATION_CONFLICT".into()); }
    data::request(tx, (binding, &request.operation_id))?;
    let receipt = data::receipt(tx, (binding, &request.operation_id))?;
    let status = if receipt.is_some() { "completed" } else { "outcome_unknown" };
    sql(tx.execute("UPDATE protocol_omega_operations SET status=$1 WHERE scope=$2 AND operation_id=$3",
        params![status, data::scope(binding)?, request.operation_id]))?;
    Ok(Intent { operation_id: request.operation_id.clone(), status: status.into(), new_dispatch_authorized: false, receipt })
}

pub struct Data<'a> { pub operation_id: &'a str, pub source: &'a [u8] }

pub fn record_data(store: &mut Store, binding: &Binding, input: Data<'_>) -> Result<Receipt, String> {
    if input.source.len() > 1_048_576 { return Err("OMEGA_INPUT_TOO_LARGE".into()); }
    store.transaction(binding, |tx| {
        data::ensure(tx)?;
        let request = data::request(tx, (binding, input.operation_id))?;
        if !matches!(request.kind, Kind::Read | Kind::Select) || request.source_hash != raw_hash(input.source) {
            return Err("OMEGA_READ_SOURCE_CHANGED".into());
        }
        let decoded = if request.kind == Kind::Select { selected(input.source)? } else { String::new() };
        finish(tx, (binding, &request), (&raw_hash(input.source), input.source, &decoded))
    })
}

fn selected(bytes: &[u8]) -> Result<String, String> {
    let values: Vec<i64> = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    super::integer::validate(&values)?;
    digest(&values)
}

pub fn observe(store: &mut Store, binding: &Binding, proof: &ProcessReceipt) -> Result<Receipt, String> {
    proof.assert_binding(binding)?;
    let receipt = Receipt::make(binding, (proof.operation_id(), proof.output_hash(), &digest(proof)?))?;
    store.transaction(binding, |tx| {
        data::ensure(tx)?;
        let request = data::request(tx, (binding, proof.operation_id()))?;
        check_proof(tx, (binding, &request), proof)?;
        save(tx, (binding, &request), Saved { receipt: &receipt, bytes: proof.output(), decoded: proof.decoded_input_hash(), phase: "EFFECT_RECEIPT" })
    })
}

fn check_proof(tx: &Transaction<'_>, input: (&Binding, &Request), proof: &ProcessReceipt) -> Result<(), String> {
    let (binding, request) = input;
    let kind = if proof.role() == WorkerRole::Producer { Kind::CallIntegerSum } else { Kind::CheckIndependent };
    if request.kind != kind || proof.operation_id() != proof.role().as_str()
        || request.source_hash != proof.input_hash() || request.context_hash != proof.context_hash()
        || data::selected_input(tx, binding)? != proof.decoded_input_hash() || raw_hash(proof.output()) != proof.output_hash() {
        return Err("OMEGA_PROCESS_SUBJECT_MISMATCH".into());
    }
    data::dependencies(tx, (binding, request))?;
    Ok(())
}

fn finish(tx: &Transaction<'_>, input: (&Binding, &Request), result: (&str, &[u8], &str)) -> Result<Receipt, String> {
    let (binding, request) = input;
    let receipt = Receipt::make(binding, (&request.operation_id, result.0, &digest(&request)?))?;
    save(tx, input, Saved { receipt: &receipt, bytes: result.1, decoded: result.2, phase: "DATA_RECEIPT" })
}

struct Saved<'a> { receipt: &'a Receipt, bytes: &'a [u8], decoded: &'a str, phase: &'static str }

fn save(tx: &Transaction<'_>, input: (&Binding, &Request), result: Saved<'_>) -> Result<Receipt, String> {
    let (binding, request) = input;
    if let Some(previous) = data::receipt(tx, (binding, &request.operation_id))? {
        if previous != *result.receipt { return Err("OMEGA_RECEIPT_CONFLICT".into()); }
        return Ok(previous);
    }
    data::finish(tx, input, (result.receipt, result.bytes, result.decoded))?;
    Store::event(tx, binding, Event { protocol: "OMEGA", phase: result.phase, payload: json!(result.receipt) })?;
    Ok(result.receipt.clone())
}

pub(crate) struct Emission<'a> {
    pub operation_id: &'a str, pub output: &'a [u8], pub source_hash: &'a str,
    pub base_hash: &'a str, pub context_hash: &'a str, pub proof_hash: &'a str,
}

pub(crate) fn emit_tx(tx: &Transaction<'_>, binding: &Binding, effect: Emission<'_>) -> Result<Receipt, String> {
    data::ensure(tx)?;
    let request = data::request(tx, (binding, effect.operation_id))?;
    validate_emission(&request, &effect)?;
    data::dependencies(tx, (binding, &request))?;
    let output_hash = raw_hash(effect.output);
    emission_outputs(tx, binding, &output_hash)?;
    let receipt = Receipt::make(binding, (effect.operation_id, &output_hash, effect.proof_hash))?;
    save(tx, (binding, &request), Saved { receipt: &receipt, bytes: effect.output, decoded: "", phase: "EFFECT_RECEIPT" })
}

fn validate_emission(request: &Request, effect: &Emission<'_>) -> Result<(), String> {
    if request.kind != Kind::EmitCas || request.source_hash != effect.source_hash
        || request.base_hash != effect.base_hash || request.context_hash != effect.context_hash {
        return Err("OMEGA_EMIT_INTENT_REQUIRED".into());
    }
    Ok(())
}

fn emission_outputs(tx: &Transaction<'_>, binding: &Binding, output_hash: &str) -> Result<(), String> {
    for operation in ["producer", "verifier_a", "verifier_b"] {
        let observed = data::receipt(tx, (binding, operation))?.ok_or("OMEGA_INDEPENDENT_PROCESS_REQUIRED")?;
        if observed.output_hash != output_hash { return Err("OMEGA_EMIT_CANDIDATE_MISMATCH".into()); }
    }
    Ok(())
}
