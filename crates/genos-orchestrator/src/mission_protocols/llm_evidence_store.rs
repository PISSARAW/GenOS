use super::{ArtifactEvidenceReceipt, ArtifactSubject, Binding, SealedEvidence, bindings, error, satisfied, receipt, receipt_hash};
use super::super::{Event, Store, digest, llm_omega};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde_json::json;

pub(super) fn accept(tx: &Transaction<'_>, binding: &Binding, evidence: &SealedEvidence) -> Result<ArtifactEvidenceReceipt, String> {
    let observed = llm_omega::observed_in(tx, binding, "infer")?;
    let current = bindings::current(tx, binding, &observed)?;
    if current != *evidence { return Err("LLM_EVIDENCE_QUALIFICATION_STALE".into()); }
    if !satisfied(&current) { return Err("LLM_EVIDENCE_UNRESOLVED_OR_CONTRACT_REJECTED".into()); }
    let accepted = receipt(&current)?;
    ensure_schema(tx)?;
    persist(tx, binding, (&accepted, &current))?;
    Ok(accepted)
}

fn ensure_schema(connection: &Connection) -> Result<(), String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS rust_llm_evidence (
        run_id TEXT PRIMARY KEY,receipt_json TEXT NOT NULL,proof_json TEXT NOT NULL
    )").map_err(error)
}

fn persist(tx: &Transaction<'_>, binding: &Binding, input: (&ArtifactEvidenceReceipt, &SealedEvidence)) -> Result<(), String> {
    let (receipt, core) = input;
    if let Some(previous) = previous(tx, binding)? {
        if previous != *receipt { return Err("LLM_EVIDENCE_REVISION_REQUIRED".into()); }
        return Ok(());
    }
    tx.execute("INSERT INTO rust_llm_evidence VALUES (?1,?2,?3)", params![binding.run_id,
        serde_json::to_string(receipt).map_err(error)?,serde_json::to_string(core).map_err(error)?]).map_err(error)?;
    record_stages(tx, binding, receipt)
}

fn previous(connection: &Connection, binding: &Binding) -> Result<Option<ArtifactEvidenceReceipt>, String> {
    let raw: Option<String> = connection.query_row("SELECT receipt_json FROM rust_llm_evidence WHERE run_id=?1",
        [&binding.run_id], |row| row.get(0)).optional().map_err(error)?;
    raw.map(|value| serde_json::from_str(&value).map_err(error)).transpose()
}

fn record_stages(tx: &Transaction<'_>, binding: &Binding, receipt: &ArtifactEvidenceReceipt) -> Result<(), String> {
    for phase in ["OFFER", "CHALLENGE", "EVIDENCE", "UPDATE"] {
        Store::event(tx, binding, Event { protocol:"EVIDENCE",phase,payload:json!({
            "profile":"llm_artifact","subject":receipt.subject,"assurance":receipt.assurance,
            "proof_hash":receipt.proof_hash,"receipt_hash":receipt.receipt_hash,"semantic_truth_verified":false}) })?;
    }
    Ok(())
}

pub(super) fn require(connection: &Connection, binding: &Binding, subject: &ArtifactSubject) -> Result<ArtifactEvidenceReceipt, String> {
    let (receipt, stored) = load(connection, binding)?;
    validate_receipt(&receipt, binding, subject)?;
    let observed = llm_omega::observed_in(connection, binding, "infer")?;
    let current = bindings::current(connection, binding, &observed)?;
    if current != stored || !satisfied(&current) || super::receipt(&current)? != receipt {
        return Err("LLM_EVIDENCE_ACCEPTED_PROOF_STALE".into());
    }
    Ok(receipt)
}

fn load(connection: &Connection, binding: &Binding) -> Result<(ArtifactEvidenceReceipt, SealedEvidence), String> {
    let (accepted, proof): (String, String) = connection.query_row(
        "SELECT receipt_json,proof_json FROM rust_llm_evidence WHERE run_id=?1", [&binding.run_id],
        |row| Ok((row.get(0)?,row.get(1)?)),
    ).map_err(error)?;
    Ok((serde_json::from_str(&accepted).map_err(error)?,serde_json::from_str(&proof).map_err(error)?))
}

fn validate_receipt(receipt: &ArtifactEvidenceReceipt, binding: &Binding, subject: &ArtifactSubject) -> Result<(), String> {
    if receipt.subject != *subject || receipt.binding_hash != digest(binding)?
        || receipt.receipt_hash != receipt_hash(receipt)? || receipt.assurance != super::ASSURANCE
        || receipt.semantic_truth_verified {
        return Err("LLM_EVIDENCE_EXACT_SUBJECT_OR_RECEIPT_MISMATCH".into());
    }
    Ok(())
}
