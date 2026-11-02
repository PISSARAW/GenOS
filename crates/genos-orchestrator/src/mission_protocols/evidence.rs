//! Admission de preuves produites par les processus Rust installés localement.

use super::process::{ProcessEvidence, ProcessReceipt};
use super::{Binding, Event, RunSpec, Store, WorkerRole, digest};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;

const SCHEMA: &str = "genos.rust-mission-evidence/v1";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvidenceSubject {
    pub source_hash: String,
    pub result_hash: String,
    pub context_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvidenceReceipt {
    pub subject: EvidenceSubject,
    pub binding_hash: String,
    pub proof_hash: String,
    pub receipt_hash: String,
}

pub fn accept(
    store: &mut Store,
    binding: &Binding,
    evidence: &ProcessEvidence,
) -> Result<EvidenceReceipt, String> {
    evidence.assert_binding(binding)?;
    let proofs = verify_processes(binding, evidence)?;
    let receipt = make_receipt(binding, evidence, &proofs)?;
    store.transaction(binding, |tx| persist(tx, binding, (&receipt, &proofs, evidence)))
}

pub fn require(
    store: &Store,
    binding: &Binding,
    subject: &EvidenceSubject,
) -> Result<EvidenceReceipt, String> {
    require_in(&store.connection, binding, subject)
}

pub fn require_in(
    connection: &rusqlite::Connection, binding: &Binding, subject: &EvidenceSubject,
) -> Result<EvidenceReceipt, String> {
    super::store::current_checked(connection, binding)?;
    let (receipt, proofs) = load_accepted(connection, binding)?;
    verify_receipt(&receipt, binding)?;
    verify_subject_contexts(connection, binding, subject)?;
    if receipt.subject != *subject || receipt.proof_hash != digest(&proofs)? {
        return Err("EVIDENCE exact subject or proof mismatch".into());
    }
    super::store::current_checked(connection, binding)?;
    Ok(receipt)
}

fn load_accepted(
    connection: &rusqlite::Connection, binding: &Binding,
) -> Result<(EvidenceReceipt, Value), String> {
    let (serialized, proofs): (String, String) = connection.query_row(
        "SELECT receipt_json,proofs_json FROM rust_mission_evidence WHERE run_id=?1",
        [&binding.run_id], |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(error)?;
    let receipt: EvidenceReceipt = serde_json::from_str(&serialized).map_err(error)?;
    let proofs: Value = serde_json::from_str(&proofs).map_err(error)?;
    Ok((receipt, proofs))
}

fn persist(
    tx: &rusqlite::Transaction<'_>, binding: &Binding,
    data: (&EvidenceReceipt, &Value, &ProcessEvidence),
) -> Result<EvidenceReceipt, String> {
    let (receipt, proofs, evidence) = data;
    verify_request(tx, binding, evidence)?;
    verify_contexts(tx, binding, evidence)?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS rust_mission_evidence (
        run_id TEXT PRIMARY KEY, receipt_json TEXT NOT NULL, proofs_json TEXT NOT NULL
    )").map_err(error)?;
    if let Some(previous) = previous(tx, binding)? {
        verify_receipt(&previous, binding)?;
        if previous.receipt_hash != receipt.receipt_hash {
            return Err("EVIDENCE existing acceptance requires explicit revision".into());
        }
        return Ok(previous);
    }
    record_stages(tx, binding, receipt)?;
    insert(tx, binding, (receipt, proofs))?;
    Ok(receipt.clone())
}

fn previous(
    connection: &rusqlite::Connection, binding: &Binding,
) -> Result<Option<EvidenceReceipt>, String> {
    let serialized: Option<String> = connection.query_row(
        "SELECT receipt_json FROM rust_mission_evidence WHERE run_id=?1", [&binding.run_id],
        |row| row.get(0),
    ).optional().map_err(error)?;
    serialized.map(|value| serde_json::from_str(&value).map_err(error)).transpose()
}

fn insert(
    tx: &rusqlite::Transaction<'_>, binding: &Binding, data: (&EvidenceReceipt, &Value),
) -> Result<(), String> {
    let (receipt, proofs) = data;
    tx.execute("INSERT INTO rust_mission_evidence VALUES (?1,?2,?3)", params![
        binding.run_id, serde_json::to_string(receipt).map_err(error)?,
        serde_json::to_string(proofs).map_err(error)?,
    ]).map_err(error)?;
    Ok(())
}

fn verify_processes(binding: &Binding, evidence: &ProcessEvidence) -> Result<Value, String> {
    let receipts = evidence.receipts();
    let roles = [WorkerRole::Producer, WorkerRole::VerifierA, WorkerRole::VerifierB];
    let mut pids = HashSet::new();
    let mut operations = HashSet::new();
    let mut proofs = Vec::new();
    for (receipt, role) in receipts.iter().zip(roles) {
        if receipt.role() != role || !pids.insert(receipt.pid())
            || !operations.insert(receipt.operation_id().to_owned()) {
            return Err("EVIDENCE requires three distinct scoped processes".into());
        }
        verify_process_binding(receipt, (binding, evidence))?;
        if receipt.output() != receipts[0].output() || receipt.env_hash() != receipts[0].env_hash() {
            return Err("EVIDENCE verifier disagreement or environment mismatch".into());
        }
        proofs.push(json!({
            "binding": receipt.binding_digest(), "operation": receipt.operation_id(),
            "worker_id": receipt.worker_id(),
            "input": receipt.input_hash(), "decoded_input": receipt.decoded_input_hash(),
            "output": receipt.output_hash(),
            "environment": receipt.env_hash(), "policy": receipt.policy_hash(),
            "context": receipt.context_hash(), "pid": receipt.pid(),
            "role": receipt.role().as_str(), "elapsed_ms": receipt.elapsed_ms(),
        }));
    }
    Ok(Value::Array(proofs))
}

fn verify_request(
    connection: &rusqlite::Connection, binding: &Binding, evidence: &ProcessEvidence,
) -> Result<(), String> {
    let request = admitted_request(connection, binding)?;
    if digest(&request)? != binding.request_hash || request.mission_id != binding.mission_id {
        return Err("EVIDENCE admitted request binding mismatch".into());
    }
    if request.expected_sum.is_some_and(|sum| sum != evidence.result().sum) {
        return Err("EVIDENCE admitted predicate refuted".into());
    }
    Ok(())
}

fn admitted_request(connection: &rusqlite::Connection, binding: &Binding) -> Result<RunSpec, String> {
    let (serialized, event_hash): (String, String) = connection.query_row(
        "SELECT payload_json,digest FROM rust_protocol_events
         WHERE run_id=?1 AND protocol='RUNTIME' AND phase='ADMIT' ORDER BY sequence LIMIT 1",
        [&binding.run_id], |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(error)?;
    let payload: Value = serde_json::from_str(&serialized).map_err(error)?;
    if event_hash != digest(&(binding, "RUNTIME", "ADMIT", &payload))? {
        return Err("EVIDENCE native admission event digest mismatch".into());
    }
    serde_json::from_value(payload).map_err(error)
}

fn verify_contexts(
    connection: &rusqlite::Connection, binding: &Binding, evidence: &ProcessEvidence,
) -> Result<(), String> {
    let roster = super::morph::committed(connection, binding)?;
    for receipt in evidence.receipts() {
        let context = super::synapse::read_checked(connection, binding, receipt.role())?;
        verify_actor(receipt.worker_id(), &context, &roster)?;
        if context.context_hash != evidence.context_hash()
            || context.source_hash != evidence.source_hash()
            || context.input_hash != receipt.decoded_input_hash()
            || context.input.len() as u64 != evidence.result().count {
            return Err("EVIDENCE process input differs from authoritative SYNAPSE context".into());
        }
    }
    Ok(())
}

fn verify_actor(
    actor: &str, context: &super::synapse::AppliedContext,
    roster: &super::morph_types::Roster,
) -> Result<(), String> {
    let member = roster.member(context.role.as_str())?;
    if actor != context.audience || actor != member.actor_id {
        return Err("EVIDENCE process actor differs from authoritative SYNAPSE/MORPH member".into());
    }
    Ok(())
}

fn verify_subject_contexts(
    connection: &rusqlite::Connection, binding: &Binding, subject: &EvidenceSubject,
) -> Result<(), String> {
    super::morph::committed(connection, binding)?;
    for role in [WorkerRole::Producer, WorkerRole::VerifierA, WorkerRole::VerifierB] {
        let context = super::synapse::read_checked(connection, binding, role)?;
        if context.context_hash != subject.context_hash || context.source_hash != subject.source_hash {
            return Err("EVIDENCE subject context is no longer current".into());
        }
    }
    Ok(())
}

fn verify_process_binding(
    receipt: &ProcessReceipt, expected: (&Binding, &ProcessEvidence),
) -> Result<(), String> {
    let (binding, evidence) = expected;
    if receipt.binding_digest() != digest(binding)?
        || receipt.input_hash() != evidence.source_hash()
        || receipt.output_hash() != evidence.result_hash()
        || receipt.context_hash() != evidence.context_hash()
        || receipt.policy_hash() != binding.policy_hash
        || receipt.env_hash() != binding.env_hash {
        return Err("EVIDENCE process binding mismatch".into());
    }
    Ok(())
}

fn make_receipt(
    binding: &Binding,
    evidence: &ProcessEvidence,
    proofs: &Value,
) -> Result<EvidenceReceipt, String> {
    let mut receipt = EvidenceReceipt {
        subject: EvidenceSubject {
            source_hash: evidence.source_hash().into(), result_hash: evidence.result_hash().into(),
            context_hash: evidence.context_hash().into(),
        },
        binding_hash: digest(binding)?, proof_hash: digest(proofs)?, receipt_hash: String::new(),
    };
    receipt.receipt_hash = receipt_digest(&receipt)?;
    Ok(receipt)
}

fn verify_receipt(receipt: &EvidenceReceipt, binding: &Binding) -> Result<(), String> {
    if receipt.binding_hash != digest(binding)? || receipt.receipt_hash != receipt_digest(receipt)? {
        return Err("EVIDENCE acceptance binding or digest mismatch".into());
    }
    Ok(())
}

fn receipt_digest(receipt: &EvidenceReceipt) -> Result<String, String> {
    digest(&(SCHEMA, &receipt.binding_hash, &receipt.subject, &receipt.proof_hash))
}

fn record_stages(
    tx: &rusqlite::Transaction<'_>, binding: &Binding, receipt: &EvidenceReceipt,
) -> Result<(), String> {
    for phase in ["OFFER", "CHALLENGE", "EVIDENCE", "UPDATE"] {
        Store::event(tx, binding, Event { protocol: "EVIDENCE", phase, payload: json!({
            "subject": receipt.subject, "proof_hash": receipt.proof_hash,
            "receipt_hash": receipt.receipt_hash,
        }) })?;
    }
    Ok(())
}

fn error(value: impl std::fmt::Display) -> String { value.to_string() }

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::synapse::{self, AppliedContext, ContextInput};
    use super::super::morph_types::Roster;

    fn actor_fixture() -> (AppliedContext, Roster) {
        let directory = tempfile::TempDir::new().unwrap();
        let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
        let binding = store.admit(&RunSpec {
            mission_id: uuid::Uuid::new_v4().to_string(), workspace: directory.path().into(),
            objective: "identité native du producteur".into(), input_path: "input.json".into(),
            expected_sum: None, timeout_ms: 180000, env_hash: super::super::raw_hash(b"test"),
        }).unwrap();
        let roster = store.ensure_roster(&binding).unwrap();
        let context = synapse::apply(&mut store, &binding, &ContextInput {
            source_hash: super::super::raw_hash(b"[1]"), input: vec![1], role: WorkerRole::Producer,
            base_generation: 0, world_hash: super::super::raw_hash(b"null"), world_generation: 0,
        }).unwrap();
        (context, roster)
    }

    #[test]
    fn fictitious_actor_cannot_borrow_an_authoritative_context() {
        let (context, roster) = actor_fixture();
        assert!(verify_actor("fictitious-producer", &context, &roster).is_err());
    }

    #[test]
    fn actor_matching_context_but_missing_from_roster_is_rejected() {
        let (context, mut roster) = actor_fixture();
        roster.members[0].actor_id = "another-incarnation:producer".into();
        assert!(verify_actor(&context.audience, &context, &roster).is_err());
    }
}
